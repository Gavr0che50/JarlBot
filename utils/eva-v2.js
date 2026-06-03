const path = require('path');
const fs = require('fs');
const config = require('../config');

let DatabaseSync = null;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (err) {
  console.warn('node:sqlite unavailable; EVA v2 cache cannot start.');
}

const DB_FILE = path.join(__dirname, '..', 'eva-cache.db');
const COMPETITIVE_BASE_URL = (process.env.EVA_COMPETITIVE_API_BASE_URL || config.EVA_COMPETITIVE_API_BASE_URL || 'https://competitive.eva.gg/api').replace(/\/+$/, '');
const COMPETITIVE_MEDIA_BASE_URL = new URL(COMPETITIVE_BASE_URL).origin;
const GRAPHQL_URL = process.env.EVA_GRAPHQL_URL || config.EVA_GRAPHQL_URL || 'https://api.eva.gg/graphql';
const MAJOR_TOURNAMENT_IDS = parseList(process.env.EVA_MAJOR_TOURNAMENT_IDS || config.EVA_MAJOR_TOURNAMENT_IDS || '2385727403616917503');
const LOCAL_LEAGUES_CIRCUIT_ID = process.env.EVA_LOCAL_LEAGUES_CIRCUIT_ID || config.EVA_LOCAL_LEAGUES_CIRCUIT_ID || '2395738311350114303';
const CACHE_TTL_MS = Number(process.env.EVA_V2_CACHE_TTL_MS || config.EVA_V2_CACHE_TTL_MS || 24 * 60 * 60 * 1000);
const HTTP_MIN_INTERVAL_MS = Number(process.env.EVA_V2_MIN_INTERVAL_MS || config.EVA_V2_MIN_INTERVAL_MS || 120);
const HTTP_TIMEOUT_MS = Number(process.env.EVA_V2_HTTP_TIMEOUT_MS || config.EVA_V2_HTTP_TIMEOUT_MS || 10000);
const TEAM_MEMBER_REFRESH_LIMIT = Number(process.env.EVA_V2_TEAM_MEMBER_REFRESH_LIMIT || config.EVA_V2_TEAM_MEMBER_REFRESH_LIMIT || 250);
const TEAM_MEMBER_FULL_REFRESH_LIMIT = Number(process.env.EVA_V2_TEAM_MEMBER_FULL_REFRESH_LIMIT || config.EVA_V2_TEAM_MEMBER_FULL_REFRESH_LIMIT || 2000);
const MAJOR_PLAYER_REFRESH_LIMIT = Number(process.env.EVA_V2_MAJOR_PLAYER_REFRESH_LIMIT || config.EVA_V2_MAJOR_PLAYER_REFRESH_LIMIT || 20);
const MAJOR_PLAYER_FULL_REFRESH_LIMIT = Number(process.env.EVA_V2_MAJOR_PLAYER_FULL_REFRESH_LIMIT || config.EVA_V2_MAJOR_PLAYER_FULL_REFRESH_LIMIT || 100);
const TOP_LIMIT = Number(process.env.EVA_TOP_PLAYERS_LIMIT || config.EVA_TOP_PLAYERS_LIMIT || 10);
const TOURNAMENT_MATCH_REFRESH_LIMIT = Number(process.env.EVA_V2_TOURNAMENT_MATCH_REFRESH_LIMIT || config.EVA_V2_TOURNAMENT_MATCH_REFRESH_LIMIT || 40);

let dbInstance = null;
let lastHttpAt = 0;
let refreshPromise = null;
let activeSeasonCache = null;
let refreshState = {
  active: false,
  kind: null,
  startedAt: null,
  lastCompletedAt: null,
  lastError: null,
};

function parseList(value) {
  return String(value || '')
    .split(/[,\s;]+/)
    .map(item => item.trim())
    .filter(Boolean);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function now() {
  return Date.now();
}

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9#]+/g, '');
}

function splitUsernameBase(username) {
  return String(username || '').split('#')[0] || '';
}

function getEvaLogoId(source) {
  const logo = source?.logo ?? source;
  if (!logo) return null;
  if (typeof logo === 'string' || typeof logo === 'number') return String(logo);
  return logo.id ? String(logo.id) : null;
}

function buildEvaMediaUrl(source, variant = 'logo_medium') {
  const logoId = getEvaLogoId(source);
  return logoId ? `${COMPETITIVE_MEDIA_BASE_URL}/media/file/${logoId}/${variant}` : null;
}

function buildPlayerSummary(player) {
  if (!player) return null;
  return {
    playerId: player.player_user_id,
    name: player.display_name || splitUsernameBase(player.eva_username) || player.name,
    username: player.eva_username,
    teamId: player.team_id,
    teamName: player.team_name,
    teamLogoUrl: player.team_logo_url || player.logo_url,
    leagueName: player.current_ranking_name,
    locationName: player.current_region_name,
  };
}

function createPlayerStatsUnavailableError(player, message) {
  const err = new Error(message);
  err.player = buildPlayerSummary(player);
  err.isEvaPlayerStatsUnavailable = true;
  return err;
}

