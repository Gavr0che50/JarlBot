require('dotenv').config({ quiet: true });

const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const config = require('../config');

const DB_FILE = path.join(__dirname, '..', 'eva-cache.db');
const GRAPHQL_URL = process.env.EVA_GRAPHQL_URL || config.EVA_GRAPHQL_URL || 'https://api.eva.gg/graphql';

const USER_PAGE_LIMIT = Number(process.env.EVA_PUBLIC_USER_PAGE_LIMIT || 0);
const STAT_LIMIT = Number(process.env.EVA_PUBLIC_STAT_LIMIT || 0);
const STAT_BATCH_SIZE = Math.max(1, Number(process.env.EVA_PUBLIC_STAT_BATCH_SIZE || 10));
const MIN_INTERVAL_MS = Math.max(0, Number(process.env.EVA_PUBLIC_MIN_INTERVAL_MS || 250));
const RETRY_MAX = Math.max(1, Number(process.env.EVA_PUBLIC_MAX_RETRIES || 4));

const args = new Set(process.argv.slice(2));
const hasArg = name => args.has(name);
const getArgValue = (prefix) => {
  const item = [...args].find(value => value.startsWith(`${prefix}=`));
  return item ? item.slice(prefix.length + 1) : null;
};

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(message) {
  console.log(`[EVA-PUBLIC] ${message}`);
}

function parseRetryAfterMs(value) {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? 0 : Math.max(0, date - Date.now());
}

function normalizeStats(stats = {}) {
  const kills = Number(stats.kills || 0);
  const deaths = Number(stats.deaths || 0);
  const assists = Number(stats.assists || 0);
  return {
    gameCount: Number(stats.gameCount || 0),
    gameTime: Number(stats.gameTime || 0),
    wins: Number(stats.gameVictoryCount || 0),
    losses: Number(stats.gameDefeatCount || 0),
    draws: Number(stats.gameDrawCount || 0),
    kills,
    deaths,
    assists,
    killDeathRatio: Number(stats.killDeathRatio || 0),
    killsByDeaths: Number(stats.killsByDeaths || 0),
    inflictedDamage: Number(stats.inflictedDamage || 0),
    bestInflictedDamage: Number(stats.bestInflictedDamage || 0),
    bestKillStreak: Number(stats.bestKillStreak || 0),
    kda: deaths > 0 ? Number(((kills + assists) / deaths).toFixed(2)) : kills + assists,
  };
}

function parseIdList(value) {
  return String(value || '')
    .split(/[,\s;]+/)
    .map(item => Number(String(item).trim()))
    .filter(item => Number.isFinite(item) && item > 0);
}

