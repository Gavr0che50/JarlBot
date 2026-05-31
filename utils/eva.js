const fs = require('fs');
const path = require('path');
const config = require('../config');

let DatabaseSync = null;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (err) {
  console.warn('⚠️ node:sqlite indisponible, le bot retombera sur le cache JSON local.');
}

const DEFAULT_CAEN_REGION_ID = '2395741613538603007';
const DEFAULT_LOCAL_LEAGUES_CIRCUIT_ID = '2395738311350114303';
const EVA_DATA_DB_FILE = path.join(__dirname, '..', 'eva-cache.db');
const EVA_DATA_CACHE_FILE = path.join(__dirname, '..', 'eva-data-cache.json');
const EVA_DATA_CACHE_BACKUP_FILE = path.join(__dirname, '..', 'eva-data-cache.backup.json');

let requestQueue = Promise.resolve();
let refreshPromise = null;
let schedulerStarted = false;
let adaptiveRequestDelayMs = null;
let evaDb = null;
let evaCacheMemory = null;

const requestCache = new Map();
const pendingRequests = new Map();

function getCompetitiveBaseUrl() {
  return (config.EVA_COMPETITIVE_API_BASE_URL || process.env.EVA_COMPETITIVE_API_BASE_URL || 'https://competitive.eva.gg/api')
    .replace(/\/+$/, '');
}

function getGraphqlUrl() {
  return config.EVA_GRAPHQL_URL || process.env.EVA_GRAPHQL_URL || 'https://api.eva.gg/graphql';
}

function getRateLimitDelayMs() {
  return Number(config.EVA_API_MIN_INTERVAL_MS || process.env.EVA_API_MIN_INTERVAL_MS || 117);
}

function getRequestCacheMs() {
  return Number(config.EVA_REQUEST_CACHE_MS || process.env.EVA_REQUEST_CACHE_MS || 10 * 60 * 1000);
}

function getPublicPlayerBatchSize() {
  return Number(config.EVA_PUBLIC_PLAYER_BATCH_SIZE || process.env.EVA_PUBLIC_PLAYER_BATCH_SIZE || 8);
}

function getRefreshMs() {
  return Number(config.EVA_DATA_REFRESH_MS || process.env.EVA_DATA_REFRESH_MS || 12 * 60 * 60 * 1000);
}

function getPlayerMinMatches() {
  return Number(config.EVA_PLAYER_MIN_MATCHES || process.env.EVA_PLAYER_MIN_MATCHES || config.EVA_CAEN_MIN_MATCHES || 5);
}

function getAdaptiveDelayMs() {
  if (adaptiveRequestDelayMs == null) adaptiveRequestDelayMs = getRateLimitDelayMs();
  return adaptiveRequestDelayMs;
}

function noteSuccessfulRequest() {
  adaptiveRequestDelayMs = Math.max(getRateLimitDelayMs(), Math.round(getAdaptiveDelayMs() * 0.97));
}

function noteRateLimited(retryAfterMs = 0) {
  adaptiveRequestDelayMs = Math.min(
    5000,
    Math.max(getAdaptiveDelayMs() * 1.5, retryAfterMs || 0, getRateLimitDelayMs())
  );
}

function getCaenRegionId() {
  return config.EVA_CAEN_REGION_ID || process.env.EVA_CAEN_REGION_ID || DEFAULT_CAEN_REGION_ID;
}

function getLocalLeaguesCircuitId() {
  return config.EVA_LOCAL_LEAGUES_CIRCUIT_ID || process.env.EVA_LOCAL_LEAGUES_CIRCUIT_ID || DEFAULT_LOCAL_LEAGUES_CIRCUIT_ID;
}

function getEmptyEvaCache() {
  return {
    updatedAt: 0,
    activeSeason: null,
    players: [],
    teams: [],
    localLeagueStandings: [],
    caenStandings: null,
    buildComplete: false,
  };
}

function normalizeEvaCache(cache = {}) {
  const normalizedPlayers = Array.isArray(cache.players) ? cache.players : [];
  const normalizedTeams = Array.isArray(cache.teams) ? cache.teams : [];
  const normalizedStandings = Array.isArray(cache.localLeagueStandings) ? cache.localLeagueStandings : [];

  return {
    ...getEmptyEvaCache(),
    ...cache,
    updatedAt: Number(cache.updatedAt || 0),
    activeSeason: cache.activeSeason || null,
    players: normalizedPlayers,
    teams: normalizedTeams,
    localLeagueStandings: normalizedStandings,
    caenStandings: cache.caenStandings || null,
    buildComplete: Boolean(cache.buildComplete),
  };
}