function safeJsonParse(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function openDb() {
  if (!DatabaseSync) throw new Error('node:sqlite indisponible avec cette version de Node.js.');
  if (dbInstance) return dbInstance;

  const db = new DatabaseSync(DB_FILE);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA cache_size = -64000;
    PRAGMA temp_store = MEMORY;
    PRAGMA mmap_size = 30000000;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS eva_v2_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS eva_v2_locations (
      location_id INTEGER PRIMARY KEY,
      identifier TEXT,
      name TEXT NOT NULL,
      country TEXT,
      search_key TEXT NOT NULL,
      refreshed_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS eva_v2_rankings (
      ranking_id TEXT PRIMARY KEY,
      ranking_name TEXT NOT NULL,
      circuit_id TEXT,
      circuit_name TEXT,
      season_id TEXT,
      season_name TEXT,
      region_id TEXT,
      region_name TEXT,
      logo_id TEXT,
      logo_url TEXT,
      entity_type TEXT,
      computed_at TEXT,
      search_key TEXT NOT NULL,
      refreshed_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS eva_v2_teams (
      team_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      search_key TEXT NOT NULL,
      logo_id TEXT,
      logo_url TEXT,
      member_count INTEGER,
      current_ranking_id TEXT,
      current_ranking_name TEXT,
      current_region_id TEXT,
      current_region_name TEXT,
      current_season_name TEXT,
      current_rank INTEGER,
      current_position INTEGER,
      current_points REAL,
      current_played INTEGER,
      current_wins INTEGER,
      current_draws INTEGER,
      current_losses INTEGER,
      previous_rank INTEGER,
      previous_points REAL,
      previous_played INTEGER,
      trend_label TEXT,
      roster_refreshed_at INTEGER NOT NULL DEFAULT 0,
      refreshed_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS eva_v2_ranking_items (
      ranking_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      team_name TEXT NOT NULL,
      region_id TEXT,
      region_name TEXT,
      season_name TEXT,
      rank INTEGER,
      position INTEGER,
      points REAL,
      played INTEGER,
      wins INTEGER,
      draws INTEGER,
      losses INTEGER,
      forfeits INTEGER,
      refreshed_at INTEGER NOT NULL,
      PRIMARY KEY (ranking_id, team_id)
    );

    CREATE TABLE IF NOT EXISTS eva_v2_players (
      player_user_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      search_key TEXT NOT NULL,
      eva_username TEXT,
      user_id INTEGER,
      display_name TEXT,
      team_id TEXT,
      team_name TEXT,
      is_major INTEGER NOT NULL DEFAULT 0,
      current_stats TEXT,
      previous_stats TEXT,
      all_stats TEXT,
      stats_error TEXT,
      stats_error_at INTEGER NOT NULL DEFAULT 0,
      stats_retry_after INTEGER NOT NULL DEFAULT 0,
      stats_refreshed_at INTEGER NOT NULL DEFAULT 0,
      player_refreshed_at INTEGER NOT NULL DEFAULT 0,
      refreshed_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS eva_v2_major_team_stats (
      team_id TEXT PRIMARY KEY,
      team_name TEXT NOT NULL,
      wins INTEGER NOT NULL,
      draws INTEGER NOT NULL,
      losses INTEGER NOT NULL,
      points INTEGER NOT NULL,
      score_for INTEGER NOT NULL,
      score_against INTEGER NOT NULL,
      played INTEGER NOT NULL,
      refreshed_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS eva_v2_tournaments (
      tournament_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      full_name TEXT,
      status TEXT,
      scheduled_start TEXT,
      scheduled_end TEXT,
      timezone TEXT,
      organization TEXT,
      location TEXT,
      circuit_id TEXT,
      circuit_name TEXT,
      season_name TEXT,
      region_name TEXT,
      tier_name TEXT,
      logo_id TEXT,
      logo_url TEXT,
      search_key TEXT NOT NULL,
      refreshed_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS eva_v2_tournament_matches (
      match_id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL,
      status TEXT,
      scheduled_datetime TEXT,
      played_at TEXT,
      round_number INTEGER,
      round_name TEXT,
      group_number INTEGER,
      group_name TEXT,
      match_number INTEGER,
      stage_name TEXT,
      opponent1 TEXT,
      opponent2 TEXT,
      score1 REAL,
      score2 REAL,
      refreshed_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_eva_v2_locations_search ON eva_v2_locations(search_key);
    CREATE INDEX IF NOT EXISTS idx_eva_v2_rankings_search ON eva_v2_rankings(search_key);
    CREATE INDEX IF NOT EXISTS idx_eva_v2_teams_search ON eva_v2_teams(search_key);
    CREATE INDEX IF NOT EXISTS idx_eva_v2_teams_region ON eva_v2_teams(current_region_id, current_points DESC);
    CREATE INDEX IF NOT EXISTS idx_eva_v2_players_search ON eva_v2_players(search_key);
    CREATE INDEX IF NOT EXISTS idx_eva_v2_players_username ON eva_v2_players(eva_username);
    CREATE INDEX IF NOT EXISTS idx_eva_v2_players_team ON eva_v2_players(team_id);
    CREATE INDEX IF NOT EXISTS idx_eva_v2_tournaments_search ON eva_v2_tournaments(search_key);
    CREATE INDEX IF NOT EXISTS idx_eva_v2_tournaments_start ON eva_v2_tournaments(scheduled_start);
    CREATE INDEX IF NOT EXISTS idx_eva_v2_tournament_matches_tournament ON eva_v2_tournament_matches(tournament_id, scheduled_datetime, match_number);
  `);
  migrateDb(db);
  dbInstance = db;
  return db;
}

function migrateDb(db) {
  const addColumn = (table, name, definition) => {
    const columns = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name));
    if (!columns.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  };

  addColumn('eva_v2_rankings', 'logo_id', 'TEXT');
  addColumn('eva_v2_rankings', 'logo_url', 'TEXT');
  addColumn('eva_v2_teams', 'logo_id', 'TEXT');
  addColumn('eva_v2_teams', 'logo_url', 'TEXT');
  addColumn('eva_v2_tournaments', 'logo_id', 'TEXT');
  addColumn('eva_v2_tournaments', 'logo_url', 'TEXT');
  addColumn('eva_v2_players', 'stats_error', 'TEXT');
  addColumn('eva_v2_players', 'stats_error_at', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('eva_v2_players', 'stats_retry_after', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('eva_v2_tournament_matches', 'group_number', 'INTEGER');
  addColumn('eva_v2_tournament_matches', 'group_name', 'TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_eva_v2_players_retry ON eva_v2_players(is_major, stats_retry_after, stats_refreshed_at)');
}


function setMeta(key, value) {
  const db = openDb();
  db.prepare(`
    INSERT INTO eva_v2_meta (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(key, String(value), now());
}

function getMeta(key, fallback = null) {
  const row = openDb().prepare('SELECT value FROM eva_v2_meta WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function isStale(key, ttlMs = CACHE_TTL_MS) {
  const row = openDb().prepare('SELECT updated_at FROM eva_v2_meta WHERE key = ?').get(key);
  return !row || now() - Number(row.updated_at || 0) > ttlMs;
}

function hasUsableCache() {
  if (!fs.existsSync(DB_FILE)) return false;
  try {
    return isEvaV2CacheReady();
  } catch {
    return false;
  }
}

function checkpointEvaV2Cache() {
  const db = openDb();
  return db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
}

function getEvaRuntimeStatus() {
  return {
    dbFile: DB_FILE,
    dbExists: fs.existsSync(DB_FILE),
    cacheReady: hasUsableCache(),
    active: Boolean(refreshPromise),
    kind: refreshState.kind,
    startedAt: refreshState.startedAt,
    lastCompletedAt: refreshState.lastCompletedAt,
    lastError: refreshState.lastError,
  };
}

function getEvaCommandUnavailableReason() {
  const status = getEvaRuntimeStatus();
  if (status.active) {
    if (status.kind === 'initial') {
      return 'Import initial EVA en cours. La base est en train d\'etre creee, reessaie dans quelques minutes.';
    }
    return 'Mise a jour EVA en cours. Les commandes stats sont verrouillees quelques minutes pour garder des reponses rapides.';
  }
  if (!status.cacheReady) {
    return 'Base EVA pas encore prete. Lance l\'import initial puis reessaie dans quelques minutes.';
  }
  return null;
}

async function throttleHttp() {
  const elapsed = now() - lastHttpAt;
  if (elapsed < HTTP_MIN_INTERVAL_MS) await wait(HTTP_MIN_INTERVAL_MS - elapsed);
  lastHttpAt = now();
}

async function fetchJson(url, options = {}, attempt = 1) {
  await throttleHttp();
  const response = await fetch(url, {
    ...options,
    signal: options.signal || AbortSignal.timeout(HTTP_TIMEOUT_MS),
    headers: {
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  });

  if (response.status === 429 && attempt <= 4) {
    const retryAfter = Number(response.headers.get('retry-after') || 0);
    await wait(Math.max(1000, retryAfter * 1000, attempt * 2500));
    return fetchJson(url, options, attempt + 1);
  }

  if (!response.ok && response.status !== 206) {
    const text = await response.text().catch(() => '');
    throw new Error(`EVA HTTP ${response.status}: ${text || url}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function parseContentRange(value) {
  const match = String(value || '').match(/(\w+)\s+(\d+)-(\d+)\/(\d+|\*)/);
  if (!match) return { total: 0, end: -1 };
  return {
    total: match[4] === '*' ? 0 : Number(match[4]),
    end: Number(match[3]),
  };
}

async function fetchRange(pathname, unit, pageSize = 100) {
  const items = [];
  const safePageSize = Math.min(Number(pageSize || 50), 50);
  let start = 0;
  let total = null;

  do {
    const end = total == null
      ? start + safePageSize - 1
      : Math.min(start + safePageSize - 1, total - 1);
    await throttleHttp();
    const response = await fetch(`${COMPETITIVE_BASE_URL}${pathname}`, {
      headers: {
        Accept: 'application/json',
        Range: `${unit}=${start}-${end}`,
      },
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after') || 1);
      await wait(Math.max(1000, retryAfter * 1000));
      continue;
    }

    if (!response.ok && response.status !== 206) {
      const text = await response.text().catch(() => '');
      throw new Error(`EVA range ${response.status}: ${pathname} ${text}`);
    }

    const text = await response.text();
    if (text) items.push(...JSON.parse(text));

    const range = parseContentRange(response.headers.get('content-range'));
    total = range.total || items.length;
    start = range.end + 1;
  } while (total != null && start < total);

  return items;
}

async function fetchCount(pathname, unit) {
  await throttleHttp();
  const response = await fetch(`${COMPETITIVE_BASE_URL}${pathname}`, {
    headers: {
      Accept: 'application/json',
      Range: `${unit}=0-0`,
    },
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });

  if (!response.ok && response.status !== 206 && response.status !== 200) {
    return 0;
  }

  const range = parseContentRange(response.headers.get('content-range'));
  return range.total || 0;
}

/**
 * Estimate ETA for a full or partial EVA v2 refresh.
 * Returns { estimatedMs, estimatedRequests } (approximate)
 */
async function estimateRefreshETA({ full = false } = {}) {
  try {
    const rankingsCount = await fetchCount('/circuit-rankings', 'rankings').catch(() => 0);
    const teamsCount = await fetchCount('/teams', 'teams').catch(() => 0);

    // estimate number of roster hydration operations
    const rosterOps = Math.min(teamsCount, full ? TEAM_MEMBER_FULL_REFRESH_LIMIT : TEAM_MEMBER_REFRESH_LIMIT);

    // estimate major players ops
    const majorPlayerOps = full ? MAJOR_PLAYER_FULL_REFRESH_LIMIT : MAJOR_PLAYER_REFRESH_LIMIT;

    // requests for rankings and teams (page size ~50)
    const requestsForRankings = Math.ceil(rankingsCount / 50) || 1;
    const requestsForTeams = Math.ceil(teamsCount / 50) || 1;

    const estimatedRequests = requestsForRankings + requestsForTeams + rosterOps + majorPlayerOps;

    // assume each request costs at least HTTP_MIN_INTERVAL_MS plus small overhead
    const perRequestMs = HTTP_MIN_INTERVAL_MS + 250;

    const estimatedMs = estimatedRequests * perRequestMs;
    return { estimatedMs, estimatedRequests };
  } catch (err) {
    return { estimatedMs: 0, estimatedRequests: 0 };
  }
}

async function graphql(query, variables = {}) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Origin: 'https://app.eva.gg',
    Referer: 'https://app.eva.gg/',
  };

  const payload = await fetchJson(GRAPHQL_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });

  if (payload?.errors?.length) {
    throw new Error(payload.errors.map(error => error.message).join(' | '));
  }

  return payload?.data || {};
}

function normalizeStats(raw = {}) {
  const kills = Number(raw.kills || 0);
  const deaths = Number(raw.deaths || 0);
  const assists = Number(raw.assists || 0);
  return {
    gameCount: Number(raw.gameCount || 0),
    wins: Number(raw.gameVictoryCount || 0),
    losses: Number(raw.gameDefeatCount || 0),
    draws: Number(raw.gameDrawCount || 0),
    kills,
    deaths,
    assists,
    killDeathRatio: Number(raw.killDeathRatio || 0),
    killsByDeaths: Number(raw.killsByDeaths || 0),
    inflictedDamage: Number(raw.inflictedDamage || 0),
    bestInflictedDamage: Number(raw.bestInflictedDamage || 0),
    bestKillStreak: Number(raw.bestKillStreak || 0),
    kda: deaths > 0 ? Number(((kills + assists) / deaths).toFixed(2)) : kills + assists,
  };
}

function trendFromStats(current, previous) {
  if (!current || !previous || !previous.gameCount) return 'stable';
  const delta = Number(current.kda || 0) - Number(previous.kda || 0);
  if (delta >= 0.15) return 'hausse';
  if (delta <= -0.15) return 'baisse';
  return 'stable';
}

function trendFromPoints(currentPoints, previousPoints) {
  if (previousPoints == null || Number(previousPoints) === 0) return 'stable';
  const delta = Number(currentPoints || 0) - Number(previousPoints || 0);
  if (delta > 0) return 'hausse';
  if (delta < 0) return 'baisse';
  return 'stable';
}

async function getActiveSeason() {
  if (activeSeasonCache && now() - activeSeasonCache.cachedAt < CACHE_TTL_MS) {
    return activeSeasonCache.value;
  }
  const data = await graphql(`
    query SeasonActive {
      seasonActive {
        id
        seasonNumber
        name
      }
    }
  `, {});
  activeSeasonCache = {
    value: data.seasonActive || null,
    cachedAt: now(),
  };
  return activeSeasonCache.value;
}

async function refreshLocations(progressCallback = null) {
  if (progressCallback) progressCallback({ step: 'locations', status: 'start' });
  const data = await graphql(`
    query LocationList {
      locations(includesComingSoon: false, includesClosed: false, onlyVisible: true) {
        nodes {
          id
          identifier
          name
          country
        }
      }
    }
  `);
  const db = openDb();
  const stmt = db.prepare(`
    INSERT INTO eva_v2_locations (location_id, identifier, name, country, search_key, refreshed_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(location_id) DO UPDATE SET
      identifier = excluded.identifier,
      name = excluded.name,
      country = excluded.country,
      search_key = excluded.search_key,
      refreshed_at = excluded.refreshed_at
  `);

  const nodes = data.locations?.nodes || [];
  const stamp = now();
  db.exec('BEGIN IMMEDIATE');
  try {
    let i = 0;
    for (const location of nodes) {
      stmt.run(location.id, location.identifier || null, location.name || '', location.country || null, normalizeKey(`${location.name} ${location.identifier}`), stamp);
      i += 1;
      if (progressCallback && i % 50 === 0) progressCallback({ step: 'locations', status: 'progress', current: i, total: nodes.length });
    }
    db.exec('COMMIT');
    if (progressCallback) progressCallback({ step: 'locations', status: 'done', current: nodes.length, total: nodes.length });
  } catch (err) {
    db.exec('ROLLBACK');
    if (progressCallback) progressCallback({ step: 'locations', status: 'error', error: err.message });
    throw err;
  }
}

async function refreshRankingsAndTeams(progressCallback = null) {
  if (progressCallback) progressCallback({ step: 'rankings_teams', status: 'start' });
  const db = openDb();
  const [rankings, teams] = await Promise.all([
    fetchRange('/circuit-rankings', 'rankings', 100),
    fetchRange('/teams', 'teams', 100),
  ]);

  const localRankings = rankings.filter(ranking =>
    ranking.discipline === 'after_humanity' &&
    (!LOCAL_LEAGUES_CIRCUIT_ID || ranking.circuit?.id === LOCAL_LEAGUES_CIRCUIT_ID)
  );

  const rankingStmt = db.prepare(`
    INSERT INTO eva_v2_rankings (
      ranking_id, ranking_name, circuit_id, circuit_name, season_id, season_name,
      region_id, region_name, logo_id, logo_url, entity_type, computed_at, search_key, refreshed_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ranking_id) DO UPDATE SET
      ranking_name = excluded.ranking_name,
      circuit_id = excluded.circuit_id,
      circuit_name = excluded.circuit_name,
      season_id = excluded.season_id,
      season_name = excluded.season_name,
      region_id = excluded.region_id,
      region_name = excluded.region_name,
      logo_id = excluded.logo_id,
      logo_url = excluded.logo_url,
      entity_type = excluded.entity_type,
      computed_at = excluded.computed_at,
      search_key = excluded.search_key,
      refreshed_at = excluded.refreshed_at
  `);

  const teamStmt = db.prepare(`
    INSERT INTO eva_v2_teams (team_id, name, search_key, logo_id, logo_url, member_count, refreshed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(team_id) DO UPDATE SET
      name = excluded.name,
      search_key = excluded.search_key,
      logo_id = excluded.logo_id,
      logo_url = excluded.logo_url,
      member_count = excluded.member_count,
      refreshed_at = excluded.refreshed_at
  `);

  const itemStmt = db.prepare(`
    INSERT INTO eva_v2_ranking_items (
      ranking_id, team_id, team_name, region_id, region_name, season_name, rank,
      position, points, played, wins, draws, losses, forfeits, refreshed_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ranking_id, team_id) DO UPDATE SET
      team_name = excluded.team_name,
      region_id = excluded.region_id,
      region_name = excluded.region_name,
      season_name = excluded.season_name,
      rank = excluded.rank,
      position = excluded.position,
      points = excluded.points,
      played = excluded.played,
      wins = excluded.wins,
      draws = excluded.draws,
      losses = excluded.losses,
      forfeits = excluded.forfeits,
      refreshed_at = excluded.refreshed_at
  `);
  const teamLogoStmt = db.prepare(`
    UPDATE eva_v2_teams
    SET logo_id = ?, logo_url = ?, refreshed_at = ?
    WHERE team_id = ? AND (logo_id IS NULL OR logo_id = '')
  `);

  const stamp = now();
  db.exec('BEGIN IMMEDIATE');
  try {
  const filteredTeams = teams.filter(team => team.discipline === 'after_humanity');
  let tcount = 0;
  for (const team of filteredTeams) {
      const logoId = getEvaLogoId(team);
      teamStmt.run(team.id, team.name || '', normalizeKey(team.name), logoId, buildEvaMediaUrl(logoId), Number(team.memberCount || 0), stamp);
      tcount += 1;
      if (progressCallback && tcount % 50 === 0) progressCallback({ step: 'teams', status: 'progress', current: tcount, total: filteredTeams.length });
      if (tcount % 20 === 0) await wait(0);
    }
    if (progressCallback) progressCallback({ step: 'teams', status: 'done', current: tcount, total: filteredTeams.length });

  let rcount = 0;
  for (const ranking of localRankings) {
      const logoId = getEvaLogoId(ranking.region) || getEvaLogoId(ranking) || getEvaLogoId(ranking.circuit) || getEvaLogoId(ranking.season);
      rankingStmt.run(
        ranking.id,
        ranking.name || '',
        ranking.circuit?.id || null,
        ranking.circuit?.name || null,
        ranking.season?.id || null,
        ranking.season?.name || null,
        ranking.region?.id || null,
        ranking.region?.name || null,
        logoId,
        buildEvaMediaUrl(logoId),
        ranking.entityType || null,
        ranking.computedAt || null,
        normalizeKey(`${ranking.name} ${ranking.region?.name}`),
        stamp
      );
      rcount += 1;
      if (progressCallback && rcount % 20 === 0) progressCallback({ step: 'rankings', status: 'progress', current: rcount, total: localRankings.length });
      if (rcount % 10 === 0) await wait(0);
    }
    if (progressCallback) progressCallback({ step: 'rankings', status: 'done', current: rcount, total: localRankings.length });

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    if (progressCallback) progressCallback({ step: 'rankings_teams', status: 'error', error: err.message });
    throw err;
  }

  let processed = 0;
  for (const ranking of localRankings) {
    const params = new URLSearchParams({ ranking_ids: ranking.id });
    const items = await fetchRange(`/circuit-ranking-items?${params.toString()}`, 'items', 100);
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const item of items) {
        const teamId = item.entity?.entityId;
        if (!teamId || item.entity?.entityType !== 'team') continue;
        const props = item.properties || {};
        const itemLogoId = getEvaLogoId(item.entity);
        itemStmt.run(
          ranking.id,
          teamId,
          item.entity?.name || '',
          ranking.region?.id || null,
          ranking.region?.name || null,
          ranking.season?.name || null,
          Number(item.rank || 0),
          Number(item.position || 0),
          Number(item.points || 0),
          Number(props.played || 0),
          Number(props.wins || 0),
          Number(props.draws || 0),
          Number(props.losses || 0),
          Number(props.forfeits || 0),
          stamp
        );
        if (itemLogoId) teamLogoStmt.run(itemLogoId, buildEvaMediaUrl(itemLogoId), stamp, teamId);
      }
      db.exec('COMMIT');
      processed += 1;
        if (progressCallback && processed % 5 === 0) progressCallback({ step: 'ranking_items', status: 'progress', current: processed, total: localRankings.length });
        if (processed % 5 === 0) await wait(0);
    } catch (err) {
      db.exec('ROLLBACK');
      if (progressCallback) progressCallback({ step: 'ranking_items', status: 'error', error: err.message });
      throw err;
    }
  }

  rebuildTeamRankingSummary();
  if (progressCallback) progressCallback({ step: 'rankings_teams', status: 'done' });
}

function rebuildTeamRankingSummary() {
  const db = openDb();
  const teams = db.prepare('SELECT team_id FROM eva_v2_teams').all();
  const selectItems = db.prepare(`
    SELECT ri.*, r.ranking_name, r.computed_at
    FROM eva_v2_ranking_items ri
    JOIN eva_v2_rankings r ON r.ranking_id = ri.ranking_id
    WHERE ri.team_id = ?
    ORDER BY ri.season_name DESC, COALESCE(r.computed_at, '') DESC, ri.points DESC
  `);
  const update = db.prepare(`
    UPDATE eva_v2_teams SET
      current_ranking_id = ?,
      current_ranking_name = ?,
      current_region_id = ?,
      current_region_name = ?,
      current_season_name = ?,
      current_rank = ?,
      current_position = ?,
      current_points = ?,
      current_played = ?,
      current_wins = ?,
      current_draws = ?,
      current_losses = ?,
      previous_rank = ?,
      previous_points = ?,
      previous_played = ?,
      trend_label = ?
    WHERE team_id = ?
  `);

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const team of teams) {
      const items = selectItems.all(team.team_id);
      const current = items[0] || null;
      const previous = items.find(item => item.season_name !== current?.season_name) || null;
      if (!current) continue;
      update.run(
        current.ranking_id,
        current.ranking_name || current.region_name || null,
        current.region_id,
        current.region_name,
        current.season_name,
        current.rank,
        current.position,
        current.points,
        current.played,
        current.wins,
        current.draws,
        current.losses,
        previous?.rank || null,
        previous?.points ?? null,
        previous?.played ?? null,
        trendFromPoints(current.points, previous?.points),
        team.team_id
      );
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

async function refreshTeamRoster(teamId, teamName = null) {
  const members = await fetchJson(`${COMPETITIVE_BASE_URL}/teams/${teamId}/members`);
  const db = openDb();
  const stamp = now();
  const stmt = db.prepare(`
    INSERT INTO eva_v2_players (player_user_id, name, search_key, team_id, team_name, refreshed_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(player_user_id) DO UPDATE SET
      name = excluded.name,
      search_key = excluded.search_key,
      team_id = excluded.team_id,
      team_name = excluded.team_name,
      refreshed_at = excluded.refreshed_at
  `);
  const updateTeam = db.prepare('UPDATE eva_v2_teams SET roster_refreshed_at = ? WHERE team_id = ?');

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const member of members || []) {
      const player = member.playerUser || {};
      if (!player.id || !player.name) continue;
      stmt.run(String(player.id), player.name, normalizeKey(player.name), teamId, teamName || null, stamp);
    }
    updateTeam.run(stamp, teamId);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  // yield to event loop after a team roster write so other tasks (interactions) can be processed
  await wait(0);
  return members || [];
}

async function refreshStaleRosters({ full = false } = {}, progressCallback = null) {
  const db = openDb();
  const limit = full ? TEAM_MEMBER_FULL_REFRESH_LIMIT : TEAM_MEMBER_REFRESH_LIMIT;
  const rows = db.prepare(`
    SELECT team_id, name, roster_refreshed_at
    FROM eva_v2_teams
    WHERE roster_refreshed_at = 0 OR ? - roster_refreshed_at > ?
    ORDER BY
      CASE WHEN current_points IS NULL THEN 1 ELSE 0 END,
      current_points DESC,
      member_count DESC
    LIMIT ?
  `).all(now(), CACHE_TTL_MS, limit);

  let refreshed = 0;
  if (progressCallback) progressCallback({ step: 'rosters', status: 'start', current: 0, total: rows.length });
  for (const row of rows) {
    await refreshTeamRoster(row.team_id, row.name).catch(err => {
      console.warn(`[EVA-V2] roster ${row.name} skipped: ${err.message}`);
    });
    refreshed += 1;
    if (progressCallback && refreshed % 10 === 0) progressCallback({ step: 'rosters', status: 'progress', current: refreshed, total: rows.length });
    // Yield periodically to avoid blocking the event loop for long periods
    if (refreshed % 5 === 0) await wait(0);
  }
  if (progressCallback) progressCallback({ step: 'rosters', status: 'done', current: refreshed, total: rows.length });
  return refreshed;
}

async function getCompetitivePlayer(playerUserId) {
  return fetchJson(`${COMPETITIVE_BASE_URL}/player/${playerUserId}`);
}

function getEvaIdentifier(player) {
  return player?.connectionProviders?.find(provider => provider.type === 'eva')?.identifier || null;
}

async function fetchPublicPlayerStats(username, seasonId, previousSeasonId) {
  const data = await graphql(`
    query PublicStats($username: String!, $seasonId: Int, $previousSeasonId: Int) {
      getPublicPlayerByUsername(username: $username) {
        id
        user {
          id
          username
          displayName
          visitedLocationIdList
        }
        current: statistics(seasonId: $seasonId) {
          data {
            gameCount
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
        previous: statistics(seasonId: $previousSeasonId) {
          data {
            gameCount
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
        all: statistics {
          data {
            gameCount
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
  `, { username, seasonId, previousSeasonId }, null);
  return data.getPublicPlayerByUsername || null;
}

function getStatsRetryDelayMs(err) {
  const message = String(err?.message || '').toLowerCase();
  if (
    message.includes('private') ||
    message.includes('introuvable') ||
    message.includes('not found') ||
    message.includes('identifiant eva public est absent')
  ) {
    return CACHE_TTL_MS;
  }
  return Math.min(CACHE_TTL_MS, 60 * 60 * 1000);
}

function recordPlayerStatsError(player, err) {
  const db = openDb();
  const stamp = now();
  db.prepare(`
    UPDATE eva_v2_players
    SET stats_error = ?,
        stats_error_at = ?,
        stats_retry_after = ?
    WHERE player_user_id = ?
  `).run(
    String(err?.message || err || 'Erreur stats EVA'),
    stamp,
    stamp + getStatsRetryDelayMs(err),
    player.player_user_id
  );
}

async function hydratePlayerStats(player) {
  const db = openDb();
  let evaUsername = player.eva_username || null;

  if (!evaUsername) {
    const competitive = await getCompetitivePlayer(player.player_user_id);
    evaUsername = getEvaIdentifier(competitive);
    db.prepare(`
      UPDATE eva_v2_players
      SET eva_username = ?, player_refreshed_at = ?
      WHERE player_user_id = ?
    `).run(evaUsername || null, now(), player.player_user_id);
  }

  if (!evaUsername) {
    throw new Error(`Le joueur ${player.name} existe cote competitif, mais son identifiant EVA public est absent.`);
  }

  const season = await getActiveSeason();
  const currentSeasonId = season?.id || null;
  const previousSeasonId = currentSeasonId && currentSeasonId > 1 ? currentSeasonId - 1 : null;
  const publicPlayer = await fetchPublicPlayerStats(evaUsername, currentSeasonId, previousSeasonId);
  if (!publicPlayer) throw new Error(`Profil public EVA introuvable pour ${evaUsername}.`);

  const current = normalizeStats(publicPlayer.current?.data || {});
  const previous = normalizeStats(publicPlayer.previous?.data || {});
  const all = normalizeStats(publicPlayer.all?.data || {});
  db.prepare(`
    UPDATE eva_v2_players
    SET eva_username = ?,
        user_id = ?,
        display_name = ?,
        current_stats = ?,
        previous_stats = ?,
        all_stats = ?,
        stats_error = NULL,
        stats_error_at = 0,
        stats_retry_after = 0,
        stats_refreshed_at = ?,
        player_refreshed_at = ?
    WHERE player_user_id = ?
  `).run(
    publicPlayer.user?.username || evaUsername,
    publicPlayer.user?.id || null,
    publicPlayer.user?.displayName || splitUsernameBase(evaUsername),
    JSON.stringify(current),
    JSON.stringify(previous),
    JSON.stringify(all),
    now(),
    now(),
    player.player_user_id
  );

  return {
    ...player,
    eva_username: publicPlayer.user?.username || evaUsername,
    user_id: publicPlayer.user?.id || null,
    display_name: publicPlayer.user?.displayName || splitUsernameBase(evaUsername),
    current_stats: JSON.stringify(current),
    previous_stats: JSON.stringify(previous),
    all_stats: JSON.stringify(all),
    stats_refreshed_at: now(),
  };
}

function scoreMatch(query, row, fields) {
  const normalizedQuery = normalizeKey(query);
  if (!normalizedQuery) return 0;
  let best = 0;
  for (const field of fields) {
    const value = normalizeKey(row[field]);
    const base = normalizeKey(splitUsernameBase(row[field]));
    for (const candidate of [value, base]) {
      if (!candidate) continue;
      if (candidate === normalizedQuery) best = Math.max(best, 100);
      else if (candidate.startsWith(normalizedQuery)) best = Math.max(best, 90 - Math.abs(candidate.length - normalizedQuery.length));
      else if (candidate.includes(normalizedQuery)) best = Math.max(best, 80 - Math.abs(candidate.length - normalizedQuery.length));
    }
  }
  return best;
}

function findBestPlayer(query) {
  try {
    // Cherche d'abord les candidats pertinents (limit 500)
    const candidates = openDb().prepare(`
    SELECT p.*, t.current_region_name, t.current_ranking_name, t.current_rank, t.current_position,
      t.current_points, t.current_season_name, t.trend_label AS team_trend,
      t.logo_url AS team_logo_url
      FROM eva_v2_players p
      LEFT JOIN eva_v2_teams t ON t.team_id = p.team_id
      WHERE p.search_key LIKE ? OR p.eva_username LIKE ?
      LIMIT 500
    `).all(`%${normalizeKey(query)}%`, `%${query}%`);
    
    let best = null;
    let bestScore = 0;
    for (const row of candidates) {
      const score = scoreMatch(query, row, ['name', 'display_name', 'eva_username']);
      if (score > bestScore) {
        best = row;
        bestScore = score;
      }
    }
    return bestScore >= 70 ? best : null;
  } catch (err) {
    console.error('findBestPlayer error:', err.message);
    return null;
  }
}

function findBestTeam(query) {
  try {
    // Cherche d'abord les candidats pertinents (limit 500)
    const candidates = openDb().prepare(`
      SELECT * FROM eva_v2_teams
      WHERE search_key LIKE ?
      LIMIT 500
    `).all(`%${normalizeKey(query)}%`);
    
    let best = null;
    let bestScore = 0;
    for (const row of candidates) {
      const score = scoreMatch(query, row, ['name']);
      if (score > bestScore) {
        best = row;
        bestScore = score;
      }
    }
    return bestScore >= 70 ? best : null;
  } catch (err) {
    console.error('findBestTeam error:', err.message);
    return null;
  }
}

function findBestLocation(query) {
  try {
    const db = openDb();
    const rows = db.prepare(`
      SELECT * FROM eva_v2_locations
      WHERE search_key LIKE ? OR name LIKE ?
      LIMIT 500
    `).all(`%${normalizeKey(query)}%`, `%${query}%`);

    const rankingRows = db.prepare(`
      SELECT NULL AS location_id, NULL AS identifier, region_name AS name, NULL AS country,
             search_key, MAX(refreshed_at) AS refreshed_at
      FROM eva_v2_rankings
      WHERE search_key LIKE ?
      GROUP BY region_name
      LIMIT 500
    `).all(`%${normalizeKey(query)}%`);
    rows.push(...rankingRows);
    
    let best = null;
    let bestScore = 0;
    for (const row of rows) {
      const score = scoreMatch(query, row, ['name', 'identifier']);
      if (score > bestScore) {
        best = row;
        bestScore = score;
      }
    }
    return bestScore >= 70 ? best : null;
  } catch (err) {
    console.error('findBestLocation error:', err.message);
    return null;
  }
}

async function ensureEvaV2Fresh({ force = false, full = false, progressCallback = null, kind = 'manual' } = {}) {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    refreshState = {
      ...refreshState,
      active: true,
      kind,
      startedAt: now(),
      lastError: null,
    };
    // N'exécute l'import core (lourd) uniquement si `force` est vrai.
    // Ainsi les appels normaux (force: false) feront seulement les rafraîchissements différentiels.
    if (force && isStale('core_refresh')) {
      await refreshLocations(progressCallback).catch(err => {
        console.warn(`[EVA-V2] locations skipped: ${err.message}`);
        if (progressCallback) progressCallback({ step: 'locations', status: 'error', error: err.message });
      });
      await refreshRankingsAndTeams(progressCallback).catch(err => {
        console.warn(`[EVA-V2] rankings/teams skipped: ${err.message}`);
        if (progressCallback) progressCallback({ step: 'rankings_teams', status: 'error', error: err.message });
      });
      await refreshMajorLeague(progressCallback).catch(err => {
        console.warn(`[EVA-V2] major league skipped: ${err.message}`);
        if (progressCallback) progressCallback({ step: 'major_league', status: 'error', error: err.message });
      });
      await refreshLocalTournaments(progressCallback).catch(err => {
        console.warn(`[EVA-V2] local tournaments skipped: ${err.message}`);
        if (progressCallback) progressCallback({ step: 'local_tournaments', status: 'error', error: err.message });
      });
      setMeta('core_refresh', '1');
    } else if (force && isStale('local_tournaments_refresh')) {
      await refreshLocalTournaments(progressCallback).catch(err => {
        console.warn(`[EVA-V2] local tournaments skipped: ${err.message}`);
        if (progressCallback) progressCallback({ step: 'local_tournaments', status: 'error', error: err.message });
      });
    }
    await refreshStaleRosters({ full }, progressCallback);
    await refreshMajorPlayerStats({ full, progressCallback });
    if (progressCallback) progressCallback({ step: 'finalize', status: 'start' });
    checkpointEvaV2Cache();
    if (progressCallback) progressCallback({ step: 'finalize', status: 'done' });
    return getEvaV2Status();
  })()
    .then(status => {
      refreshState = {
        ...refreshState,
        active: false,
        kind: null,
        lastCompletedAt: now(),
        lastError: null,
      };
      return status;
    })
    .catch(err => {
      refreshState = {
        ...refreshState,
        active: false,
        kind: null,
        lastError: String(err?.message || err),
      };
      throw err;
    })
    .finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function refreshMajorLeague(progressCallback = null) {
  if (progressCallback) progressCallback({ step: 'major_league', status: 'start' });
  const db = openDb();
  const teamStats = new Map();
  const stamp = now();
  let tournamentCount = 0;

  for (const tournamentId of MAJOR_TOURNAMENT_IDS) {
    tournamentCount += 1;
    if (progressCallback) progressCallback({ step: 'major_league', status: 'tournament_start', current: tournamentCount, total: MAJOR_TOURNAMENT_IDS.length, tournamentId });
    const participants = await fetchRange(`/participants?${new URLSearchParams({ tournament_ids: tournamentId }).toString()}`, 'participants', 100);
    let pcount = 0;
    for (const participant of participants) {
      pcount += 1;
      const teamId = participant.team?.id;
      const teamName = participant.team?.name || participant.name;
      if (!teamId) continue;
      const logoId = getEvaLogoId(participant.team) || getEvaLogoId(participant);
      db.prepare(`
        INSERT INTO eva_v2_teams (team_id, name, search_key, logo_id, logo_url, member_count, refreshed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(team_id) DO UPDATE SET
        name = excluded.name,
        search_key = excluded.search_key,
        logo_id = excluded.logo_id,
        logo_url = excluded.logo_url,
        refreshed_at = excluded.refreshed_at
      `).run(teamId, teamName || '', normalizeKey(teamName), logoId, buildEvaMediaUrl(logoId), participant.lineup?.length || null, stamp);

      const playerStmt = db.prepare(`
        INSERT INTO eva_v2_players (player_user_id, name, search_key, team_id, team_name, is_major, refreshed_at)
        VALUES (?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(player_user_id) DO UPDATE SET
          name = excluded.name,
          search_key = excluded.search_key,
          team_id = excluded.team_id,
          team_name = excluded.team_name,
          is_major = 1,
          refreshed_at = excluded.refreshed_at
      `);
      for (const member of participant.lineup || []) {
        const playerId = member.playerUser?.id;
        if (!playerId || !member.name) continue;
        playerStmt.run(String(playerId), member.name, normalizeKey(member.name), teamId, teamName || null, stamp);
      }
      if (progressCallback && pcount % 20 === 0) progressCallback({ step: 'major_league', status: 'participants_progress', current: pcount, tournamentId });
      if (pcount % 10 === 0) await wait(0);
    }

    const matches = await fetchRange(`/matches?${new URLSearchParams({ tournament_ids: tournamentId }).toString()}`, 'matches', 100);
    let mcount = 0;
    for (const match of matches.filter(item => item.status === 'completed')) {
      mcount += 1;
      for (const opponent of match.opponents || []) {
        const teamId = opponent.participant?.team?.id;
        const teamName = opponent.participant?.name || opponent.participant?.team?.name;
        if (!teamId) continue;
        if (!teamStats.has(teamId)) {
          teamStats.set(teamId, { teamId, teamName, wins: 0, draws: 0, losses: 0, points: 0, scoreFor: 0, scoreAgainst: 0, played: 0 });
        }
        const stat = teamStats.get(teamId);
        stat.played += 1;
        stat.scoreFor += Number(opponent.score || 0);
        const otherScore = (match.opponents || []).filter(item => item !== opponent).reduce((sum, item) => sum + Number(item.score || 0), 0);
        stat.scoreAgainst += otherScore;
        if (opponent.result === 'win') {
          stat.wins += 1;
          stat.points += 3;
        } else if (opponent.result === 'draw') {
          stat.draws += 1;
        } else if (opponent.result === 'loss') {
          stat.losses += 1;
        }
      }
      if (progressCallback && mcount % 50 === 0) progressCallback({ step: 'major_league', status: 'matches_progress', current: mcount, tournamentId });
      if (mcount % 20 === 0) await wait(0);
    }
    if (progressCallback) progressCallback({ step: 'major_league', status: 'tournament_done', current: tournamentCount, tournamentId });
  }

  const stmt = db.prepare(`
    INSERT INTO eva_v2_major_team_stats (
      team_id, team_name, wins, draws, losses, points, score_for, score_against, played, refreshed_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(team_id) DO UPDATE SET
      team_name = excluded.team_name,
      wins = excluded.wins,
      draws = excluded.draws,
      losses = excluded.losses,
      points = excluded.points,
      score_for = excluded.score_for,
      score_against = excluded.score_against,
      played = excluded.played,
      refreshed_at = excluded.refreshed_at
  `);
  db.exec('BEGIN IMMEDIATE');
  try {
    let scount = 0;
    for (const stat of teamStats.values()) {
      stmt.run(stat.teamId, stat.teamName || '', stat.wins, stat.draws, stat.losses, stat.points, stat.scoreFor, stat.scoreAgainst, stat.played, stamp);
      scount += 1;
      if (progressCallback && scount % 50 === 0) progressCallback({ step: 'major_league', status: 'write_stats_progress', current: scount });
    }
    db.exec('COMMIT');
    if (progressCallback) progressCallback({ step: 'major_league', status: 'done', current: scount });
  } catch (err) {
    db.exec('ROLLBACK');
    if (progressCallback) progressCallback({ step: 'major_league', status: 'error', error: err.message });
    throw err;
  }
}

function getTournamentSearchKey(tournament) {
  return normalizeKey([
    tournament.name,
    tournament.fullName,
    tournament.organization?.name || tournament.organization,
    tournament.location?.name || tournament.location,
    tournament.circuit?.name,
    tournament.circuitSeason?.name,
    tournament.circuitRegion?.name,
    tournament.circuitTier?.name,
  ].filter(Boolean).join(' '));
}

function isLocalEvaTournament(tournament) {
  return tournament.discipline === 'after_humanity' &&
    (!LOCAL_LEAGUES_CIRCUIT_ID || tournament.circuit?.id === LOCAL_LEAGUES_CIRCUIT_ID) &&
    tournament.public !== false;
}

function isUpcomingOrActiveTournament(tournament, referenceDate = new Date()) {
  const status = String(tournament.status || '').toLowerCase();
  if (['cancelled', 'canceled', 'archived'].includes(status)) return false;
  if (!['completed', 'ended', 'finished'].includes(status)) return true;

  const end = Date.parse(tournament.scheduledDateEnd || tournament.scheduledDateStart || '');
  if (!Number.isFinite(end)) return false;
  return end >= referenceDate.getTime() - (7 * 24 * 60 * 60 * 1000);
}

function getOpponentLabel(opponent) {
  return opponent?.participant?.name ||
    opponent?.participant?.team?.name ||
    opponent?.team?.name ||
    opponent?.name ||
    'A definir';
}

async function refreshLocalTournaments(progressCallback = null) {
  if (progressCallback) progressCallback({ step: 'local_tournaments', status: 'start' });
  const db = openDb();
  const tournaments = (await fetchRange('/tournaments', 'tournaments', 100))
    .filter(isLocalEvaTournament);
  const stamp = now();

  const tournamentStmt = db.prepare(`
    INSERT INTO eva_v2_tournaments (
      tournament_id, name, full_name, status, scheduled_start, scheduled_end, timezone,
      organization, location, circuit_id, circuit_name, season_name, region_name, tier_name,
      logo_id, logo_url, search_key, refreshed_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tournament_id) DO UPDATE SET
      name = excluded.name,
      full_name = excluded.full_name,
      status = excluded.status,
      scheduled_start = excluded.scheduled_start,
      scheduled_end = excluded.scheduled_end,
      timezone = excluded.timezone,
      organization = excluded.organization,
      location = excluded.location,
      circuit_id = excluded.circuit_id,
      circuit_name = excluded.circuit_name,
      season_name = excluded.season_name,
      region_name = excluded.region_name,
      tier_name = excluded.tier_name,
      logo_id = excluded.logo_id,
      logo_url = excluded.logo_url,
      search_key = excluded.search_key,
      refreshed_at = excluded.refreshed_at
  `);

  db.exec('BEGIN IMMEDIATE');
    try {
      let count = 0;
      for (const tournament of tournaments) {
        const logoId = getEvaLogoId(tournament) ||
          getEvaLogoId(tournament.circuitRegion) ||
          getEvaLogoId(tournament.circuitTier) ||
          getEvaLogoId(tournament.circuit) ||
          getEvaLogoId(tournament.circuitSeason);
        tournamentStmt.run(
          String(tournament.id),
          tournament.name || tournament.fullName || 'Tournoi EVA',
        tournament.fullName || null,
        tournament.status || null,
        tournament.scheduledDateStart || null,
        tournament.scheduledDateEnd || null,
        tournament.timezone || null,
        tournament.organization?.name || tournament.organization || null,
        tournament.location?.name || tournament.location || null,
        tournament.circuit?.id || null,
        tournament.circuit?.name || null,
          tournament.circuitSeason?.name || null,
          tournament.circuitRegion?.name || null,
          tournament.circuitTier?.name || null,
          logoId,
          buildEvaMediaUrl(logoId),
          getTournamentSearchKey(tournament),
          stamp
        );
      count += 1;
      if (progressCallback && count % 25 === 0) progressCallback({ step: 'local_tournaments', status: 'progress', current: count, total: tournaments.length });
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const tournamentsWithMatches = tournaments
    .filter(tournament => isUpcomingOrActiveTournament(tournament))
    .sort((a, b) => String(a.scheduledDateStart || '').localeCompare(String(b.scheduledDateStart || '')))
    .slice(0, TOURNAMENT_MATCH_REFRESH_LIMIT);

  const matchStmt = db.prepare(`
    INSERT INTO eva_v2_tournament_matches (
      match_id, tournament_id, status, scheduled_datetime, played_at, round_number,
      round_name, group_number, group_name, match_number, stage_name, opponent1, opponent2,
      score1, score2, refreshed_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(match_id) DO UPDATE SET
      tournament_id = excluded.tournament_id,
      status = excluded.status,
      scheduled_datetime = excluded.scheduled_datetime,
      played_at = excluded.played_at,
      round_number = excluded.round_number,
      round_name = excluded.round_name,
      group_number = excluded.group_number,
      group_name = excluded.group_name,
      match_number = excluded.match_number,
      stage_name = excluded.stage_name,
      opponent1 = excluded.opponent1,
      opponent2 = excluded.opponent2,
      score1 = excluded.score1,
      score2 = excluded.score2,
      refreshed_at = excluded.refreshed_at
  `);

  let matchTournamentCount = 0;
  for (const tournament of tournamentsWithMatches) {
    const params = new URLSearchParams({ tournament_ids: String(tournament.id) });
    const matches = await fetchRange(`/matches?${params.toString()}`, 'matches', 100).catch(err => {
      console.warn(`[EVA-V2] local tournament matches ${tournament.name} skipped: ${err.message}`);
      return [];
    });

    db.exec('BEGIN IMMEDIATE');
    try {
      for (const match of matches || []) {
        const opponents = match.opponents || [];
        const first = opponents[0] || {};
        const second = opponents[1] || {};
        matchStmt.run(
          String(match.id),
          String(tournament.id),
          match.status || null,
          match.scheduledDatetime || null,
          match.playedAt || null,
          Number(match.round?.number || match.roundNumber || 0) || null,
          match.round?.name || null,
          Number(match.group?.number || 0) || null,
          match.group?.name || null,
          Number(match.number || 0) || null,
          match.stage?.name || null,
          getOpponentLabel(first),
          getOpponentLabel(second),
          first.score != null ? Number(first.score) : null,
          second.score != null ? Number(second.score) : null,
          stamp
        );
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    matchTournamentCount += 1;
    if (progressCallback && matchTournamentCount % 5 === 0) {
      progressCallback({ step: 'local_tournament_matches', status: 'progress', current: matchTournamentCount, total: tournamentsWithMatches.length });
    }
    if (matchTournamentCount % 3 === 0) await wait(0);
  }

  setMeta('local_tournaments_refresh', '1');
  if (progressCallback) {
    progressCallback({ step: 'local_tournaments', status: 'done', current: tournaments.length, total: tournaments.length });
  }
  return tournaments.length;
}

async function refreshMajorPlayerStats({ full = false, limit = null, progressCallback = null } = {}) {
  const db = openDb();
  const resolvedLimit = Number(limit || (full ? MAJOR_PLAYER_FULL_REFRESH_LIMIT : MAJOR_PLAYER_REFRESH_LIMIT));
  const stamp = now();
  const players = db.prepare(`
    SELECT *
    FROM eva_v2_players
    WHERE is_major = 1
    AND (stats_retry_after IS NULL OR stats_retry_after = 0 OR stats_retry_after <= ?)
    ORDER BY stats_refreshed_at ASC
    LIMIT ?
  `).all(stamp, resolvedLimit);
  let hydrated = 0;
  let attempted = 0;
  let processed = 0;
  const errors = new Map();
  if (progressCallback) progressCallback({ step: 'player_stats', status: 'start', current: 0, total: players.length });
  for (const player of players) {
    processed += 1;
    if (player.current_stats && now() - Number(player.stats_refreshed_at || 0) <= CACHE_TTL_MS) {
      if (progressCallback && (processed % 5 === 0 || processed === players.length)) {
        progressCallback({ step: 'player_stats', status: 'progress', current: processed, total: players.length });
      }
      continue;
    }
    attempted += 1;
    try {
      await hydratePlayerStats(player);
      hydrated += 1;
    } catch (err) {
      recordPlayerStatsError(player, err);
      const key = String(err?.message || err || 'Erreur stats EVA');
      errors.set(key, (errors.get(key) || 0) + 1);
    }
    if (progressCallback && (processed % 5 === 0 || processed === players.length)) {
      progressCallback({ step: 'player_stats', status: 'progress', current: processed, total: players.length });
    }
    if (processed % 5 === 0) await wait(0);
  }
  for (const [message, count] of errors.entries()) {
    console.warn(`[EVA-V2] major players skipped: ${count} x ${message}`);
  }
  if (progressCallback) progressCallback({ step: 'player_stats', status: 'done', current: players.length, total: players.length });
  return hydrated;
}

async function getEvaPlayerStats(query) {
  let player = findBestPlayer(query);
  if (!player) throw new Error(`Joueur EVA introuvable dans l'index local: ${query}`);
  if (!player.current_stats) {
    if (player.stats_error && Number(player.stats_retry_after || 0) > now()) {
      throw createPlayerStatsUnavailableError(player, player.stats_error);
    }
    try {
      player = await hydratePlayerStats(player);
    } catch (err) {
      recordPlayerStatsError(player, err);
      throw createPlayerStatsUnavailableError(player, err.message || String(err));
    }
    if (!player.current_stats) {
      throw createPlayerStatsUnavailableError(player, 'Stats EVA pas encore disponibles dans le cache. Reessaie apres le prochain refresh.');
    }
  }

  const current = safeJsonParse(player.current_stats, {});
  const previous = safeJsonParse(player.previous_stats, {});
  const all = safeJsonParse(player.all_stats, {});
  return {
    playerId: player.player_user_id,
    name: player.display_name || splitUsernameBase(player.eva_username) || player.name,
    username: player.eva_username,
    teamId: player.team_id,
    teamName: player.team_name,
    teamLogoUrl: player.team_logo_url,
    leagueName: player.current_ranking_name,
    locationName: player.current_region_name,
    localRank: player.current_rank || player.current_position || null,
    teamPoints: player.current_points,
    trend: trendFromStats(current, previous),
    current,
    previous,
    all,
  };
}

function getTeamPlayerStats(teamId) {
  if (!teamId) return [];
  try {
    const rows = openDb().prepare(`
      SELECT player_user_id, name, eva_username, current_stats
      FROM eva_v2_players
      WHERE team_id = ? AND current_stats IS NOT NULL
    `).all(teamId);

    return rows
      .map(player => ({
        playerId: player.player_user_id,
        name: player.name,
        eva_username: player.eva_username,
        current: safeJsonParse(player.current_stats, {}),
      }))
      .filter(player => player.current && Number(player.current.gameCount || 0) > 0);
  } catch (err) {
    console.error('getTeamPlayerStats error:', err.message);
    return [];
  }
}

async function getEvaTeamStats(query) {
  const team = findBestTeam(query);
  if (!team) throw new Error(`Equipe EVA introuvable dans l'index local: ${query}`);
  try {
    const roster = openDb().prepare(`
      SELECT name, eva_username
      FROM eva_v2_players
      WHERE team_id = ?
      ORDER BY name COLLATE NOCASE
    `).all(team.team_id);
    return {
      ...team,
      roster,
    };
  } catch (err) {
    console.error('getEvaTeamStats error:', err.message);
    throw err;
  }
}

async function getEvaCityStandings(query) {
  try {
    const location = findBestLocation(query);
    if (!location) throw new Error(`Ville ou salle EVA introuvable dans l'index local: ${query}`);
    const normalized = normalizeKey(location.name);
    const rankings = openDb().prepare(`
      SELECT *
      FROM eva_v2_rankings
      WHERE search_key LIKE ?
      ORDER BY season_name DESC, ranking_name
      LIMIT 100
    `).all(`%${normalized}%`);
    const rankingIds = rankings.map(ranking => ranking.ranking_id);
    if (!rankingIds.length) return { locationName: location.name, rankings: [] };

    const placeholders = rankingIds.map(() => '?').join(',');
    const items = openDb().prepare(`
      SELECT ri.*, r.ranking_name
      FROM eva_v2_ranking_items ri
      JOIN eva_v2_rankings r ON r.ranking_id = ri.ranking_id
      WHERE ri.ranking_id IN (${placeholders})
      ORDER BY r.season_name DESC, ri.points DESC, ri.rank ASC, ri.team_name COLLATE NOCASE
      LIMIT 1000
    `).all(...rankingIds);

    return {
      locationName: location.name,
      rankings: rankings.map(ranking => ({
        ...ranking,
        teams: items.filter(item => item.ranking_id === ranking.ranking_id),
      })),
    };
  } catch (err) {
    console.error('getEvaCityStandings error:', err.message);
    throw err;
  }
}

async function getEvaTopPlayers(limit = TOP_LIMIT) {
  try {
    const db = openDb();
    const players = db.prepare(`
      SELECT p.*, t.logo_url AS team_logo_url
      FROM eva_v2_players p
      LEFT JOIN eva_v2_teams t ON t.team_id = p.team_id
      WHERE p.is_major = 1 AND p.current_stats IS NOT NULL
      LIMIT ?
    `).all(limit * 3);

    return players
      .map(player => {
        const current = safeJsonParse(player.current_stats, {});
        const previous = safeJsonParse(player.previous_stats, {});
        return {
        name: player.display_name || splitUsernameBase(player.eva_username) || player.name,
        username: player.eva_username,
        teamName: player.team_name,
        teamLogoUrl: player.team_logo_url,
        kda: current.kda || 0,
          gameCount: current.gameCount || 0,
          trend: trendFromStats(current, previous),
        };
      })
      .filter(player => player.gameCount > 0)
      .sort((a, b) => b.kda - a.kda || b.gameCount - a.gameCount)
      .slice(0, limit);
  } catch (err) {
    console.error('getEvaTopPlayers error:', err.message);
    return [];
  }
}

async function getEvaTopTeams(limit = TOP_LIMIT) {
  try {
    return openDb().prepare(`
      SELECT m.*, t.trend_label, t.logo_url
      FROM eva_v2_major_team_stats m
      LEFT JOIN eva_v2_teams t ON t.team_id = m.team_id
      ORDER BY m.points DESC, (m.score_for - m.score_against) DESC, m.wins DESC, m.team_name COLLATE NOCASE
      LIMIT ?
    `).all(limit);
  } catch (err) {
    console.error('getEvaTopTeams error:', err.message);
    return [];
  }
}

function safeSearch(fn, maxRetries = 1) {
  let lastErr;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return fn();
    } catch (err) {
      lastErr = err;
      if (i < maxRetries && err.message?.includes('database is locked')) {
        // Retry immédiatement sur verrouillage (WAL mode permet les reads rapides)
        const delay = 10;
        const start = Date.now();
        while (Date.now() - start < delay) {}
      } else {
        break;
      }
    }
  }
  // Retourne vide plutôt que de crasher
  return [];
}

function searchPlayers(query, limit = 25) {
  return safeSearch(() => openDb().prepare(`
    SELECT name, eva_username, team_name
    FROM eva_v2_players
    WHERE search_key LIKE ? OR eva_username LIKE ?
    ORDER BY is_major DESC, name COLLATE NOCASE
    LIMIT ?
  `).all(`%${normalizeKey(query)}%`, `%${query}%`, limit));
}

function searchTeams(query, limit = 25) {
  return safeSearch(() => openDb().prepare(`
    SELECT name, current_region_name
    FROM eva_v2_teams
    WHERE search_key LIKE ?
    ORDER BY current_points DESC, name COLLATE NOCASE
    LIMIT ?
  `).all(`%${normalizeKey(query)}%`, limit));
}

function searchLocations(query, limit = 25) {
  return safeSearch(() => openDb().prepare(`
    SELECT DISTINCT region_name AS name, ranking_name
    FROM eva_v2_rankings
    WHERE search_key LIKE ?
    ORDER BY region_name COLLATE NOCASE
    LIMIT ?
  `).all(`%${normalizeKey(query)}%`, limit));
}

function searchTournamentSites(query, limit = 25) {
  return safeSearch(() => {
    const normalized = normalizeKey(query);
    const rows = openDb().prepare(`
      SELECT
        region_name AS name,
        tier_name,
        MAX(season_name) AS season_name,
        MAX(scheduled_start) AS latest_start
      FROM eva_v2_tournaments
      WHERE search_key LIKE ?
        AND region_name IS NOT NULL
      GROUP BY region_name, tier_name
      ORDER BY region_name COLLATE NOCASE, latest_start DESC
      LIMIT ?
    `).all(`%${normalized}%`, limit);

    if (rows.length) return rows;
    return searchLocations(query, limit).map(row => ({
      name: row.name,
      tier_name: row.ranking_name,
      season_name: null,
    }));
  });
}

function getEvaTournamentsForSite(query, limit = 6) {
  const normalized = normalizeKey(query);
  const db = openDb();
  const tournaments = db.prepare(`
    SELECT *
    FROM eva_v2_tournaments
    WHERE search_key LIKE ?
      AND (scheduled_end IS NULL OR scheduled_end >= date('now', '-1 day'))
      AND LOWER(COALESCE(status, '')) NOT IN ('cancelled', 'canceled', 'archived')
    ORDER BY COALESCE(scheduled_start, scheduled_end, '') ASC, name COLLATE NOCASE
    LIMIT ?
  `).all(`%${normalized}%`, Number(limit || 6));

  const matchStmt = db.prepare(`
    SELECT *
    FROM eva_v2_tournament_matches
    WHERE tournament_id = ?
    ORDER BY
      COALESCE(scheduled_datetime, played_at, '') ASC,
      COALESCE(group_number, 9999) ASC,
      COALESCE(round_number, 9999) ASC,
      COALESCE(match_number, 9999) ASC,
      match_id ASC
    LIMIT 30
  `);

  return tournaments.map(tournament => ({
    ...tournament,
    matches: matchStmt.all(tournament.tournament_id),
  }));
}

function getEvaV2Status() {
  const db = openDb();
  const getCount = table => db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
  return {
    locations: getCount('eva_v2_locations'),
    rankings: getCount('eva_v2_rankings'),
    teams: getCount('eva_v2_teams'),
    rankingItems: getCount('eva_v2_ranking_items'),
    players: getCount('eva_v2_players'),
    majorTeams: getCount('eva_v2_major_team_stats'),
    tournaments: getCount('eva_v2_tournaments'),
    tournamentMatches: getCount('eva_v2_tournament_matches'),
  };
}

function isEvaV2CacheReady(status = null) {
  const snapshot = status || getEvaV2Status();
  return Boolean(
    snapshot.rankings > 0 &&
    snapshot.teams > 0 &&
    snapshot.rankingItems > 0 &&
    snapshot.players > 0
  );
}

function resetEvaV2Cache({ clearLegacy = false } = {}) {
  const db = openDb();
  db.exec(`
    DELETE FROM eva_v2_meta;
    DELETE FROM eva_v2_locations;
    DELETE FROM eva_v2_rankings;
    DELETE FROM eva_v2_teams;
    DELETE FROM eva_v2_ranking_items;
    DELETE FROM eva_v2_players;
    DELETE FROM eva_v2_major_team_stats;
    DELETE FROM eva_v2_tournaments;
    DELETE FROM eva_v2_tournament_matches;
  `);
  if (clearLegacy) {
    db.exec(`
      DELETE FROM cache_snapshot;
      DELETE FROM player_index;
      DELETE FROM player_queue;
    `);
  }
}

module.exports = {
  ensureEvaV2Fresh,
  getEvaPlayerStats,
  getTeamPlayerStats,
  getEvaTeamStats,
  getEvaCityStandings,
  getEvaTopPlayers,
  getEvaTopTeams,
  getEvaTournamentsForSite,
  searchPlayers,
  searchTeams,
  searchLocations,
  searchTournamentSites,
  getEvaRuntimeStatus,
  getEvaCommandUnavailableReason,
  getEvaV2Status,
  isEvaV2CacheReady,
  checkpointEvaV2Cache,
  resetEvaV2Cache,
  refreshMajorPlayerStats,
  fetchCount,
  estimateRefreshETA,
};