function openDb() {
  const db = new DatabaseSync(DB_FILE);
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS eva_public_users (
      user_id INTEGER PRIMARY KEY,
      username TEXT,
      display_name TEXT,
      full_name TEXT,
      is_public INTEGER,
      esport_enabled INTEGER,
      esport_location_ids TEXT,
      first_seen_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS eva_public_player_stats (
      user_id INTEGER PRIMARY KEY,
      player_id INTEGER,
      username TEXT,
      display_name TEXT,
      current_stats TEXT,
      all_stats TEXT,
      season_id INTEGER,
      refreshed_at INTEGER NOT NULL,
      error TEXT,
      FOREIGN KEY(user_id) REFERENCES eva_public_users(user_id)
    );

    CREATE TABLE IF NOT EXISTS eva_public_locations (
      location_id INTEGER PRIMARY KEY,
      identifier TEXT,
      name TEXT,
      country TEXT,
      refreshed_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS eva_public_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  return db;
}

function getState(db, key, fallback = null) {
  const row = db.prepare('SELECT value FROM eva_public_state WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setState(db, key, value) {
  db.prepare(`
    INSERT INTO eva_public_state (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(key, String(value), Date.now());
}

async function graphql(query, variables = {}, token = null, attempt = 1) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Origin: 'https://app.eva.gg',
    Referer: 'https://app.eva.gg/',
    'eva-client-app-name': 'eva-app',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers['x-access-token'] = token;
  }

  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });

  if (response.status === 429 && attempt < RETRY_MAX) {
    const retryAfter = parseRetryAfterMs(response.headers.get('retry-after'));
    const backoff = Math.max(retryAfter, attempt * attempt * 1500);
    log(`429 recu, pause ${Math.round(backoff / 1000)}s avant retry ${attempt + 1}/${RETRY_MAX}.`);
    await wait(backoff);
    return graphql(query, variables, token, attempt + 1);
  }

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (err) {
    throw new Error(`GraphQL ${response.status}: ${text.slice(0, 300)}`);
  }

  if (!response.ok) {
    await wait(MIN_INTERVAL_MS);
    throw new Error(`GraphQL ${response.status}: ${JSON.stringify(payload).slice(0, 400)}`);
  }

  if (payload.errors?.length) {
    const message = payload.errors.map(error => error.message).join(' | ');
    await wait(MIN_INTERVAL_MS);
    throw new Error(message);
  }

  await wait(MIN_INTERVAL_MS);
  return payload.data;
}

async function login() {
  const accessToken = process.env.EVA_ACCESS_TOKEN;
  if (accessToken) {
    const data = await graphql(`
      query me {
        me {
          id
          username
          displayName
        }
      }
    `, {}, accessToken);
    const user = data?.me;
    if (!user) throw new Error('EVA_ACCESS_TOKEN fourni, mais la session EVA est invalide ou expiree.');
    log(`Session token OK pour ${user.username || user.displayName || 'compte EVA'}.`);
    return accessToken;
  }

  const email = process.env.EVA_EMAIL;
  const password = process.env.EVA_PASSWORD;
  if (!email || !password) {
    throw new Error('Identifiants manquants. Ajoute EVA_ACCESS_TOKEN ou EVA_EMAIL/EVA_PASSWORD dans .env.');
  }

  const data = await graphql(`
    query login($email: String!, $password: String!) {
      login(email: $email, password: $password) {
        accessToken
        user {
          id
          username
          displayName
        }
      }
    }
  `, { email, password });

  const token = data?.login?.accessToken;
  if (!token) throw new Error('Login EVA OK mais accessToken absent.');
  log(`Login OK pour ${data.login.user?.username || data.login.user?.displayName || 'compte EVA'}.`);
  return token;
}

async function getActiveSeason(token) {
  const data = await graphql(`
    query getActiveSeason {
      seasonActive {
        id
        seasonNumber
        name
      }
    }
  `, {}, token);
  return data.seasonActive || null;
}

async function refreshLocations(db, token) {
  const data = await graphql(`
    query getLocationList {
      locations(includesComingSoon: false, includesClosed: false, onlyVisible: true) {
        nodes {
          id
          identifier
          name
          country
        }
      }
    }
  `, {}, token);

  const locations = data?.locations?.nodes || [];
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO eva_public_locations (location_id, identifier, name, country, refreshed_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(location_id) DO UPDATE SET
      identifier = excluded.identifier,
      name = excluded.name,
      country = excluded.country,
      refreshed_at = excluded.refreshed_at
  `);

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const location of locations) {
      stmt.run(location.id, location.identifier || null, location.name || null, location.country || null, now);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  log(`Villes EVA sauvegardees: ${locations.length}.`);
}

async function fetchUsersPage(page, token) {
  return graphql(`
    query getUserPage($page: Int, $isPublic: Boolean, $eSportEnabled: Boolean) {
      users(page: $page, isPublic: $isPublic, eSportEnabled: $eSportEnabled) {
        nodes {
          id
          username
          displayName
          fullName
          isPublic
          eSportEnabled
          eSportLocationIdList
        }
        totalCount
        pageInfo {
          current
          itemsLimit
          total
        }
      }
    }
  `, { page, isPublic: true, eSportEnabled: true }, token);
}

async function crawlUsers(db, token) {
  const startPage = Number(getArgValue('--from-page') || getState(db, 'users_next_page', '1'));
  const maxPages = Number(getArgValue('--pages') || USER_PAGE_LIMIT || 0);
  let page = Math.max(1, startPage);
  let crawledPages = 0;
  let totalSaved = 0;

  const stmt = db.prepare(`
    INSERT INTO eva_public_users (
      user_id, username, display_name, full_name, is_public, esport_enabled,
      esport_location_ids, first_seen_at, last_seen_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      username = excluded.username,
      display_name = excluded.display_name,
      full_name = excluded.full_name,
      is_public = excluded.is_public,
      esport_enabled = excluded.esport_enabled,
      esport_location_ids = excluded.esport_location_ids,
      last_seen_at = excluded.last_seen_at
  `);

  while (true) {
    if (maxPages > 0 && crawledPages >= maxPages) break;

    const data = await fetchUsersPage(page, token);
    const payload = data?.users;
    const nodes = payload?.nodes || [];
    if (nodes.length === 0) {
      log(`Page utilisateurs ${page}: vide, fin du crawl.`);
      break;
    }

    const now = Date.now();
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const user of nodes) {
        stmt.run(
          user.id,
          user.username || null,
          user.displayName || null,
          user.fullName || null,
          user.isPublic ? 1 : 0,
          user.eSportEnabled ? 1 : 0,
          JSON.stringify(user.eSportLocationIdList || []),
          now,
          now
        );
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    totalSaved += nodes.length;
    crawledPages += 1;
    page += 1;
    setState(db, 'users_next_page', page);

    const current = payload.pageInfo?.current || page - 1;
    const totalPages = payload.pageInfo?.total || '?';
    log(`Utilisateurs page ${current}/${totalPages}: +${nodes.length} (total session ${totalSaved}).`);

    if (payload.pageInfo?.total && current >= payload.pageInfo.total) break;
  }

  log(`Crawl utilisateurs termine: ${totalSaved} lignes vues sur ${crawledPages} page(s).`);
}

function seedUsersFromEnv(db) {
  const userIds = [
    ...parseIdList(process.env.EVA_PUBLIC_SEED_USER_IDS),
    ...parseIdList(getArgValue('--seed-user-ids')),
  ];
  const uniqueIds = [...new Set(userIds)];
  if (uniqueIds.length === 0) return 0;

  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO eva_public_users (
      user_id, username, display_name, full_name, is_public, esport_enabled,
      esport_location_ids, first_seen_at, last_seen_at
    )
    VALUES (?, NULL, NULL, NULL, NULL, NULL, '[]', ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      last_seen_at = excluded.last_seen_at
  `);

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const userId of uniqueIds) stmt.run(userId, now, now);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  log(`Seeds userId ajoutes/maj: ${uniqueIds.length}.`);
  return uniqueIds.length;
}

function seedUsersFromCache(db) {
  const row = db.prepare('SELECT data FROM cache_snapshot WHERE id = 1').get();
  if (!row?.data) return 0;

  let cache;
  try {
    cache = JSON.parse(row.data);
  } catch (err) {
    log(`Cache principal illisible pour seed userId: ${err.message}`);
    return 0;
  }

  const players = Array.isArray(cache.players) ? cache.players : [];
  const uniquePlayers = new Map();
  for (const player of players) {
    const userId = Number(player?.userId || 0);
    if (userId > 0 && !uniquePlayers.has(userId)) uniquePlayers.set(userId, player);
  }

  if (uniquePlayers.size === 0) return 0;

  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO eva_public_users (
      user_id, username, display_name, full_name, is_public, esport_enabled,
      esport_location_ids, first_seen_at, last_seen_at
    )
    VALUES (?, ?, ?, NULL, NULL, NULL, '[]', ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      username = COALESCE(eva_public_users.username, excluded.username),
      display_name = COALESCE(eva_public_users.display_name, excluded.display_name),
      last_seen_at = excluded.last_seen_at
  `);

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const [userId, player] of uniquePlayers) {
      stmt.run(userId, player.username || null, player.name || null, now, now);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  log(`Seeds depuis cache principal: ${uniquePlayers.size}.`);
  return uniquePlayers.size;
}

function importStatsFromCache(db) {
  const row = db.prepare('SELECT data FROM cache_snapshot WHERE id = 1').get();
  if (!row?.data) return 0;

  let cache;
  try {
    cache = JSON.parse(row.data);
  } catch (err) {
    log(`Cache principal illisible pour import stats: ${err.message}`);
    return 0;
  }

  const players = Array.isArray(cache.players) ? cache.players : [];
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO eva_public_player_stats (
      user_id, player_id, username, display_name, current_stats, all_stats,
      season_id, refreshed_at, error
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT(user_id) DO UPDATE SET
      player_id = excluded.player_id,
      username = excluded.username,
      display_name = excluded.display_name,
      current_stats = excluded.current_stats,
      all_stats = excluded.all_stats,
      season_id = excluded.season_id,
      refreshed_at = excluded.refreshed_at,
      error = NULL
  `);

  let count = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const player of players) {
      const userId = Number(player?.userId || 0);
      if (userId <= 0) continue;
      stmt.run(
        userId,
        Number(player.id || 0) || null,
        player.username || null,
        player.name || null,
        JSON.stringify(player.current || {}),
        JSON.stringify(player.all || {}),
        cache.activeSeason?.id || null,
        now
      );
      count += 1;
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  log(`Stats importees depuis cache principal: ${count}.`);
  return count;
}

function buildStatsSelection(seasonId) {
  return `
    id
    user {
      id
      username
      displayName
    }
    statistics(seasonId: ${seasonId == null ? 'null' : Number(seasonId)}) {
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

async function fetchStatsBatch(userIds, seasonId, token) {
  const fields = userIds
    .map((userId, index) => `p${index}: getPlayerByUserId(userId: ${Number(userId)}) { ${buildStatsSelection(seasonId)} }`)
    .join('\n');

  const data = await graphql(`
    query getPlayerStatsBatch {
      ${fields}
    }
  `, {}, token);

  return userIds.map((userId, index) => ({
    userId,
    player: data[`p${index}`] || null,
  }));
}

async function fetchStatsByUsername(username, seasonId, token) {
  const data = await graphql(`
    query getPublicPlayerByUsername($username: String!) {
      getPublicPlayerByUsername(username: $username) {
        ${buildStatsSelection(seasonId)}
      }
    }
  `, { username }, token);
  return data.getPublicPlayerByUsername || null;
}

function getSeedUsername(db, userId) {
  const row = db.prepare('SELECT username FROM eva_public_users WHERE user_id = ?').get(Number(userId));
  return row?.username || null;
}

function getUsersNeedingStats(db, limit) {
  return db.prepare(`
    SELECT u.user_id, u.username
    FROM eva_public_users u
    LEFT JOIN eva_public_player_stats s ON s.user_id = u.user_id
    WHERE s.user_id IS NULL OR s.error IS NOT NULL
    ORDER BY u.last_seen_at DESC
    LIMIT ?
  `).all(Number(limit || 100000));
}

async function refreshStats(db, token, season) {
  const limit = Number(getArgValue('--limit') || STAT_LIMIT || 100000);
  const entries = getUsersNeedingStats(db, limit);
  if (entries.length === 0) {
    log('Aucun utilisateur public en attente de stats.');
    return;
  }

  const stmt = db.prepare(`
    INSERT INTO eva_public_player_stats (
      user_id, player_id, username, display_name, current_stats, all_stats,
      season_id, refreshed_at, error
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      player_id = excluded.player_id,
      username = excluded.username,
      display_name = excluded.display_name,
      current_stats = excluded.current_stats,
      all_stats = excluded.all_stats,
      season_id = excluded.season_id,
      refreshed_at = excluded.refreshed_at,
      error = excluded.error
  `);

  let done = 0;
  let ok = 0;
  let missing = 0;
  const startedAt = Date.now();

  for (let index = 0; index < entries.length; index += STAT_BATCH_SIZE) {
    const batch = entries.slice(index, index + STAT_BATCH_SIZE);
    const results = [];
    const userIdEntries = [];

    for (const entry of batch) {
      if (!entry.username) {
        userIdEntries.push(entry);
        continue;
      }

      try {
        results.push({
          userId: entry.user_id,
          player: await fetchStatsByUsername(entry.username, season?.id || null, token),
          error: null,
        });
      } catch (err) {
        results.push({ userId: entry.user_id, player: null, error: err.message });
      }
    }

    if (userIdEntries.length > 0) {
      try {
        results.push(...await fetchStatsBatch(userIdEntries.map(entry => entry.user_id), season?.id || null, token));
      } catch (err) {
        if (STAT_BATCH_SIZE > 1) {
          log(`Batch stats en erreur (${err.message}), retry unitaire.`);
          for (const entry of userIdEntries) {
            try {
              results.push(...await fetchStatsBatch([entry.user_id], season?.id || null, token));
            } catch (singleErr) {
              results.push({ userId: entry.user_id, player: null, error: singleErr.message });
            }
          }
        } else {
          for (const entry of userIdEntries) {
            results.push({ userId: entry.user_id, player: null, error: err.message });
          }
        }
      }
    }

    for (const result of results) {
      if (result.player || !result.error || !/not allowed|not authorized/i.test(result.error)) continue;
      const seedUsername = getSeedUsername(db, result.userId);
      if (!seedUsername) continue;

      try {
        result.player = await fetchStatsByUsername(seedUsername, season?.id || null, token);
        result.error = null;
      } catch (fallbackErr) {
        result.error = `${result.error} | fallback username: ${fallbackErr.message}`;
      }
    }

    const now = Date.now();
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const result of results) {
        const player = result.player;
        const error = result.error || null;

        if (!player) {
          missing += 1;
          stmt.run(result.userId, null, null, null, null, null, season?.id || null, now, error || 'Player not found');
          continue;
        }

        ok += 1;
        stmt.run(
          result.userId,
          player.id || null,
          player.user?.username || null,
          player.user?.displayName || null,
          JSON.stringify(normalizeStats(player.statistics?.data || {})),
          JSON.stringify(normalizeStats(player.allStatistics?.data || {})),
          season?.id || null,
          now,
          null
        );
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    done += results.length;
    const elapsedSeconds = Math.max(1, (Date.now() - startedAt) / 1000);
    const speed = done / elapsedSeconds;
    const remaining = entries.length - done;
    const etaSeconds = remaining / Math.max(0.001, speed);
    log(`Stats ${done}/${entries.length} | OK ${ok} | absents ${missing} | ${speed.toFixed(2)} joueurs/s | ETA ${Math.round(etaSeconds / 60)} min.`);
  }

  log(`Stats terminees: ${ok} OK, ${missing} absents/erreurs.`);
}

function printStatus(db) {
  const users = db.prepare('SELECT COUNT(*) AS count FROM eva_public_users').get().count;
  const stats = db.prepare('SELECT COUNT(*) AS count FROM eva_public_player_stats WHERE error IS NULL').get().count;
  const errors = db.prepare('SELECT COUNT(*) AS count FROM eva_public_player_stats WHERE error IS NOT NULL').get().count;
  const locations = db.prepare('SELECT COUNT(*) AS count FROM eva_public_locations').get().count;
  const nextPage = getState(db, 'users_next_page', '1');
  log(`Status: users=${users} stats=${stats} errors=${errors} locations=${locations} nextPage=${nextPage}.`);
}

async function main() {
  const db = openDb();
  if (hasArg('--status')) {
    printStatus(db);
    return;
  }

  const token = await login();
  if (hasArg('--login-only')) return;

  const season = await getActiveSeason(token);
  log(`Saison active: ${season?.seasonNumber || '?'} (id=${season?.id || 'n/a'}).`);

  if (!hasArg('--stats-only')) {
    await refreshLocations(db, token);
    if (hasArg('--seed-cache') || process.env.EVA_PUBLIC_SEED_CACHE === '1') {
      seedUsersFromCache(db);
      importStatsFromCache(db);
    }
    seedUsersFromEnv(db);
    if (!hasArg('--seed-only')) {
      try {
        await crawlUsers(db, token);
      } catch (err) {
        log(`Annuaire global inaccessible avec ce compte: ${err.message}`);
        log('On continue avec les userId seeds si disponibles.');
      }
    }
  } else {
    if (hasArg('--seed-cache') || process.env.EVA_PUBLIC_SEED_CACHE === '1') {
      seedUsersFromCache(db);
      importStatsFromCache(db);
    }
    seedUsersFromEnv(db);
  }

  if (!hasArg('--users-only')) {
    await refreshStats(db, token, season);
  }

  printStatus(db);
}

main().catch(err => {
  console.error(`[EVA-PUBLIC] Arret fatal: ${err.message}`);
  process.exit(1);
});