function openEvaDb() {
  if (!DatabaseSync) return null;
  if (evaDb) return evaDb;

  evaDb = new DatabaseSync(EVA_DATA_DB_FILE);
  evaDb.exec(`
    CREATE TABLE IF NOT EXISTS cache_snapshot (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  return evaDb;
}

function readJsonFile(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`Erreur lecture ${file}:`, err);
    return fallback;
  }
}

function writeJsonFile(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function readEvaCacheFromDb() {
  const db = openEvaDb();
  if (!db || !fs.existsSync(EVA_DATA_DB_FILE)) return null;

  try {
    const row = db.prepare('SELECT data FROM cache_snapshot WHERE id = 1').get();
    if (!row?.data) return null;
    return normalizeEvaCache(JSON.parse(row.data));
  } catch (err) {
    console.warn(`⚠️ Cache SQLite illisible: ${err.message}`);
    return null;
  }
}

function writeEvaCacheToDb(cache) {
  const db = openEvaDb();
  if (!db) return false;

  const payload = JSON.stringify(normalizeEvaCache(cache));
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      INSERT INTO cache_snapshot (id, data, updated_at)
      VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        data = excluded.data,
        updated_at = excluded.updated_at
    `).run(payload, Number(cache.updatedAt || Date.now()));
    db.exec('COMMIT');
    return true;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function getCacheScore(cache) {
  if (!cache || !Array.isArray(cache.players) || !Array.isArray(cache.teams)) return 0;
  const rankedTeams = cache.teams.filter(team => team.bestRanking).length;
  const localLeagueStandings = Array.isArray(cache.localLeagueStandings) ? cache.localLeagueStandings.length : 0;
  const completed = cache.buildComplete ? 100000 : 0;
  return completed + (cache.players.length * 10) + rankedTeams + cache.teams.length + localLeagueStandings;
}

function mergeTeamsWithRankings(preferredTeams = [], fallbackTeams = []) {
  const teamsById = new Map();
  for (const team of fallbackTeams) {
    if (team?.id) teamsById.set(team.id, team);
  }
  for (const team of preferredTeams) {
    if (!team?.id) continue;
    const previous = teamsById.get(team.id);
    teamsById.set(team.id, {
      ...previous,
      ...team,
      rankings: team.rankings?.length ? team.rankings : previous?.rankings || [],
      bestRanking: team.bestRanking || previous?.bestRanking || null,
    });
  }
  return [...teamsById.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

function protectCacheWrite(nextCache, currentCache) {
  if (!currentCache || !Array.isArray(currentCache.players) || !Array.isArray(currentCache.teams)) {
    return nextCache;
  }

  const nextPlayers = Array.isArray(nextCache.players) ? nextCache.players : [];
  const currentPlayers = Array.isArray(currentCache.players) ? currentCache.players : [];
  const nextTeams = Array.isArray(nextCache.teams) ? nextCache.teams : [];
  const currentTeams = Array.isArray(currentCache.teams) ? currentCache.teams : [];
  const nextRanked = nextTeams.filter(team => team.bestRanking).length;
  const currentRanked = currentTeams.filter(team => team.bestRanking).length;

  return {
    ...nextCache,
    players: nextPlayers.length < currentPlayers.length
      ? mergePlayers(nextPlayers, currentPlayers)
      : nextPlayers,
    teams: nextRanked < currentRanked
      ? mergeTeamsWithRankings(nextTeams, currentTeams)
      : nextTeams,
  };
}

function readEvaDataCache() {
  if (evaCacheMemory) return evaCacheMemory;

  const fromDb = readEvaCacheFromDb();
  if (fromDb) {
    evaCacheMemory = fromDb;
    return evaCacheMemory;
  }

  const cache = readJsonFile(EVA_DATA_CACHE_FILE, null);
  const backup = readJsonFile(EVA_DATA_CACHE_BACKUP_FILE, null);
  const bestCache = getCacheScore(backup) > getCacheScore(cache) ? backup : cache;
  if (!bestCache || !Array.isArray(bestCache.players) || !Array.isArray(bestCache.teams)) {
    evaCacheMemory = getEmptyEvaCache();
    return evaCacheMemory;
  }

  evaCacheMemory = normalizeEvaCache(bestCache);
  try {
    writeEvaCacheToDb(evaCacheMemory);
  } catch (err) {
    console.warn(`⚠️ Impossible de migrer le cache EVA vers SQLite: ${err.message}`);
  }
  return evaCacheMemory;
}

function writeEvaDataCache(cache) {
  const current = readEvaDataCache();
  const merged = normalizeEvaCache(protectCacheWrite(cache, current));
  evaCacheMemory = merged;

  try {
    writeEvaCacheToDb(merged);
  } catch (err) {
    console.warn(`⚠️ Ecriture SQLite impossible: ${err.message}`);
  }

  writeJsonFile(EVA_DATA_CACHE_FILE, merged);
  writeJsonFile(EVA_DATA_CACHE_BACKUP_FILE, merged);
}

function getCachedRequest(key) {
  const cached = requestCache.get(key);
  if (!cached || cached.expiresAt <= Date.now()) {
    requestCache.delete(key);
    return null;
  }
  return cached.value;
}

function setCachedRequest(key, value, ttl = getRequestCacheMs()) {
  requestCache.set(key, {
    expiresAt: Date.now() + ttl,
    value,
  });
  return value;
}

async function dedupeRequest(key, fetcher) {
  const cached = getCachedRequest(key);
  if (cached) return cached;
  if (pendingRequests.has(key)) return pendingRequests.get(key);

  const promise = fetcher()
    .then(value => setCachedRequest(key, value))
    .finally(() => pendingRequests.delete(key));
  pendingRequests.set(key, promise);
  return promise;
}

async function fetchWithEvaRateLimit(url, options = {}, attempt = 1, maxAttempts = 4) {
  const scheduled = requestQueue.then(async () => {
    await wait(Math.max(getRateLimitDelayMs(), Math.round(getAdaptiveDelayMs())));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  });

  requestQueue = scheduled.catch(() => null);
  const response = await scheduled;

  if (response.status !== 429) {
    noteSuccessfulRequest();
    return response;
  }

  const retryAfter = Number(response.headers.get('retry-after'));
  const retryAfterMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : attempt * 1500;
  noteRateLimited(retryAfterMs);
  if (attempt >= maxAttempts) return response;

  await wait(retryAfterMs);
  return fetchWithEvaRateLimit(url, options, attempt + 1, maxAttempts);
}

async function callCompetitive(endpoint, options = {}) {
  const headers = { Accept: 'application/json' };
  if (options.range) headers.Range = options.range;

  const response = await fetchWithEvaRateLimit(`${getCompetitiveBaseUrl()}${endpoint}`, { headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`EVA Competitive API error ${response.status}: ${text}`);
  }
  return response;
}

async function callCompetitiveJson(endpoint) {
  return dedupeRequest(`competitive:${endpoint}`, async () => {
    const response = await callCompetitive(endpoint);
    return response.json();
  });
}

function getTotalFromContentRange(contentRange) {
  const match = String(contentRange || '').match(/\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

async function callCompetitiveRange(endpoint, unit, pageSize = 100) {
  const cacheKey = `competitive-range:${endpoint}:${unit}:${pageSize}`;
  return dedupeRequest(cacheKey, async () => {
    const firstResponse = await callCompetitive(endpoint, { range: `${unit}=0-0` });
    const total = getTotalFromContentRange(firstResponse.headers.get('content-range'));
    const firstItems = await firstResponse.json();
    if (!total || total <= 1) return firstItems;

    const items = [...firstItems];
    for (let start = 1; start < total; start += pageSize) {
      const end = Math.min(start + pageSize - 1, total - 1);
      const response = await callCompetitive(endpoint, { range: `${unit}=${start}-${end}` });
      items.push(...await response.json());
    }
    return items;
  });
}

async function callEvaGraphql(query, variables = {}, { maxRetries = 4 } = {}) {
  const cacheKey = `graphql:${query}:${JSON.stringify(variables)}`;
  return dedupeRequest(cacheKey, async () => {
    const response = await fetchWithEvaRateLimit(getGraphqlUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Origin: 'https://app.eva.gg',
        Referer: 'https://app.eva.gg/',
      },
      body: JSON.stringify({ query, variables }),
    }, 1, maxRetries);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`EVA GraphQL error ${response.status}: ${text}`);
    }

    const payload = await response.json();
    if (payload.errors?.length) {
      throw new Error(payload.errors.map(error => error.message).join(' | '));
    }

    return payload.data;
  });
}

async function getActiveSeason() {
  const data = await callEvaGraphql(`
    query SeasonActive {
      seasonActive {
        id
        seasonNumber
        name
      }
    }
  `);
  return data.seasonActive;
}

async function getPublicPlayerByUsername(username, seasonId) {
  const data = await callEvaGraphql(`
    query PublicPlayer($username: String!, $seasonId: Int) {
      getPublicPlayerByUsername(username: $username) {
        id
        user {
          id
        }
        statistics(seasonId: $seasonId) {
          data {
            gameCount
            gameTime
            gameVictoryCount
            gameDefeatCount
            gameDrawCount
            kills
            deaths
            assists
            killDeathRatio
            killsByDeaths
            inflictedDamage
            bestInflictedDamage
            bestKillStreak
          }
        }
        allStatistics: statistics {
          data {
            gameCount
            gameTime
            gameVictoryCount
            gameDefeatCount
            gameDrawCount
            kills
            deaths
            assists
            killDeathRatio
            killsByDeaths
            inflictedDamage
            bestInflictedDamage
            bestKillStreak
          }
        }
      }
    }
  `, { username, seasonId: seasonId == null ? null : Number(seasonId) }, { maxRetries: 1 });
  return data.getPublicPlayerByUsername;
}

function buildPublicPlayerSelection() {
  return `
        id
        user {
          id
        }
        statistics(seasonId: $seasonId) {
          data {
            gameCount
            gameTime
            gameVictoryCount
            gameDefeatCount
            gameDrawCount
            kills
            deaths
            assists
            killDeathRatio
            killsByDeaths
            inflictedDamage
            bestInflictedDamage
            bestKillStreak
          }
        }
        allStatistics: statistics {
          data {
            gameCount
            gameTime
            gameVictoryCount
            gameDefeatCount
            gameDrawCount
            kills
            deaths
            assists
            killDeathRatio
            killsByDeaths
            inflictedDamage
            bestInflictedDamage
            bestKillStreak
          }
        }
  `;
}

function normalizePublicPlayerRecord(publicPlayer, summary, username) {
  const current = normalizeStats(publicPlayer.statistics?.data);
  const all = normalizeStats(publicPlayer.allStatistics?.data);

  return {
    id: publicPlayer.id,
    userId: publicPlayer.user?.id,
    competitiveUserId: summary.id,
    name: summary.name || username,
    username,
    teamName: summary.teamName,
    current,
    all,
  };
}

async function getPublicPlayersByUsernames(usernames, seasonId, { maxRetries = 1, swallowErrors = false } = {}) {
  const uniqueUsernames = uniqueBy(
    (usernames || [])
      .map(username => String(username || '').trim())
      .filter(Boolean),
    username => username.toLowerCase()
  );

  if (uniqueUsernames.length === 0) return new Map();

  const fields = uniqueUsernames
    .map((username, index) => `p${index}: getPublicPlayerByUsername(username: ${JSON.stringify(username)}) {${buildPublicPlayerSelection()}}`)
    .join('\n');

  try {
    const data = await callEvaGraphql(`
      query PublicPlayers($seasonId: Int) {
${fields}
      }
    `, { seasonId: seasonId == null ? null : Number(seasonId) }, { maxRetries });

    const players = new Map();
    uniqueUsernames.forEach((username, index) => {
      const player = data[`p${index}`];
      if (player) players.set(username.toLowerCase(), player);
    });
    return players;
  } catch (err) {
    if (!swallowErrors) throw err;
    console.warn(`⚠️ Batch profils publics ignoré: ${err.message}`);
    return new Map();
  }
}

async function getPublicPlayersByUsernamesAdaptive(usernames, seasonId, options = {}) {
  const uniqueUsernames = uniqueBy(
    (usernames || [])
      .map(username => String(username || '').trim())
      .filter(Boolean),
    username => username.toLowerCase()
  );

  if (uniqueUsernames.length === 0) return new Map();

  const maxBatchSize = Math.max(1, Number(options.maxBatchSize || getPublicPlayerBatchSize()));
  const maxRetriesSingle = Math.max(1, Number(options.maxRetriesSingle || 3));

  async function fetchChunk(chunk) {
    if (chunk.length === 1) {
      return getPublicPlayersByUsernames(chunk, seasonId, { maxRetries: maxRetriesSingle })
        .catch(() => new Map());
    }

    try {
      return await getPublicPlayersByUsernames(chunk, seasonId, { maxRetries: 1 });
    } catch (err) {
      if (chunk.length <= 1) return new Map();
      const middle = Math.ceil(chunk.length / 2);
      const left = await fetchChunk(chunk.slice(0, middle));
      const right = await fetchChunk(chunk.slice(middle));
      return new Map([...left, ...right]);
    }
  }

  const result = new Map();
  for (let index = 0; index < uniqueUsernames.length; index += maxBatchSize) {
    const chunk = uniqueUsernames.slice(index, index + maxBatchSize);
    const fetched = await fetchChunk(chunk);
    for (const [key, value] of fetched.entries()) {
      result.set(key, value);
    }
  }

  return result;
}

async function getAllTournaments() {
  return callCompetitiveRange('/tournaments', 'tournaments', 100);
}

async function getAllTeams() {
  return callCompetitiveRange('/teams', 'teams', 50);
}

async function getCircuitRankings() {
  return callCompetitiveRange('/circuit-rankings', 'rankings', 50);
}

async function getCurrentCompetitiveSeasonName() {
  const rankings = await getCircuitRankings();
  const latest = rankings
    .filter(ranking => ranking.discipline === 'after_humanity' && ranking.season?.name)
    .sort((a, b) => String(b.computedAt || '').localeCompare(String(a.computedAt || '')))[0];
  return latest?.season?.name || null;
}

async function getRankingItems(rankingId) {
  const params = new URLSearchParams({ ranking_ids: rankingId });
  return callCompetitiveRange(`/circuit-ranking-items?${params.toString()}`, 'items', 50);
}

async function getTournamentParticipants(tournamentId) {
  const params = new URLSearchParams({ tournament_ids: tournamentId });
  return callCompetitiveRange(`/participants?${params.toString()}`, 'participants', 50);
}

async function getTournamentMatches(tournamentId) {
  const params = new URLSearchParams({ tournament_ids: tournamentId });
  return callCompetitiveRange(`/matches?${params.toString()}`, 'matches', 50);
}

async function getCompetitivePlayer(playerUserId) {
  return callCompetitiveJson(`/player/${playerUserId}`);
}

function getEvaIdentifier(player) {
  const evaProvider = player.connectionProviders?.find(provider => provider.type === 'eva');
  return evaProvider?.identifier || null;
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function calculateKda(kills, deaths, assists) {
  if (kills == null && assists == null) return null;
  if (deaths === 0) return kills + assists;
  if (!deaths) return null;
  return Number(((kills + assists) / deaths).toFixed(2));
}

function normalizeStats(raw) {
  const stats = raw || {};
  const kills = toNumber(stats.kills);
  const deaths = toNumber(stats.deaths);
  const assists = toNumber(stats.assists) || 0;

  return {
    gameCount: toNumber(stats.gameCount),
    gameTime: toNumber(stats.gameTime),
    wins: toNumber(stats.gameVictoryCount),
    losses: toNumber(stats.gameDefeatCount),
    draws: toNumber(stats.gameDrawCount),
    kills,
    deaths,
    assists,
    killDeathRatio: toNumber(stats.killDeathRatio),
    killsByDeaths: toNumber(stats.killsByDeaths),
    inflictedDamage: toNumber(stats.inflictedDamage),
    bestInflictedDamage: toNumber(stats.bestInflictedDamage),
    bestKillStreak: toNumber(stats.bestKillStreak),
    kda: calculateKda(kills, deaths, assists),
  };
}

function getTeamAliasesFromLineup(lineup = []) {
  const aliases = new Set();
  for (const player of lineup) {
    const match = String(player.name || '').match(/^([A-Za-z0-9]{2,6}?)[xX]/);
    if (match) aliases.add(match[1].toUpperCase());
  }
  return [...aliases];
}

function indexTournamentParticipants(participants) {
  const playersById = new Map();
  const teamsById = new Map();

  for (const participant of participants) {
    const teamId = participant.team?.id;
    if (teamId) {
      const currentTeam = teamsById.get(teamId) || {
        id: teamId,
        name: participant.name || participant.team?.name || 'Equipe inconnue',
        aliases: [],
        memberCount: participant.team?.memberCount || null,
      };
      currentTeam.name = currentTeam.name || participant.name || participant.team?.name;
      currentTeam.aliases = [...new Set([...currentTeam.aliases, ...getTeamAliasesFromLineup(participant.lineup || [])])];
      teamsById.set(teamId, currentTeam);
    }

    for (const lineupPlayer of participant.lineup || []) {
      const playerUserId = lineupPlayer.playerUser?.id;
      if (!playerUserId) continue;
      const current = playersById.get(playerUserId) || {
        id: playerUserId,
        name: lineupPlayer.name,
        teamName: participant.name || participant.team?.name || null,
      };
      current.name = current.name || lineupPlayer.name;
      current.teamName = current.teamName || participant.name || participant.team?.name || null;
      playersById.set(playerUserId, current);
    }
  }

  return {
    players: [...playersById.values()],
    teams: [...teamsById.values()],
  };
}

async function discoverTournamentEntities(tournaments) {
  const playersById = new Map();
  const teamsById = new Map();

  for (const tournament of tournaments) {
    const participants = await getTournamentParticipants(tournament.id).catch(() => []);
    const indexed = indexTournamentParticipants(participants);

    for (const player of indexed.players) {
      if (!playersById.has(player.id)) playersById.set(player.id, player);
    }

    for (const team of indexed.teams) {
      const current = teamsById.get(team.id) || team;
      current.aliases = [...new Set([...(current.aliases || []), ...(team.aliases || [])])];
      teamsById.set(team.id, current);
    }
  }

  return {
    players: [...playersById.values()],
    teams: [...teamsById.values()],
  };
}

async function resolvePublicPlayers(playerSummaries, activeSeason, onProgress = null) {
  const players = [];

  for (let index = 0; index < playerSummaries.length; index += 1) {
    const summary = playerSummaries[index];
    const competitivePlayer = await getCompetitivePlayer(summary.id).catch(() => null);
    const username = competitivePlayer ? getEvaIdentifier(competitivePlayer) : null;
    if (!username) {
      if (onProgress && index > 0 && index % 25 === 0) onProgress(players, index, playerSummaries.length);
      continue;
    }

    const publicPlayer = await getPublicPlayerByUsername(username, activeSeason?.id).catch(() => null);
    if (!publicPlayer) {
      if (onProgress && index > 0 && index % 25 === 0) onProgress(players, index, playerSummaries.length);
      continue;
    }

    const current = normalizeStats(publicPlayer.statistics?.data);
    const all = normalizeStats(publicPlayer.allStatistics?.data);

    players.push({
      id: publicPlayer.id,
      userId: publicPlayer.user?.id,
      competitiveUserId: summary.id,
      name: summary.name || competitivePlayer.name || username,
      username,
      teamName: summary.teamName,
      current,
      all,
    });

    if (onProgress && players.length % 25 === 0) onProgress(players, index + 1, playerSummaries.length);
  }

  return uniqueBy(players, player => player.username.toLowerCase())
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

async function resolvePublicPlayerSummary(summary, activeSeason, knownUsername = null) {
  let username = knownUsername;
  if (!username) {
    const competitivePlayer = await getCompetitivePlayer(summary.id).catch(() => null);
    username = competitivePlayer ? getEvaIdentifier(competitivePlayer) : null;
  }
  if (!username) return null;

  const publicPlayer = await getPublicPlayerByUsername(username, activeSeason?.id).catch(() => null);
  if (!publicPlayer) return null;

  return normalizePublicPlayerRecord(publicPlayer, summary, username);
}

async function refreshKnownPlayers(existingPlayers, activeSeason, baseCache) {
  const refreshed = [];
  const knownPlayers = uniqueBy(
    (existingPlayers || []).filter(player => player?.username),
    player => player.username.toLowerCase()
  );
  const batchSize = Math.max(1, getPublicPlayerBatchSize());

  for (let index = 0; index < knownPlayers.length; index += batchSize) {
    const batch = knownPlayers.slice(index, index + batchSize);
    const publicPlayersByUsername = await getPublicPlayersByUsernamesAdaptive(
      batch.map(player => player.username),
      activeSeason?.id
    )
      .catch(err => {
        console.warn(`⚠️ Refresh joueurs connus impossible pour le lot ${index + 1}-${index + batch.length}: ${err.message}`);
        return new Map();
      });

    for (const existing of batch) {
      const publicPlayer = publicPlayersByUsername.get(existing.username.toLowerCase());
      if (!publicPlayer) continue;

      const normalized = normalizePublicPlayerRecord(publicPlayer, existing, existing.username);
      if (!normalized) continue;

      refreshed.push({
        ...normalized,
        competitiveUserId: existing.competitiveUserId,
        name: existing.name || normalized.name,
        teamName: existing.teamName || normalized.teamName,
      });
    }

    const partial = uniqueBy(refreshed, item => item.username.toLowerCase())
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    writeEvaDataCache({
      ...baseCache,
      updatedAt: Date.now(),
      players: mergePlayers(partial, baseCache.players || []),
    });
    console.log(`📊 Refresh joueurs connus : ${partial.length}/${knownPlayers.length}.`);
  }

  return uniqueBy(refreshed, item => item.username.toLowerCase())
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

function normalizeTeam(team) {
  return {
    id: team.id,
    name: String(team.name || 'Equipe inconnue').trim(),
    aliases: [],
    memberCount: team.memberCount || null,
    rankings: [],
  };
}

function normalizeRankingTeam(item, ranking) {
  const properties = item.properties || {};
  return {
    rankingId: ranking.id,
    rankingName: ranking.name,
    circuitId: ranking.circuit?.id || null,
    circuitName: ranking.circuit?.name || null,
    seasonName: ranking.season?.name || null,
    seasonId: ranking.season?.id || null,
    regionName: ranking.region?.name || null,
    regionId: ranking.region?.id || null,
    computedAt: ranking.computedAt || null,
    rank: item.rank,
    position: item.position,
    points: Number(item.points || 0),
    played: Number(properties.played || 0),
    wins: Number(properties.wins || 0),
    draws: Number(properties.draws || 0),
    losses: Number(properties.losses || 0),
    forfeits: Number(properties.forfeits || 0),
  };
}

async function buildTeamsSnapshot(allTeams, tournamentTeams, activeSeason) {
  const teamsById = new Map();

  for (const team of allTeams) {
    teamsById.set(team.id, normalizeTeam(team));
  }

  for (const team of tournamentTeams) {
    const current = teamsById.get(team.id) || normalizeTeam(team);
    current.name = current.name || team.name;
    current.aliases = [...new Set([...(current.aliases || []), ...(team.aliases || [])])];
    teamsById.set(team.id, current);
  }

  const rankings = (await getCircuitRankings())
    .filter(ranking =>
      ranking.entityType === 'team' &&
      ranking.discipline === 'after_humanity' &&
      (!activeSeason?.name || ranking.season?.name === activeSeason.name)
    );

  for (const ranking of rankings) {
    const items = await getRankingItems(ranking.id).catch(() => []);
    for (const item of items) {
      const teamId = item.entity?.entityId;
      if (!teamId) continue;

      const current = teamsById.get(teamId) || {
        id: teamId,
        name: String(item.entity?.name || 'Equipe inconnue').trim(),
        aliases: [],
        memberCount: null,
        rankings: [],
      };
      current.name = current.name || String(item.entity?.name || '').trim();
      current.rankings.push(normalizeRankingTeam(item, ranking));
      teamsById.set(teamId, current);
    }
  }

  return [...teamsById.values()]
    .map(team => ({
      ...team,
      bestRanking: getBestTeamRanking(team.rankings),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

function getBestTeamRanking(rankings = []) {
  const ranked = rankings
    .filter(ranking => ranking.points != null)
    .sort((a, b) =>
      b.points - a.points ||
      (a.rank || 9999) - (b.rank || 9999) ||
      String(b.computedAt || '').localeCompare(String(a.computedAt || ''))
    );
  return ranked[0] || null;
}

async function buildLocalLeagueStandings(tournaments, activeSeason) {
  const rankings = (await getCircuitRankings())
    .filter(ranking =>
      ranking.circuit?.id === getLocalLeaguesCircuitId() &&
      ranking.entityType === 'team' &&
      (!activeSeason?.name || ranking.season?.name === activeSeason.name)
    )
    .sort((a, b) => String(b.computedAt || '').localeCompare(String(a.computedAt || '')));

  const latestRankingsByRegion = new Map();
  for (const ranking of rankings) {
    const regionId = ranking.region?.id || null;
    if (!regionId || latestRankingsByRegion.has(regionId)) continue;
    latestRankingsByRegion.set(regionId, ranking);
  }

  const standings = [];
  for (const ranking of latestRankingsByRegion.values()) {
    const rankingItems = await getRankingItems(ranking.id).catch(() => []);
    const regionTournaments = tournaments.filter(tournament =>
      tournament.circuitRegion?.id === ranking.region?.id &&
      tournament.circuitSeason?.id === ranking.season?.id
    );
    const divisionContext = await buildDivisionContext(regionTournaments);

    standings.push({
      regionId: ranking.region?.id || null,
      regionName: ranking.region?.name || null,
      rankingId: ranking.id,
      rankingName: ranking.name,
      seasonId: ranking.season?.id || null,
      seasonName: ranking.season?.name || null,
      computedAt: ranking.computedAt || null,
      teams: rankingItems
        .map(item => normalizeLocalLeagueRankingItem(item, divisionContext))
        .sort(compareTeamsForStandings),
    });
  }

  return standings.sort((a, b) => String(a.regionName || '').localeCompare(String(b.regionName || ''), 'fr'));
}

async function buildDivisionContext(tournaments) {
  const context = new Map();

  for (const tournament of tournaments) {
    const [participants, matches] = await Promise.all([
      getTournamentParticipants(tournament.id).catch(() => []),
      getTournamentMatches(tournament.id).catch(() => []),
    ]);

    const participantsById = new Map(participants.map(participant => [participant.id, participant]));

    for (const match of matches) {
      for (const opponent of match.opponents || []) {
        const participant = participantsById.get(opponent.participant?.id) || opponent.participant;
        const teamId = participant?.team?.id || opponent.participant?.team?.id;
        if (!teamId) continue;

        const current = context.get(teamId) || {
          division: null,
          aliases: [],
          lineup: [],
          lastMatch: null,
        };

        if (match.group?.name) current.division = match.group.name;
        if (participant?.lineup?.length) {
          current.lineup = participant.lineup.map(player => player.name).filter(Boolean);
          current.aliases = getTeamAliasesFromLineup(participant.lineup);
        }
        if (match.playedAt && (!current.lastMatch || String(match.playedAt).localeCompare(String(current.lastMatch.playedAt || '')) > 0)) {
          current.lastMatch = {
            playedAt: match.playedAt,
            opponents: (match.opponents || []).map(item => ({
              name: item.participant?.name || item.participant?.team?.name || 'Equipe inconnue',
              score: item.score,
              result: item.result,
            })),
          };
        }

        context.set(teamId, current);
      }
    }
  }

  return context;
}

function normalizeLocalLeagueRankingItem(item, divisionContext) {
  const teamId = item.entity?.entityId;
  const context = divisionContext.get(teamId) || {};
  const properties = item.properties || {};

  return {
    id: teamId || item.entity?.name,
    name: String(item.entity?.name || 'Equipe inconnue').trim(),
    aliases: context.aliases || [],
    division: context.division || 'Division inconnue',
    divisionNumber: parseDivisionNumber(context.division),
    rank: item.rank,
    position: item.position,
    points: Number(item.points || 0),
    played: Number(properties.played || 0),
    wins: Number(properties.wins || 0),
    draws: Number(properties.draws || 0),
    losses: Number(properties.losses || 0),
    forfeits: Number(properties.forfeits || 0),
    lineup: context.lineup || [],
    lastMatch: context.lastMatch || null,
  };
}

function getCaenStanding(cache = readEvaDataCache()) {
  return (cache.localLeagueStandings || []).find(standing => standing.regionId === getCaenRegionId()) || cache.caenStandings || null;
}

function parseDivisionNumber(name) {
  const match = String(name || '').match(/division\s*(\d+)/i);
  return match ? Number(match[1]) : 999;
}

function compareTeamsForStandings(a, b) {
  return a.divisionNumber - b.divisionNumber ||
    b.points - a.points ||
    b.wins - a.wins ||
    a.name.localeCompare(b.name, 'fr');
}

function uniqueBy(items, getKey) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = getKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function mergePlayers(preferredPlayers = [], fallbackPlayers = []) {
  const playersByUsername = new Map();
  for (const player of fallbackPlayers) {
    const key = player?.username?.toLowerCase();
    if (key) playersByUsername.set(key, player);
  }
  for (const player of preferredPlayers) {
    const key = player?.username?.toLowerCase();
    if (key) playersByUsername.set(key, player);
  }
  return [...playersByUsername.values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

function getCacheAgeMs(cache = readEvaDataCache()) {
  return Date.now() - Number(cache.updatedAt || 0);
}

function isCacheStale(cache = readEvaDataCache()) {
  return !cache.updatedAt ||
    !cache.buildComplete ||
    getCacheAgeMs(cache) >= getRefreshMs() ||
    !Array.isArray(cache.players) ||
    cache.players.length === 0 ||
    !Array.isArray(cache.teams) ||
    !Array.isArray(cache.localLeagueStandings) ||
    cache.localLeagueStandings.length === 0 ||
    !cache.teams.some(team => team.bestRanking) ||
    cache.teams.some(team => team.bestRanking && !('circuitId' in team.bestRanking));
}

async function refreshEvaDataCache({ force = false } = {}) {
  if (refreshPromise) return refreshPromise;

  const current = readEvaDataCache();
  if (!force && current.updatedAt && !isCacheStale(current)) return current;

  refreshPromise = (async () => {
    console.log('📊 Mise à jour du cache EVA...');
    const activeSeason = await getActiveSeason();
    const tournaments = (await getAllTournaments())
      .filter(tournament => tournament.discipline === 'after_humanity' && tournament.public !== false);
    const allTeams = await getAllTeams();
    const initialTeams = allTeams.map(normalizeTeam).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    const localLeagueStandingsPromise = buildLocalLeagueStandings(tournaments, activeSeason);
    const teamsWithRankingsPromise = buildTeamsSnapshot(allTeams, [], activeSeason);

    const partialCache = {
      updatedAt: Date.now(),
      activeSeason,
      players: current.players || [],
      teams: initialTeams,
      localLeagueStandings: current.localLeagueStandings || [],
      caenStandings: current.caenStandings || null,
      buildComplete: false,
    };
    writeEvaDataCache(partialCache);
    console.log(`📊 Cache EVA de base mis à jour (${initialTeams.length} équipe(s)). Scan rankings/joueurs en cours...`);

    const refreshedKnownPlayers = await refreshKnownPlayers(current.players || [], activeSeason, partialCache);
    const knownPlayers = mergePlayers(refreshedKnownPlayers, current.players || []);
    writeEvaDataCache({
      ...partialCache,
      updatedAt: Date.now(),
      players: knownPlayers,
      buildComplete: false,
    });

    const teamsWithRankings = await teamsWithRankingsPromise;
    const rankedCache = {
      ...partialCache,
      updatedAt: Date.now(),
      teams: teamsWithRankings,
      buildComplete: false,
    };
    writeEvaDataCache(rankedCache);
    console.log(`📊 Cache EVA rankings équipes mis à jour (${teamsWithRankings.filter(team => team.bestRanking).length} équipe(s) classée(s)). Scan joueurs en cours...`);

    const localLeagueStandings = await localLeagueStandingsPromise;
    const caenStandings = localLeagueStandings.find(standing => standing.regionId === getCaenRegionId()) || null;
    writeEvaDataCache({
      ...rankedCache,
      updatedAt: Date.now(),
      players: knownPlayers,
      localLeagueStandings,
      caenStandings,
      buildComplete: false,
    });

    const players = [...knownPlayers];
    const seenPlayerIds = new Set(knownPlayers.map(player => player.competitiveUserId).filter(Boolean));
    const knownUsernamesByCompetitiveId = new Map(
      knownPlayers
        .filter(player => player.competitiveUserId && player.username)
        .map(player => [player.competitiveUserId, player.username])
    );
    let scanned = 0;

    const tournamentsToScan = tournaments;
    for (let tournamentIndex = 0; tournamentIndex < tournamentsToScan.length; tournamentIndex += 1) {
      const tournament = tournamentsToScan[tournamentIndex];
      if (tournamentIndex % 10 === 0) {
        console.log(`📊 Scan joueurs EVA : tournoi ${tournamentIndex + 1}/${tournamentsToScan.length}...`);
      }
      const participants = await getTournamentParticipants(tournament.id).catch(() => []);
      const summaries = indexTournamentParticipants(participants).players;

      for (const summary of summaries) {
        if (seenPlayerIds.has(summary.id)) continue;
        seenPlayerIds.add(summary.id);
        scanned += 1;

        const player = await resolvePublicPlayerSummary(
          summary,
          activeSeason,
          knownUsernamesByCompetitiveId.get(summary.id) || null
        );
        if (player) players.push(player);
        if (player?.competitiveUserId && player.username) {
          knownUsernamesByCompetitiveId.set(player.competitiveUserId, player.username);
        }

        if (scanned % 5 === 0 || (player && players.length % 10 === 0)) {
          const partialPlayers = mergePlayers(players, current.players || []);
          writeEvaDataCache({
            ...rankedCache,
            updatedAt: Date.now(),
            players: partialPlayers,
            buildComplete: false,
          });
          console.log(`📊 Scan joueurs EVA : ${partialPlayers.length} public(s), ${scanned} vérifié(s).`);
        }
      }
    }

    const finalPlayers = mergePlayers(players, current.players || []);
    const cache = {
      ...rankedCache,
      updatedAt: Date.now(),
      players: finalPlayers,
      localLeagueStandings,
      caenStandings,
      buildComplete: true,
    };
    writeEvaDataCache(cache);
    console.log(`📊 Cache EVA mis à jour (${finalPlayers.length} joueur(s), ${rankedCache.teams.length} équipe(s)).`);
    return cache;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

function startEvaCacheRefreshScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const run = () => {
    refreshEvaDataCache()
      .catch(err => console.error('❌ Mise à jour cache EVA impossible :', err));
  };

  run();
  setInterval(run, getRefreshMs());
}

async function getCaenPublicPlayers() {
  startEvaCacheRefreshScheduler();
  return readEvaDataCache().players;
}

function getAllEvaTeams() {
  return readEvaDataCache().teams;
}

function getCaenStandings() {
  const standings = getCaenStanding();
  if (!standings) throw new Error('Classement JARL Caen absent du cache EVA.');
  return standings;
}

function getLocalLeagueStandings() {
  const cache = readEvaDataCache();
  if (Array.isArray(cache.localLeagueStandings) && cache.localLeagueStandings.length > 0) {
    return cache.localLeagueStandings;
  }
  return cache.caenStandings ? [cache.caenStandings] : [];
}

function findLocalLeagueStanding(siteQuery) {
  const query = String(siteQuery || '').trim().toLowerCase();
  if (!query) return null;

  return getLocalLeagueStandings().find(standing =>
    standing.regionId === siteQuery ||
    (standing.regionName || '').toLowerCase() === query ||
    (standing.rankingName || '').toLowerCase() === query ||
    (standing.regionName || '').toLowerCase().includes(query) ||
    (standing.rankingName || '').toLowerCase().includes(query)
  ) || null;
}

function findPlayer(username) {
  const query = String(username || '').trim().toLowerCase();
  return readEvaDataCache().players.find(player =>
    player.username.toLowerCase() === query ||
    player.name.toLowerCase() === query
  ) || null;
}

function findTeam(teamQuery) {
  const query = String(teamQuery || '').trim().toLowerCase();
  const teams = readEvaDataCache().teams;
  return teams.find(team =>
    team.name.toLowerCase() === query ||
    (team.aliases || []).some(alias => alias.toLowerCase() === query)
  ) || teams.find(team =>
    team.name.toLowerCase().includes(query) ||
    (team.aliases || []).some(alias => alias.toLowerCase().includes(query))
  ) || null;
}

function getPlayerKdaStats(username) {
  const player = findPlayer(username);
  if (!player) throw new Error('Joueur absent du cache EVA ou profil non public.');
  return {
    playerName: player.username,
    playerId: player.id,
    userId: player.userId,
    seasonId: readEvaDataCache().activeSeason?.id,
    seasonNumber: readEvaDataCache().activeSeason?.seasonNumber,
    current: player.current,
    all: player.all,
  };
}

function getCaenTeamStats(teamQuery) {
  const cache = readEvaDataCache();
  const query = String(teamQuery || '').trim().toLowerCase();
  const localStandings = Array.isArray(cache.localLeagueStandings) && cache.localLeagueStandings.length > 0
    ? cache.localLeagueStandings
    : cache.caenStandings
      ? [cache.caenStandings]
      : [];

  let matchedStanding = null;
  let matchedTeam = localStandings
    .flatMap(standing => (standing.teams || []).map(team => ({ standing, team })))
    .find(({ team }) =>
      team.name.toLowerCase() === query ||
      (team.aliases || []).some(alias => alias.toLowerCase() === query)
    ) || null;

  if (!matchedTeam) {
    matchedTeam = localStandings
      .flatMap(standing => (standing.teams || []).map(team => ({ standing, team })))
      .find(({ team }) =>
        team.name.toLowerCase().includes(query) ||
        (team.aliases || []).some(alias => alias.toLowerCase().includes(query))
      ) || null;
  }

  if (matchedTeam) {
    matchedStanding = matchedTeam.standing;
  }

  const team = matchedTeam?.team || findTeam(teamQuery);

  if (!team) throw new Error('Equipe absente du cache EVA.');

  const standing = matchedStanding || localStandings.find(item => (item.teams || []).some(entry => entry.id === team.id)) || null;
  const teamsInDivision = standing?.teams
    ?.filter(item => item.divisionNumber === team.divisionNumber)
    ?.sort(compareTeamsForStandings) || [];
  const ranking = team.bestRanking || {};

  return {
    ...team,
    division: team.division || ranking.regionName || 'EVA',
    points: team.points ?? ranking.points ?? 0,
    played: team.played ?? ranking.played ?? 0,
    wins: team.wins ?? ranking.wins ?? 0,
    draws: team.draws ?? ranking.draws ?? 0,
    losses: team.losses ?? ranking.losses ?? 0,
    rank: team.rank ?? ranking.rank ?? null,
    position: team.position ?? ranking.position ?? null,
    lineup: team.lineup || [],
    lastMatch: team.lastMatch || null,
    rankingName: standing ? standing.rankingName : ranking.rankingName || null,
    seasonName: standing ? standing.seasonName : ranking.seasonName || null,
    computedAt: standing ? standing.computedAt : ranking.computedAt || null,
    regionName: standing ? standing.regionName : ranking.regionName || null,
    divisionRank: teamsInDivision.findIndex(item => item.id === team.id) + 1,
    divisionTeamCount: teamsInDivision.length,
  };
}

function getTopPlayers(limit = 10) {
  return readEvaDataCache().players
    .filter(player => player.current?.gameCount > 0 && player.current?.kda != null)
    .sort((a, b) =>
      (b.current.kda || 0) - (a.current.kda || 0) ||
      (b.current.gameCount || 0) - (a.current.gameCount || 0)
    )
    .slice(0, limit);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  getAllEvaTeams,
  getCaenPublicPlayers,
  getCaenStandings,
  getCaenTeamStats,
  getLocalLeagueStandings,
  getPlayerKdaStats,
  getTopPlayers,
  refreshEvaDataCache,
  startEvaCacheRefreshScheduler,
  findLocalLeagueStanding,
};
