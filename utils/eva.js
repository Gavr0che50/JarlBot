const fs = require('fs');
const path = require('path');
const config = require('../config');

let DatabaseSync = null;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (err) {
  console.warn('⚠️ node:sqlite indisponible, le bot retombera sur le cache local.');
}

const EVA_DATA_DB_FILE = path.join(__dirname, '..', 'eva-cache.db');
const EVA_DATA_CACHE_FILE = path.join(__dirname, '..', 'eva-data-cache.json');
const EVA_DATA_CACHE_BACKUP_FILE = path.join(__dirname, '..', 'eva-data-cache.backup.json');
const EVA_PLAYER_INDEX_LIMIT = 50000;
const EVA_PLAYER_QUEUE_LIMIT = 32;

let requestQueue = Promise.resolve();
let refreshPromise = null;
let schedulerStarted = false;
let adaptiveRequestDelayMs = null;
let playerResolutionBackoffMs = 0;
let playerResolutionCooldownUntil = 0;
let playerResolution429Streak = 0;
let evaRefreshStateLoaded = false;
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

function parseRetryAfterMs(value) {
  if (value == null) return 0;
  const raw = String(value).trim();
  if (!raw) return 0;

  const deltaSeconds = Number(raw);
  if (Number.isFinite(deltaSeconds)) {
    return Math.max(0, deltaSeconds * 1000);
  }

  const timestamp = Date.parse(raw);
  if (!Number.isNaN(timestamp)) {
    return Math.max(0, timestamp - Date.now());
  }

  return 0;
}

function getRetryAfterMsFromSource(source) {
  if (source == null) return 0;
  if (Number.isFinite(source)) return Math.max(0, Number(source));
  if (typeof source === 'string') return parseRetryAfterMs(source);

  if (typeof source === 'object') {
    if (Number.isFinite(source.retryAfterMs)) return Math.max(0, Number(source.retryAfterMs));
    if (Number.isFinite(source.retryAfter)) return Math.max(0, Number(source.retryAfter) * 1000);

    if (typeof source.headers?.get === 'function') {
      return parseRetryAfterMs(source.headers.get('retry-after'));
    }

    if (source.response && typeof source.response.headers?.get === 'function') {
      return parseRetryAfterMs(source.response.headers.get('retry-after'));
    }
  }

  return parseRetryAfterMs(source);
}

function getRequestCacheMs() {
  return Number(config.EVA_REQUEST_CACHE_MS || process.env.EVA_REQUEST_CACHE_MS || 10 * 60 * 1000);
}

function getPublicPlayerBatchSize() {
  return Number(config.EVA_PUBLIC_PLAYER_BATCH_SIZE || process.env.EVA_PUBLIC_PLAYER_BATCH_SIZE || 8);
}

function getPlayerResolutionIntervalMs() {
  return Number(config.EVA_PLAYER_RESOLUTION_INTERVAL_MS || process.env.EVA_PLAYER_RESOLUTION_INTERVAL_MS || 1000);
}

function getPlayerResolutionJitterMs() {
  return Number(config.EVA_PLAYER_RESOLUTION_JITTER_MS || process.env.EVA_PLAYER_RESOLUTION_JITTER_MS || 1000);
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
  const retryAfter = getRetryAfterMsFromSource(retryAfterMs);
  adaptiveRequestDelayMs = Math.min(
    Number(config.EVA_RATE_LIMIT_MAX_DELAY_MS || 5000),
    Math.max(getAdaptiveDelayMs() * 1.5, retryAfter, getRateLimitDelayMs())
  );
}

function isRateLimitError(err) {
  const message = String(err?.message || err || '');
  return message.includes('429') || message.toLowerCase().includes('too many requests');
}

function notePlayerResolutionRateLimit(retryAfterMs = 0) {
  const retryAfter = getRetryAfterMsFromSource(retryAfterMs);
  playerResolution429Streak += 1;

  const ladder = [5, 15, 30, 60].map(minutes => minutes * 60 * 1000);
  const fallbackDelay = ladder[Math.min(playerResolution429Streak - 1, ladder.length - 1)];
  const jitter = Math.floor(Math.random() * Math.max(250, getPlayerResolutionJitterMs()));
  const nextDelay = Math.max(
    retryAfter,
    fallbackDelay + jitter,
    playerResolutionBackoffMs > 0 ? Math.round(playerResolutionBackoffMs * 1.5) : 0
  );

  playerResolutionBackoffMs = nextDelay;
  playerResolutionCooldownUntil = Date.now() + nextDelay;
  try {
    writeEvaRefreshState({
      playerResolutionCooldownUntil,
      playerResolutionBackoffMs,
      playerResolution429Streak,
    });
  } catch (err) {
    console.warn(`⚠️ État de pause EVA impossible à sauvegarder: ${err.message}`);
  }
  console.warn(`⚠️ Backoff joueurs activé après 429: pause ${Math.round(nextDelay / 1000)}s.`);
  return nextDelay;
}

async function waitForPlayerResolutionSlot() {
  const cooldownRemaining = Math.max(0, playerResolutionCooldownUntil - Date.now());
  if (cooldownRemaining > 0) {
    await wait(cooldownRemaining);
    return;
  }

  const baseDelay = getPlayerResolutionIntervalMs();
  const jitter = Math.floor(Math.random() * Math.max(1, getPlayerResolutionJitterMs()));
  const delayMs = Math.max(baseDelay + jitter, playerResolutionBackoffMs);
  if (delayMs > 0) await wait(delayMs);
}

function noteSuccessfulPlayerResolution() {
  if (playerResolutionBackoffMs <= 0) return;
  playerResolutionBackoffMs = Math.max(0, Math.round(playerResolutionBackoffMs * 0.85));
  if (playerResolutionBackoffMs < 1000) {
    playerResolutionBackoffMs = 0;
    playerResolution429Streak = 0;
    playerResolutionCooldownUntil = 0;
  }
  try {
    writeEvaRefreshState({
      playerResolutionCooldownUntil,
      playerResolutionBackoffMs,
      playerResolution429Streak,
    });
  } catch (err) {
    console.warn(`⚠️ État de pause EVA impossible à sauvegarder: ${err.message}`);
  }
}

function createRateLimitError(source, context = 'EVA') {
  const retryAfterMs = getRetryAfterMsFromSource(source);
  const status = Number(source?.status || source?.response?.status || 429);
  const message = String(source?.message || `${context} rate limited (${status})`).trim();
  const error = new Error(message);
  error.status = status;
  error.retryAfterMs = retryAfterMs;
  error.retryAfter = retryAfterMs > 0 ? Math.ceil(retryAfterMs / 1000) : 0;
  error.isRateLimit = true;
  error.context = context;
  return error;
}

function shouldRunInlineRefresh() {
  return String(process.env.EVA_DISABLE_INLINE_REFRESH || '').trim() !== '1';
}

function createPlayerRefreshMetrics() {
  return {
    known: { total: 0, resolved: 0, missing: 0, rateLimited: 0 },
    scan: { total: 0, resolved: 0, missing: 0, rateLimited: 0 },
    queue: { total: 0, resolved: 0, missing: 0, rateLimited: 0 },
    cachedPlayersBefore: 0,
    cachedPlayersDuring: 0,
    discoveredTotal: 0,
  };
}

function logPlayerRefreshProgress(stage, metrics) {
  const totalResolved = metrics.known.resolved + metrics.scan.resolved + metrics.queue.resolved;
  const totalRequested = metrics.known.total + metrics.scan.total + metrics.queue.total;
  const totalRateLimited = metrics.known.rateLimited + metrics.scan.rateLimited + metrics.queue.rateLimited;
  const cacheSize = metrics.cachedPlayersDuring || metrics.cachedPlayersBefore || 0;
  const backoffText = playerResolutionBackoffMs > 0 ? ` | backoff ${playerResolutionBackoffMs}ms` : '';
  console.log(
    `📈 [EVA] ${stage} | résolus ${totalResolved}/${totalRequested} | ` +
    `connus ${metrics.known.resolved}/${metrics.known.total} | ` +
    `scan ${metrics.scan.resolved}/${metrics.scan.total} | ` +
    `queue ${metrics.queue.resolved}/${metrics.queue.total} | ` +
    `429 ${totalRateLimited} | cache ${cacheSize}${backoffText}`
  );
}

function getCaenRegionId() {
  return config.EVA_CAEN_REGION_ID || process.env.EVA_CAEN_REGION_ID || config.EVA_DEFAULT_CAEN_REGION_ID;
}

function getLocalLeaguesCircuitId() {
  return config.EVA_LOCAL_LEAGUES_CIRCUIT_ID || process.env.EVA_LOCAL_LEAGUES_CIRCUIT_ID || config.EVA_DEFAULT_LOCAL_LEAGUES_CIRCUIT_ID;
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

    CREATE TABLE IF NOT EXISTS player_index (
      competitive_user_id TEXT PRIMARY KEY,
      username TEXT,
      name TEXT,
      team_name TEXT,
      last_seen_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS player_queue (
      competitive_user_id TEXT PRIMARY KEY,
      username TEXT,
      name TEXT,
      team_name TEXT,
      source TEXT NOT NULL,
      source_ref TEXT,
      priority INTEGER NOT NULL DEFAULT 100,
      status TEXT NOT NULL DEFAULT 'pending',
      discovered_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      last_attempt_at INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at INTEGER NOT NULL DEFAULT 0,
      resolved_at INTEGER NOT NULL DEFAULT 0,
      last_error TEXT
    );

    CREATE TABLE IF NOT EXISTS refresh_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      player_resolution_cooldown_until INTEGER NOT NULL,
      player_resolution_backoff_ms INTEGER NOT NULL,
      player_resolution_429_streak INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

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

    CREATE INDEX IF NOT EXISTS idx_eva_public_users_username
      ON eva_public_users(username);

    CREATE INDEX IF NOT EXISTS idx_eva_public_users_display_name
      ON eva_public_users(display_name);

    CREATE INDEX IF NOT EXISTS idx_eva_public_stats_username
      ON eva_public_player_stats(username);
  `);
  hydrateEvaRefreshStateFromDb(evaDb);
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

function getEvaCacheDbUpdatedAt() {
  const db = openEvaDb();
  if (!db || !fs.existsSync(EVA_DATA_DB_FILE)) return 0;

  try {
    const row = db.prepare('SELECT updated_at FROM cache_snapshot WHERE id = 1').get();
    return Number(row?.updated_at || 0);
  } catch (err) {
    console.warn(`⚠️ Date de cache EVA illisible: ${err.message}`);
    return 0;
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

function deleteLegacyEvaCacheFiles() {
  for (const file of [EVA_DATA_CACHE_FILE, EVA_DATA_CACHE_BACKUP_FILE]) {
    if (!fs.existsSync(file)) continue;
    try {
      fs.unlinkSync(file);
    } catch (err) {
      console.warn(`⚠️ Impossible de supprimer ${path.basename(file)}: ${err.message}`);
    }
  }
}

function migrateLegacyEvaCacheFilesToDb() {
  const db = openEvaDb();
  if (!db) return;

  const dbSnapshot = readEvaCacheFromDb();
  const cache = readJsonFile(EVA_DATA_CACHE_FILE, null);
  const backup = readJsonFile(EVA_DATA_CACHE_BACKUP_FILE, null);
  const bestLegacy = getCacheScore(backup) > getCacheScore(cache) ? backup : cache;

  if (!bestLegacy || !Array.isArray(bestLegacy.players) || !Array.isArray(bestLegacy.teams)) {
    return;
  }

  const legacyUpdatedAt = Number(bestLegacy.updatedAt || 0);
  const currentUpdatedAt = Number(dbSnapshot?.updatedAt || 0);

  if (dbSnapshot && currentUpdatedAt >= legacyUpdatedAt) {
    deleteLegacyEvaCacheFiles();
    return;
  }

  const normalized = normalizeEvaCache(bestLegacy);
  try {
    writeEvaCacheToDb(normalized);
    evaCacheMemory = normalized;
    deleteLegacyEvaCacheFiles();
    console.log(`📦 Cache EVA legacy migré vers SQLite (${normalized.players.length} joueur(s), ${normalized.teams.length} équipe(s)).`);
  } catch (err) {
    console.warn(`⚠️ Impossible de migrer le cache EVA legacy vers SQLite: ${err.message}`);
  }
}

function readEvaRefreshState(db = null) {
  db = db || openEvaDb();
  if (!db) return null;

  try {
    const row = db.prepare(`
      SELECT player_resolution_cooldown_until, player_resolution_backoff_ms, player_resolution_429_streak
      FROM refresh_state
      WHERE id = 1
    `).get();
    if (!row) return null;
    return {
      playerResolutionCooldownUntil: Number(row.player_resolution_cooldown_until || 0),
      playerResolutionBackoffMs: Number(row.player_resolution_backoff_ms || 0),
      playerResolution429Streak: Number(row.player_resolution_429_streak || 0),
    };
  } catch (err) {
    console.warn(`⚠️ État de refresh EVA illisible: ${err.message}`);
    return null;
  }
}

function writeEvaRefreshState(state = {}) {
  const db = openEvaDb();
  if (!db) return false;

  const payload = {
    playerResolutionCooldownUntil: Math.max(0, Number(state.playerResolutionCooldownUntil || 0)),
    playerResolutionBackoffMs: Math.max(0, Number(state.playerResolutionBackoffMs || 0)),
    playerResolution429Streak: Math.max(0, Number(state.playerResolution429Streak || 0)),
  };

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      INSERT INTO refresh_state (
        id,
        player_resolution_cooldown_until,
        player_resolution_backoff_ms,
        player_resolution_429_streak,
        updated_at
      ) VALUES (1, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        player_resolution_cooldown_until = excluded.player_resolution_cooldown_until,
        player_resolution_backoff_ms = excluded.player_resolution_backoff_ms,
        player_resolution_429_streak = excluded.player_resolution_429_streak,
        updated_at = excluded.updated_at
    `).run(
      payload.playerResolutionCooldownUntil,
      payload.playerResolutionBackoffMs,
      payload.playerResolution429Streak,
      Date.now()
    );
    db.exec('COMMIT');
    return true;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function hydrateEvaRefreshStateFromDb(db = null) {
  if (evaRefreshStateLoaded) return;
  evaRefreshStateLoaded = true;
  const persisted = readEvaRefreshState(db);
  if (!persisted) return;

  playerResolutionCooldownUntil = Math.max(0, persisted.playerResolutionCooldownUntil || 0);
  playerResolutionBackoffMs = Math.max(0, persisted.playerResolutionBackoffMs || 0);
  playerResolution429Streak = Math.max(0, persisted.playerResolution429Streak || 0);
}

function readPlayerDiscoveryIndex(limit = EVA_PLAYER_INDEX_LIMIT) {
  const db = openEvaDb();
  if (!db) return new Map();

  try {
    const rows = db.prepare(`
      SELECT competitive_user_id, username, name, team_name, last_seen_at
      FROM player_index
      ORDER BY last_seen_at DESC
      LIMIT ?
    `).all(Number(limit || EVA_PLAYER_INDEX_LIMIT));

    const index = new Map();
    for (const row of rows) {
      if (!row?.competitive_user_id) continue;
      index.set(row.competitive_user_id, {
        competitiveUserId: row.competitive_user_id,
        username: row.username || null,
        name: row.name || null,
        teamName: row.team_name || null,
        lastSeenAt: Number(row.last_seen_at || 0),
      });
    }
    return index;
  } catch (err) {
    console.warn(`⚠️ Index joueurs SQLite illisible: ${err.message}`);
    return new Map();
  }
}

function writePlayerDiscoveryIndex(players = []) {
  const db = openEvaDb();
  if (!db || !Array.isArray(players) || players.length === 0) return;

  const stmt = db.prepare(`
    INSERT INTO player_index (
      competitive_user_id,
      username,
      name,
      team_name,
      last_seen_at
    ) VALUES (
      @competitive_user_id,
      @username,
      @name,
      @team_name,
      @last_seen_at
    )
    ON CONFLICT(competitive_user_id) DO UPDATE SET
      username = excluded.username,
      name = excluded.name,
      team_name = excluded.team_name,
      last_seen_at = excluded.last_seen_at
  `);

  const timestamp = Date.now();
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const player of players) {
      if (!player?.competitiveUserId) continue;
      stmt.run({
        competitive_user_id: String(player.competitiveUserId),
        username: player.username || null,
        name: player.name || null,
        team_name: player.teamName || null,
        last_seen_at: timestamp,
      });
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function getPlayerDiscoveryQueueBatchSize() {
  return Number(config.EVA_PLAYER_DISCOVERY_BATCH_SIZE || process.env.EVA_PLAYER_DISCOVERY_BATCH_SIZE || EVA_PLAYER_QUEUE_LIMIT);
}

function getPlayerDiscoveryStaleMs() {
  return Number(config.EVA_PLAYER_DISCOVERY_STALE_MS || process.env.EVA_PLAYER_DISCOVERY_STALE_MS || getRefreshMs());
}

function upsertPlayerDiscoveryQueue(entries = []) {
  const db = openEvaDb();
  if (!db || !Array.isArray(entries) || entries.length === 0) return;

  const stmt = db.prepare(`
    INSERT INTO player_queue (
      competitive_user_id,
      username,
      name,
      team_name,
      source,
      source_ref,
      priority,
      status,
      discovered_at,
      last_seen_at,
      last_attempt_at,
      attempts,
      next_attempt_at,
      resolved_at,
      last_error
    ) VALUES (
      @competitive_user_id,
      @username,
      @name,
      @team_name,
      @source,
      @source_ref,
      @priority,
      @status,
      @discovered_at,
      @last_seen_at,
      @last_attempt_at,
      @attempts,
      @next_attempt_at,
      @resolved_at,
      @last_error
    )
    ON CONFLICT(competitive_user_id) DO UPDATE SET
      username = CASE
        WHEN excluded.username IS NOT NULL AND excluded.username <> '' THEN excluded.username
        ELSE player_queue.username
      END,
      name = CASE
        WHEN excluded.name IS NOT NULL AND excluded.name <> '' THEN excluded.name
        ELSE player_queue.name
      END,
      team_name = CASE
        WHEN excluded.team_name IS NOT NULL AND excluded.team_name <> '' THEN excluded.team_name
        ELSE player_queue.team_name
      END,
      source = CASE
        WHEN excluded.priority < player_queue.priority THEN excluded.source
        ELSE player_queue.source
      END,
      source_ref = CASE
        WHEN excluded.priority < player_queue.priority THEN excluded.source_ref
        ELSE COALESCE(player_queue.source_ref, excluded.source_ref)
      END,
      priority = MIN(player_queue.priority, excluded.priority),
      status = CASE
        WHEN player_queue.status = 'resolved' THEN player_queue.status
        WHEN excluded.status = 'resolved' THEN 'resolved'
        WHEN player_queue.status = 'missing' AND excluded.status = 'pending' THEN 'pending'
        ELSE COALESCE(excluded.status, player_queue.status)
      END,
      discovered_at = MIN(player_queue.discovered_at, excluded.discovered_at),
      last_seen_at = MAX(player_queue.last_seen_at, excluded.last_seen_at),
      last_attempt_at = CASE
        WHEN excluded.last_attempt_at > player_queue.last_attempt_at THEN excluded.last_attempt_at
        ELSE player_queue.last_attempt_at
      END,
      attempts = MAX(player_queue.attempts, excluded.attempts),
      next_attempt_at = CASE
        WHEN excluded.next_attempt_at > player_queue.next_attempt_at THEN excluded.next_attempt_at
        ELSE player_queue.next_attempt_at
      END,
      resolved_at = CASE
        WHEN player_queue.status = 'resolved' THEN player_queue.resolved_at
        WHEN excluded.status = 'resolved' THEN excluded.resolved_at
        ELSE player_queue.resolved_at
      END,
      last_error = CASE
        WHEN excluded.last_error IS NOT NULL AND excluded.last_error <> '' THEN excluded.last_error
        ELSE player_queue.last_error
      END
  `);

  const now = Date.now();
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const entry of entries) {
      if (!entry?.competitive_user_id) continue;
      const competitiveUserId = String(entry.competitive_user_id);
      const priority = Number.isFinite(entry.priority) ? Number(entry.priority) : 100;
      const discoveredAt = Number(entry.discovered_at || now);
      const lastSeenAt = Number(entry.last_seen_at || discoveredAt || now);
      const status = String(entry.status || 'pending');
      stmt.run({
        competitive_user_id: competitiveUserId,
        username: entry.username || null,
        name: entry.name || null,
        team_name: entry.team_name || null,
        source: String(entry.source || 'unknown'),
        source_ref: entry.source_ref == null ? null : String(entry.source_ref),
        priority,
        status,
        discovered_at: discoveredAt,
        last_seen_at: lastSeenAt,
        last_attempt_at: Number(entry.last_attempt_at || 0),
        attempts: Math.max(0, Number(entry.attempts || 0)),
        next_attempt_at: Math.max(0, Number(entry.next_attempt_at || 0)),
        resolved_at: Math.max(0, Number(entry.resolved_at || 0)),
        last_error: entry.last_error || null,
      });
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function readPlayerDiscoveryQueue(limit = EVA_PLAYER_QUEUE_LIMIT, staleMs = getPlayerDiscoveryStaleMs()) {
  const db = openEvaDb();
  if (!db) return [];

  const now = Date.now();
  const staleAt = Math.max(0, now - Number(staleMs || 0));

  try {
    return db.prepare(`
      SELECT
        competitive_user_id,
        username,
        name,
        team_name,
        source,
        source_ref,
        priority,
        status,
        discovered_at,
        last_seen_at,
        last_attempt_at,
        attempts,
        next_attempt_at,
        resolved_at,
        last_error
      FROM player_queue
      WHERE next_attempt_at <= ?
        AND (
          status IN ('pending', 'missing')
          OR (status = 'resolved' AND resolved_at <= ?)
        )
      ORDER BY priority ASC, next_attempt_at ASC, last_seen_at DESC, discovered_at ASC
      LIMIT ?
    `).all(now, staleAt, Number(limit || EVA_PLAYER_QUEUE_LIMIT));
  } catch (err) {
    console.warn(`⚠️ Queue joueurs SQLite illisible: ${err.message}`);
    return [];
  }
}

function getPlayerDiscoveryQueueStats() {
  const db = openEvaDb();
  if (!db) {
    return {
      total: 0,
      pending: 0,
      missing: 0,
      resolved: 0,
      ready: 0,
      deferred: 0,
      oldestDiscoveredAt: 0,
      nextAttemptAt: 0,
    };
  }

  try {
    const totals = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'missing' THEN 1 ELSE 0 END) AS missing,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved,
        SUM(CASE WHEN next_attempt_at <= ? AND (status IN ('pending', 'missing') OR status = 'resolved') THEN 1 ELSE 0 END) AS ready,
        SUM(CASE WHEN next_attempt_at > ? THEN 1 ELSE 0 END) AS deferred,
        MIN(discovered_at) AS oldestDiscoveredAt,
        MIN(CASE WHEN next_attempt_at > ? THEN next_attempt_at ELSE NULL END) AS nextAttemptAt
      FROM player_queue
    `).get(Date.now(), Date.now(), Date.now());

    return {
      total: Number(totals?.total || 0),
      pending: Number(totals?.pending || 0),
      missing: Number(totals?.missing || 0),
      resolved: Number(totals?.resolved || 0),
      ready: Number(totals?.ready || 0),
      deferred: Number(totals?.deferred || 0),
      oldestDiscoveredAt: Number(totals?.oldestDiscoveredAt || 0),
      nextAttemptAt: Number(totals?.nextAttemptAt || 0),
    };
  } catch (err) {
    console.warn(`⚠️ Statistiques queue EVA illisibles: ${err.message}`);
    return {
      total: 0,
      pending: 0,
      missing: 0,
      resolved: 0,
      ready: 0,
      deferred: 0,
      oldestDiscoveredAt: 0,
      nextAttemptAt: 0,
    };
  }
}

function writePlayerDiscoveryQueueResult(competitiveUserId, patch = {}) {
  const db = openEvaDb();
  if (!db || !competitiveUserId) return false;

  const payload = {
    competitive_user_id: String(competitiveUserId),
    username: patch.username || null,
    name: patch.name || null,
    team_name: patch.team_name || null,
    source: patch.source || 'unknown',
    source_ref: patch.source_ref == null ? null : String(patch.source_ref),
    priority: Number.isFinite(patch.priority) ? Number(patch.priority) : 100,
    status: patch.status || 'pending',
    discovered_at: Math.max(0, Number(patch.discovered_at || Date.now())),
    last_seen_at: Math.max(0, Number(patch.last_seen_at || Date.now())),
    last_attempt_at: Math.max(0, Number(patch.last_attempt_at || Date.now())),
    attempts: Math.max(0, Number(patch.attempts || 0)),
    next_attempt_at: Math.max(0, Number(patch.next_attempt_at || 0)),
    resolved_at: Math.max(0, Number(patch.resolved_at || 0)),
    last_error: patch.last_error || null,
  };

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      UPDATE player_queue SET
        username = COALESCE(?, username),
        name = COALESCE(?, name),
        team_name = COALESCE(?, team_name),
        source = COALESCE(?, source),
        source_ref = COALESCE(?, source_ref),
        priority = MIN(priority, ?),
        status = ?,
        discovered_at = MIN(discovered_at, ?),
        last_seen_at = MAX(last_seen_at, ?),
        last_attempt_at = ?,
        attempts = ?,
        next_attempt_at = ?,
        resolved_at = ?,
        last_error = ?
      WHERE competitive_user_id = ?
    `).run(
      payload.username,
      payload.name,
      payload.team_name,
      payload.source,
      payload.source_ref,
      payload.priority,
      payload.status,
      payload.discovered_at,
      payload.last_seen_at,
      payload.last_attempt_at,
      payload.attempts,
      payload.next_attempt_at,
      payload.resolved_at,
      payload.last_error,
      payload.competitive_user_id
    );
    db.exec('COMMIT');
    return true;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function markPlayerDiscoveryQueueResolved(entry, publicPlayer, username) {
  const now = Date.now();
  writePlayerDiscoveryQueueResult(entry.competitive_user_id, {
    username,
    name: entry.name || publicPlayer?.name || username,
    team_name: entry.team_name || publicPlayer?.teamName || null,
    source: entry.source,
    source_ref: entry.source_ref,
    priority: entry.priority,
    status: 'resolved',
    discovered_at: entry.discovered_at,
    last_seen_at: now,
    last_attempt_at: now,
    attempts: Number(entry.attempts || 0) + 1,
    next_attempt_at: 0,
    resolved_at: now,
    last_error: null,
  });
}

function markPlayerDiscoveryQueueMissing(entry, lastError = null, retryAfterMs = 0) {
  const now = Date.now();
  const parsedDelay = Number(retryAfterMs || 0);
  const delay = parsedDelay > 0 ? parsedDelay : 60 * 60 * 1000;
  writePlayerDiscoveryQueueResult(entry.competitive_user_id, {
    username: entry.username || null,
    name: entry.name || null,
    team_name: entry.team_name || null,
    source: entry.source,
    source_ref: entry.source_ref,
    priority: entry.priority,
    status: 'missing',
    discovered_at: entry.discovered_at,
    last_seen_at: now,
    last_attempt_at: now,
    attempts: Number(entry.attempts || 0) + 1,
    next_attempt_at: now + delay,
    resolved_at: Number(entry.resolved_at || 0),
    last_error: lastError ? String(lastError.message || lastError) : null,
  });
}

function markPlayerDiscoveryQueueDeferred(entry, retryAfterMs = 0, lastError = null) {
  const now = Date.now();
  const parsedDelay = Number(retryAfterMs || 0);
  const delay = parsedDelay > 0 ? parsedDelay : 30 * 60 * 1000;
  writePlayerDiscoveryQueueResult(entry.competitive_user_id, {
    username: entry.username || null,
    name: entry.name || null,
    team_name: entry.team_name || null,
    source: entry.source,
    source_ref: entry.source_ref,
    priority: entry.priority,
    status: 'pending',
    discovered_at: entry.discovered_at,
    last_seen_at: now,
    last_attempt_at: now,
    attempts: Number(entry.attempts || 0) + 1,
    next_attempt_at: now + delay,
    resolved_at: Number(entry.resolved_at || 0),
    last_error: lastError ? String(lastError.message || lastError) : null,
  });
}

function buildPlayerDiscoverySeeds({
  currentPlayers = [],
  playerIndex = new Map(),
  teams = [],
  tournamentPlayers = [],
  refreshKnownPlayers = true,
} = {}) {
  const now = Date.now();
  const seedsById = new Map();

  const mergeSeed = (entry) => {
    if (!entry?.competitive_user_id) return;
    const key = String(entry.competitive_user_id);
    const existing = seedsById.get(key);
    if (!existing) {
      seedsById.set(key, {
        competitive_user_id: key,
        username: entry.username || null,
        name: entry.name || null,
        team_name: entry.team_name || null,
        source: entry.source || 'unknown',
        source_ref: entry.source_ref == null ? null : String(entry.source_ref),
        priority: Number.isFinite(entry.priority) ? Number(entry.priority) : 100,
        status: entry.status || 'pending',
        discovered_at: Math.max(0, Number(entry.discovered_at || now)),
        last_seen_at: Math.max(0, Number(entry.last_seen_at || now)),
        last_attempt_at: Math.max(0, Number(entry.last_attempt_at || 0)),
        attempts: Math.max(0, Number(entry.attempts || 0)),
        next_attempt_at: Math.max(0, Number(entry.next_attempt_at || 0)),
        resolved_at: Math.max(0, Number(entry.resolved_at || 0)),
        last_error: entry.last_error || null,
      });
      return;
    }

    const previousPriority = existing.priority;
    existing.username = existing.username || entry.username || null;
    existing.name = existing.name || entry.name || null;
    existing.team_name = existing.team_name || entry.team_name || null;
    if (Number.isFinite(entry.priority)) existing.priority = Math.min(existing.priority, Number(entry.priority));
    if (entry.source && (Number.isFinite(entry.priority) && Number(entry.priority) < previousPriority)) {
      existing.source = entry.source;
      existing.source_ref = entry.source_ref == null ? existing.source_ref : String(entry.source_ref);
    }
    if (entry.status === 'resolved' || existing.status === 'resolved') {
      existing.status = 'resolved';
    } else if (entry.status === 'missing' && existing.status !== 'resolved') {
      existing.status = 'missing';
    } else if (entry.status === 'pending' && existing.status !== 'resolved') {
      existing.status = 'pending';
    }
    existing.discovered_at = Math.min(existing.discovered_at, Math.max(0, Number(entry.discovered_at || now)));
    existing.last_seen_at = Math.max(existing.last_seen_at, Math.max(0, Number(entry.last_seen_at || now)));
    existing.last_attempt_at = Math.max(existing.last_attempt_at, Math.max(0, Number(entry.last_attempt_at || 0)));
    existing.attempts = Math.max(existing.attempts, Math.max(0, Number(entry.attempts || 0)));
    existing.next_attempt_at = Math.max(existing.next_attempt_at, Math.max(0, Number(entry.next_attempt_at || 0)));
    existing.resolved_at = Math.max(existing.resolved_at, Math.max(0, Number(entry.resolved_at || 0)));
    existing.last_error = entry.last_error || existing.last_error || null;
  };

  for (const player of currentPlayers) {
    if (!player?.competitiveUserId) continue;
    mergeSeed({
      competitive_user_id: player.competitiveUserId,
      username: player.username || null,
      name: player.name || null,
      team_name: player.teamName || null,
      source: 'cache',
      source_ref: player.username || player.id || null,
      priority: 1,
      status: refreshKnownPlayers ? 'pending' : 'resolved',
      discovered_at: Number(player.discoveredAt || now),
      last_seen_at: now,
      resolved_at: refreshKnownPlayers ? 0 : Number(player.updatedAt || now),
    });
  }

  for (const [competitiveUserId, entry] of playerIndex.entries()) {
    if (!competitiveUserId) continue;
    mergeSeed({
      competitive_user_id: competitiveUserId,
      username: entry.username || null,
      name: entry.name || null,
      team_name: entry.teamName || null,
      source: 'player-index',
      source_ref: entry.username || null,
      priority: 2,
      status: entry.username && !refreshKnownPlayers ? 'resolved' : 'pending',
      discovered_at: entry.lastSeenAt || now,
      last_seen_at: entry.lastSeenAt || now,
      resolved_at: entry.username && !refreshKnownPlayers ? (entry.lastSeenAt || now) : 0,
    });
  }

  for (const team of teams) {
    const ownerId = team?.playerOwner?.id;
    if (!ownerId) continue;
    mergeSeed({
      competitive_user_id: ownerId,
      username: null,
      name: team.name || null,
      team_name: team.name || null,
      source: 'team-owner',
      source_ref: team.id || null,
      priority: 5,
      status: 'pending',
      discovered_at: now,
      last_seen_at: now,
    });
  }

  for (const player of tournamentPlayers) {
    if (!player?.id) continue;
    mergeSeed({
      competitive_user_id: player.id,
      username: null,
      name: player.name || null,
      team_name: player.teamName || null,
      source: 'tournament-participant',
      source_ref: player.teamName || null,
      priority: 10,
      status: 'pending',
      discovered_at: now,
      last_seen_at: now,
    });
  }

  return [...seedsById.values()].sort((a, b) =>
    a.priority - b.priority ||
    b.last_seen_at - a.last_seen_at ||
    a.discovered_at - b.discovered_at ||
    String(a.competitive_user_id).localeCompare(String(b.competitive_user_id))
  );
}

async function refreshPlayerDiscoveryQueue(activeSeason, baseCache, metrics = null) {
  const resolvedPlayers = [];
  const staleMs = getPlayerDiscoveryStaleMs();
  const batchSize = getPlayerDiscoveryQueueBatchSize();
  let deferredUntil = 0;

  while (true) {
    const queueEntries = readPlayerDiscoveryQueue(batchSize, staleMs);
    if (queueEntries.length === 0) break;

    if (metrics) metrics.queue.total += queueEntries.length;

    const resolvedSummaries = [];
    for (const entry of queueEntries) {
      if (deferredUntil > Date.now()) break;

      let username = String(entry.username || '').trim();
      let name = entry.name || null;
      let teamName = entry.team_name || null;

      if (!username) {
        await waitForPlayerResolutionSlot();
        const competitivePlayer = await getCompetitivePlayer(entry.competitive_user_id).catch(err => {
          if (isRateLimitError(err)) {
            notePlayerResolutionRateLimit(err);
            deferredUntil = Math.max(deferredUntil, playerResolutionCooldownUntil);
            if (metrics) metrics.queue.rateLimited += 1;
            markPlayerDiscoveryQueueDeferred(entry, playerResolutionCooldownUntil - Date.now(), err);
            return null;
          }
          console.warn(`⚠️ Résolution compétitive impossible pour ${entry.competitive_user_id}: ${err.message}`);
          if (metrics) metrics.queue.missing += 1;
          markPlayerDiscoveryQueueMissing(entry, err, 6 * 60 * 60 * 1000);
          return null;
        });

        if (deferredUntil > Date.now() || !competitivePlayer) {
          continue;
        }

        username = getEvaIdentifier(competitivePlayer) || '';
        name = name || competitivePlayer.name || null;
        if (competitivePlayer?.teamName && !teamName) teamName = competitivePlayer.teamName;

        writePlayerDiscoveryIndex([{
          competitiveUserId: entry.competitive_user_id,
          username: username || null,
          name,
          teamName,
        }]);

        if (!username) {
          markPlayerDiscoveryQueueMissing(entry, new Error('Identifiant EVA introuvable'), 12 * 60 * 60 * 1000);
          if (metrics) metrics.queue.missing += 1;
          continue;
        }

        writePlayerDiscoveryQueueResult(entry.competitive_user_id, {
          username,
          name,
          team_name: teamName,
          source: entry.source,
          source_ref: entry.source_ref,
          priority: entry.priority,
          status: entry.status === 'resolved' ? 'resolved' : 'pending',
          discovered_at: entry.discovered_at,
          last_seen_at: Date.now(),
          last_attempt_at: Date.now(),
          attempts: Number(entry.attempts || 0) + 1,
          next_attempt_at: 0,
          resolved_at: Number(entry.resolved_at || 0),
          last_error: null,
        });
      }

      if (!username) continue;

      resolvedSummaries.push({
        entry,
        username,
        summary: {
          id: entry.competitive_user_id,
          name,
          teamName,
        },
      });
    }

    if (deferredUntil > Date.now()) break;
    if (resolvedSummaries.length === 0) continue;

    let publicPlayersByUsername = new Map();
    try {
      publicPlayersByUsername = await getPublicPlayersByUsernamesAdaptive(
        resolvedSummaries.map(item => item.username),
        activeSeason?.id,
        { maxBatchSize: getPublicPlayerBatchSize() }
      );
    } catch (err) {
      if (isRateLimitError(err)) {
        notePlayerResolutionRateLimit(err);
        deferredUntil = Math.max(deferredUntil, playerResolutionCooldownUntil);
        for (const item of resolvedSummaries) {
          markPlayerDiscoveryQueueDeferred(item.entry, deferredUntil - Date.now(), err);
        }
        if (metrics) metrics.queue.rateLimited += resolvedSummaries.length;
        break;
      }
      console.warn(`⚠️ Résolution publique par lot impossible: ${err.message}`);
      for (const item of resolvedSummaries) {
        markPlayerDiscoveryQueueMissing(item.entry, err, 6 * 60 * 60 * 1000);
      }
      if (metrics) metrics.queue.missing += resolvedSummaries.length;
      continue;
    }

    const batchPlayers = [];
    for (const item of resolvedSummaries) {
      const publicPlayer = publicPlayersByUsername.get(item.username.toLowerCase()) || null;
      if (!publicPlayer) {
        markPlayerDiscoveryQueueMissing(item.entry, new Error('Profil public EVA introuvable'), 12 * 60 * 60 * 1000);
        if (metrics) metrics.queue.missing += 1;
        continue;
      }

      noteSuccessfulPlayerResolution();
      if (metrics) metrics.queue.resolved += 1;

      const normalized = normalizePublicPlayerRecord(publicPlayer, item.summary, item.username);
      batchPlayers.push(normalized);
      resolvedPlayers.push(normalized);
      markPlayerDiscoveryQueueResolved(item.entry, publicPlayer, item.username);
    }

    if (batchPlayers.length > 0) {
      const partial = uniqueBy(
        [...baseCache.players || [], ...resolvedPlayers],
        player => player.username.toLowerCase()
      ).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      writeIncrementalPlayersCache(baseCache, partial);
      if (metrics) {
        metrics.cachedPlayersDuring = partial.length;
        metrics.discoveredTotal = partial.length;
        logPlayerRefreshProgress('queue joueurs', metrics);
      }
    }
  }

  return {
    players: uniqueBy(resolvedPlayers, player => player.username.toLowerCase())
      .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    deferredUntil,
  };
}

function getCacheScore(cache) {
  if (!cache || !Array.isArray(cache.players) || !Array.isArray(cache.teams)) return 0;
  const rankedTeams = cache.teams.filter(team => team.bestRanking).length;
  const localLeagueStandings = Array.isArray(cache.localLeagueStandings) ? cache.localLeagueStandings.length : 0;
  const bonus = Number(config.EVA_CACHE_BEST_SCORE_BONUS || 100000);
  return (cache.buildComplete ? bonus : 0) + (cache.players.length * 10) + rankedTeams + cache.teams.length + localLeagueStandings;
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
  if (evaCacheMemory) {
    const dbUpdatedAt = getEvaCacheDbUpdatedAt();
    if (dbUpdatedAt > Number(evaCacheMemory.updatedAt || 0)) {
      const fromDb = readEvaCacheFromDb();
      if (fromDb) {
        evaCacheMemory = fromDb;
        deleteLegacyEvaCacheFiles();
      }
    }
    return evaCacheMemory;
  }

  const fromDb = readEvaCacheFromDb();
  if (fromDb) {
    evaCacheMemory = fromDb;
    deleteLegacyEvaCacheFiles();
    return evaCacheMemory;
  }

  evaCacheMemory = getEmptyEvaCache();
  migrateLegacyEvaCacheFilesToDb();
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

  deleteLegacyEvaCacheFiles();
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
    const timeout = setTimeout(() => controller.abort(), Number(config.EVA_GRAPHQL_TIMEOUT_MS || 5000));
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  });

  requestQueue = scheduled.catch(() => null);
  const response = await scheduled;

  if (response.status === 429) {
    noteRateLimited(parseRetryAfterMs(response.headers.get('retry-after')));
    return response;
  }

  noteSuccessfulRequest();
  return response;
}

async function callCompetitive(endpoint, options = {}) {
  const headers = { Accept: 'application/json' };
  if (options.range) headers.Range = options.range;

  const response = await fetchWithEvaRateLimit(`${getCompetitiveBaseUrl()}${endpoint}`, { headers });
  if (response.status === 429) {
    const text = await response.text().catch(() => '');
    throw createRateLimitError({
      status: 429,
      retryAfterMs: parseRetryAfterMs(response.headers.get('retry-after')),
      message: `EVA Competitive API error 429: ${text || 'Too Many Requests'}`,
      response,
    }, 'competitive');
  }
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

    if (response.status === 429) {
      const text = await response.text().catch(() => '');
      throw createRateLimitError({
        status: 429,
        retryAfterMs: parseRetryAfterMs(response.headers.get('retry-after')),
        message: `EVA GraphQL error 429: ${text || 'Too Many Requests'}`,
        response,
      }, 'graphql');
    }

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
        .catch(err => {
          if (isRateLimitError(err)) throw err;
          return new Map();
        });
    }

    try {
      return await getPublicPlayersByUsernames(chunk, seasonId, { maxRetries: 1 });
    } catch (err) {
      if (isRateLimitError(err)) throw err;
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

async function resolvePublicPlayerBatch(summaries, activeSeason, knownUsernamesByCompetitiveId = new Map(), metrics = null) {
  const candidatesByUsername = new Map();

  for (const summary of summaries || []) {
    if (!summary?.id) continue;

    let username = knownUsernamesByCompetitiveId.get(summary.id) || null;
    let name = summary.name || null;
    let teamName = summary.teamName || null;

    if (!username) {
      const competitivePlayer = await getCompetitivePlayer(summary.id).catch(err => {
        if (isRateLimitError(err)) {
          notePlayerResolutionRateLimit(err);
          if (metrics) metrics.scan.rateLimited += 1;
        } else if (metrics) {
          metrics.scan.missing += 1;
        }
        return null;
      });
      username = competitivePlayer ? getEvaIdentifier(competitivePlayer) : null;
      name = name || competitivePlayer?.name || null;
      teamName = teamName || competitivePlayer?.team?.name || null;
    }

    if (!username) {
      if (metrics) metrics.scan.missing += 1;
      continue;
    }

    const key = username.toLowerCase();
    if (!candidatesByUsername.has(key)) {
      candidatesByUsername.set(key, {
        id: summary.id,
        name: name || username,
        teamName,
        username,
      });
    }
  }

  const candidates = [...candidatesByUsername.values()];
  if (candidates.length === 0) return { players: [], deferredUntil: 0 };

  let publicPlayersByUsername;
  try {
    publicPlayersByUsername = await getPublicPlayersByUsernamesAdaptive(
      candidates.map(candidate => candidate.username),
      activeSeason?.id,
      { maxBatchSize: getPublicPlayerBatchSize() }
    );
  } catch (err) {
    if (isRateLimitError(err)) {
      notePlayerResolutionRateLimit(err);
      return { players: [], deferredUntil: playerResolutionCooldownUntil };
    }
    console.warn(`⚠️ Lot profils publics ignoré: ${err.message}`);
    return { players: [], deferredUntil: 0 };
  }

  const players = [];
  for (const candidate of candidates) {
    const publicPlayer = publicPlayersByUsername.get(candidate.username.toLowerCase());
    if (!publicPlayer) {
      if (metrics) metrics.scan.missing += 1;
      continue;
    }

    const normalized = normalizePublicPlayerRecord(publicPlayer, candidate, candidate.username);
    if (!normalized) continue;
    if (metrics) metrics.scan.resolved += 1;
    players.push(normalized);
  }

  return {
    players: uniqueBy(players, player => player.username.toLowerCase())
      .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    deferredUntil: 0,
  };
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

    await waitForPlayerResolutionSlot();
    const publicPlayer = await getPublicPlayerByUsername(username, activeSeason?.id).catch(err => {
      if (isRateLimitError(err)) notePlayerResolutionRateLimit(err);
      return null;
    });
    if (!publicPlayer) {
      if (onProgress && index > 0 && index % 25 === 0) onProgress(players, index, playerSummaries.length);
      continue;
    }
    noteSuccessfulPlayerResolution();

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

async function resolvePublicPlayerSummary(summary, activeSeason, knownUsername = null, metrics = null) {
  let username = knownUsername;
  if (!username) {
    const competitivePlayer = await getCompetitivePlayer(summary.id).catch(() => null);
    username = competitivePlayer ? getEvaIdentifier(competitivePlayer) : null;
  }
  if (!username) {
    if (metrics) metrics.scan.missing += 1;
    return { player: null, deferredUntil: 0 };
  }

  await waitForPlayerResolutionSlot();
  let publicPlayer = null;
  try {
    publicPlayer = await getPublicPlayerByUsername(username, activeSeason?.id);
  } catch (err) {
    if (metrics) {
      metrics.scan.missing += 1;
      if (isRateLimitError(err)) metrics.scan.rateLimited += 1;
    }
    if (isRateLimitError(err)) {
      notePlayerResolutionRateLimit(err);
      return { player: null, deferredUntil: playerResolutionCooldownUntil };
    }
    return { player: null, deferredUntil: 0 };
  }

  if (!publicPlayer) return { player: null, deferredUntil: 0 };

  noteSuccessfulPlayerResolution();
  if (metrics) metrics.scan.resolved += 1;

  return { player: normalizePublicPlayerRecord(publicPlayer, summary, username), deferredUntil: 0 };
}

async function refreshKnownPlayers(existingPlayers, activeSeason, baseCache, metrics = null) {
  const refreshed = [];
  const knownPlayers = uniqueBy(
    (existingPlayers || []).filter(player => player?.username),
    player => player.username.toLowerCase()
  );

  for (let index = 0; index < knownPlayers.length; index += 1) {
    const existing = knownPlayers[index];
    const startedAt = Date.now();
    if (metrics) metrics.known.total += 1;

    await waitForPlayerResolutionSlot();
    const publicPlayer = await getPublicPlayerByUsername(existing.username, activeSeason?.id).catch(err => {
      console.warn(`⚠️ Refresh joueur connu impossible pour ${existing.username}: ${err.message}`);
      if (metrics) {
        metrics.known.missing += 1;
        if (isRateLimitError(err)) metrics.known.rateLimited += 1;
      }
      if (isRateLimitError(err)) notePlayerResolutionRateLimit(err);
      return null;
    });

    if (!publicPlayer && playerResolutionCooldownUntil > Date.now()) {
      const partial = uniqueBy(refreshed, item => item.username.toLowerCase())
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      writeIncrementalPlayersCache(baseCache, partial);
      if (metrics) {
        metrics.cachedPlayersDuring = partial.length;
        logPlayerRefreshProgress(`pause joueurs connus ${index + 1}/${knownPlayers.length}`, metrics);
      }
      return {
        players: partial,
        deferredUntil: playerResolutionCooldownUntil,
      };
    }

    if (publicPlayer) {
      const normalized = normalizePublicPlayerRecord(publicPlayer, existing, existing.username);
      if (normalized) {
        noteSuccessfulPlayerResolution();
        if (metrics) metrics.known.resolved += 1;
        refreshed.push({
          ...normalized,
          competitiveUserId: existing.competitiveUserId,
          name: existing.name || normalized.name,
          teamName: existing.teamName || normalized.teamName,
        });
      }
    }

    const partial = uniqueBy(refreshed, item => item.username.toLowerCase())
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    writeIncrementalPlayersCache(baseCache, partial);
    if (metrics) {
      metrics.cachedPlayersDuring = partial.length;
      logPlayerRefreshProgress(`joueurs connus ${index + 1}/${knownPlayers.length}`, metrics);
    } else {
      console.log(`📊 [EVA] joueurs connus ${index + 1}/${knownPlayers.length}`);
    }

    const elapsed = Date.now() - startedAt;
    const delayMs = Math.max(0, getPlayerResolutionIntervalMs() - elapsed);
    if (delayMs > 0) {
      await wait(delayMs);
    }
  }

  return {
    players: uniqueBy(refreshed, item => item.username.toLowerCase())
      .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    deferredUntil: 0,
  };
}

async function refreshKnownPlayersFast(existingPlayers, activeSeason, baseCache, metrics = null) {
  const refreshed = [];
  const knownPlayers = uniqueBy(
    (existingPlayers || []).filter(player => player?.username),
    player => player.username.toLowerCase()
  );
  const batchSize = Math.max(1, getPublicPlayerBatchSize());

  for (let index = 0; index < knownPlayers.length; index += batchSize) {
    const batch = knownPlayers.slice(index, index + batchSize);
    if (metrics) metrics.known.total += batch.length;

    let publicPlayersByUsername = new Map();
    try {
      publicPlayersByUsername = await getPublicPlayersByUsernamesAdaptive(
        batch.map(player => player.username),
        activeSeason?.id,
        { maxBatchSize: batchSize }
      );
    } catch (err) {
      console.warn(`⚠️ Refresh joueurs connus impossible pour le lot ${index + 1}-${index + batch.length}: ${err.message}`);
      if (isRateLimitError(err)) {
        notePlayerResolutionRateLimit(err);
        if (metrics) metrics.known.rateLimited += batch.length;
        return {
          players: uniqueBy(refreshed, item => item.username.toLowerCase())
            .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
          deferredUntil: playerResolutionCooldownUntil,
        };
      }
      if (metrics) metrics.known.missing += batch.length;
    }

    for (const existing of batch) {
      const publicPlayer = publicPlayersByUsername.get(existing.username.toLowerCase());
      if (!publicPlayer) {
        if (metrics) metrics.known.missing += 1;
        continue;
      }

      const normalized = normalizePublicPlayerRecord(publicPlayer, existing, existing.username);
      if (!normalized) continue;
      noteSuccessfulPlayerResolution();
      if (metrics) metrics.known.resolved += 1;
      refreshed.push({
        ...normalized,
        competitiveUserId: existing.competitiveUserId,
        name: existing.name || normalized.name,
        teamName: existing.teamName || normalized.teamName,
      });
    }

    const partial = uniqueBy(refreshed, item => item.username.toLowerCase())
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    writeIncrementalPlayersCache(baseCache, partial);
    if (metrics) {
      metrics.cachedPlayersDuring = partial.length;
      logPlayerRefreshProgress(`joueurs connus ${Math.min(index + batch.length, knownPlayers.length)}/${knownPlayers.length}`, metrics);
    } else {
      console.log(`📊 [EVA] joueurs connus ${Math.min(index + batch.length, knownPlayers.length)}/${knownPlayers.length}`);
    }
  }

  return {
    players: uniqueBy(refreshed, item => item.username.toLowerCase())
      .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    deferredUntil: 0,
  };
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

function writeIncrementalPlayersCache(baseCache, players) {
  writeEvaDataCache({
    ...baseCache,
    updatedAt: Date.now(),
    players: mergePlayers(players, baseCache.players || []),
    buildComplete: false,
  });
}

function getCacheAgeMs(cache = readEvaDataCache()) {
  return Date.now() - Number(cache.updatedAt || 0);
}

function isCacheOlderThan(cache = readEvaDataCache(), maxAgeMs = 24 * 60 * 60 * 1000) {
  return getCacheAgeMs(cache) >= Number(maxAgeMs || 0);
}

async function ensureEvaCacheFresh({ maxAgeMs = 24 * 60 * 60 * 1000, force = false } = {}) {
  const cache = readEvaDataCache();
  const missing = !cache.updatedAt || !cache.players?.length || !cache.teams?.length;
  const stale = isCacheOlderThan(cache, maxAgeMs);

  if (force || missing || stale) {
    const result = await refreshEvaDataCache({ force: true }).catch(err => {
      console.warn(`⚠️ Refresh EVA impossible: ${err.message}`);
      return null;
    });

    if (result?.cache) return result.cache;
    if (result?.updatedAt) return result;
  }

  return cache;
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

  const deferredUntil = Math.max(0, playerResolutionCooldownUntil);
  if (deferredUntil > Date.now()) {
    const cache = normalizeEvaCache(current);
    console.log(`📴 [EVA] rafraîchissement différé jusqu'à ${new Date(deferredUntil).toLocaleString('fr-FR')} après 429.`);
    return { cache, deferredUntil };
  }

  refreshPromise = (async () => {
    console.log('📊 Mise à jour du cache EVA...');
    const metrics = createPlayerRefreshMetrics();
    const activeSeason = await getActiveSeason();
    const tournaments = (await getAllTournaments())
      .filter(tournament => tournament.discipline === 'after_humanity' && tournament.public !== false);
    const allTeams = await getAllTeams();
    const initialTeams = allTeams.map(normalizeTeam).sort((a, b) => a.name.localeCompare(b.name, 'fr'));

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
    console.log(`📊 Cache EVA de base mis à jour (${initialTeams.length} équipe(s)). Seed discovery en cours...`);

    const [tournamentDiscoveryResult, teamsWithRankingsResult, localLeagueStandingsResult] = await Promise.allSettled([
      discoverTournamentEntities(tournaments),
      buildTeamsSnapshot(allTeams, [], activeSeason),
      buildLocalLeagueStandings(tournaments, activeSeason),
    ]);

    const buildRejections = [tournamentDiscoveryResult, teamsWithRankingsResult, localLeagueStandingsResult]
      .filter(result => result.status === 'rejected')
      .map(result => result.reason)
      .filter(Boolean);
    const rateLimitBuildError = buildRejections.find(err => isRateLimitError(err));

    if (rateLimitBuildError) {
      const retryAfterMs = getRetryAfterMsFromSource(rateLimitBuildError);
      noteRateLimited(retryAfterMs);
      const deferredAt = Date.now() + Math.max(retryAfterMs, getAdaptiveDelayMs());
      const cache = {
        ...partialCache,
        updatedAt: Date.now(),
        buildComplete: false,
      };
      writeEvaDataCache(cache);
      console.log(`📴 [EVA] build compétitif différé jusqu'à ${new Date(deferredAt).toLocaleString('fr-FR')} après 429.`);
      return { cache: normalizeEvaCache(cache), deferredUntil: deferredAt };
    }

    const tournamentDiscovery = tournamentDiscoveryResult.status === 'fulfilled'
      ? tournamentDiscoveryResult.value
      : { players: [], teams: [] };
    const teamsWithRankings = teamsWithRankingsResult.status === 'fulfilled'
      ? teamsWithRankingsResult.value
      : initialTeams;
    const localLeagueStandings = localLeagueStandingsResult.status === 'fulfilled'
      ? localLeagueStandingsResult.value
      : current.localLeagueStandings || [];
    const caenStandings = localLeagueStandings.find(standing => standing.regionId === getCaenRegionId()) || null;

    const rankedCache = {
      ...partialCache,
      updatedAt: Date.now(),
      players: current.players || [],
      teams: teamsWithRankings,
      localLeagueStandings,
      caenStandings,
      buildComplete: false,
    };
    writeEvaDataCache(rankedCache);
    console.log(
      `📊 Cache EVA enrichi (${teamsWithRankings.filter(team => team.bestRanking).length} équipe(s) classée(s)). ` +
      `Seed players: ${Array.isArray(tournamentDiscovery.players) ? tournamentDiscovery.players.length : 0}.`
    );

    metrics.cachedPlayersBefore = Array.isArray(current.players) ? current.players.length : 0;
    const storedPlayerIndex = readPlayerDiscoveryIndex();
    const seeds = buildPlayerDiscoverySeeds({
      currentPlayers: current.players || [],
      playerIndex: storedPlayerIndex,
      teams: allTeams,
      tournamentPlayers: Array.isArray(tournamentDiscovery.players) ? tournamentDiscovery.players : [],
      refreshKnownPlayers: true,
    });
    upsertPlayerDiscoveryQueue(seeds);
    console.log(`📦 Queue EVA seedée (${seeds.length} candidat(s)).`);
    if (Array.isArray(current.players) && current.players.length > 0) {
      try {
        writePlayerDiscoveryIndex(current.players);
      } catch (err) {
        console.warn(`⚠️ Index joueurs initial impossible: ${err.message}`);
      }
    }

    const refreshedKnown = await refreshKnownPlayersFast(current.players || [], activeSeason, rankedCache, metrics);
    let finalPlayers = mergePlayers(refreshedKnown.players || [], current.players || []);
    let scanDeferredUntil = refreshedKnown.deferredUntil || 0;

    const knownUsernamesByCompetitiveId = new Map(
      finalPlayers
        .filter(player => player?.competitiveUserId && player?.username)
        .map(player => [player.competitiveUserId, player.username])
    );
    const scannedIds = new Set(finalPlayers.map(player => player?.competitiveUserId).filter(Boolean));
    const tournamentPlayers = Array.isArray(tournamentDiscovery.players) ? tournamentDiscovery.players : [];
    const scanBatchSize = Math.max(1, getPublicPlayerBatchSize());

    for (let index = 0; index < tournamentPlayers.length; index += scanBatchSize) {
      if (scanDeferredUntil && scanDeferredUntil > Date.now()) break;

      const batch = tournamentPlayers.slice(index, index + scanBatchSize)
        .filter(summary => summary?.id && !scannedIds.has(summary.id));
      for (const summary of batch) scannedIds.add(summary.id);
      if (batch.length === 0) continue;

      metrics.scan.total += batch.length;
      const batchResult = await resolvePublicPlayerBatch(batch, activeSeason, knownUsernamesByCompetitiveId, metrics);
      if (batchResult?.deferredUntil && batchResult.deferredUntil > Date.now()) {
        scanDeferredUntil = batchResult.deferredUntil;
        break;
      }

      finalPlayers = mergePlayers(batchResult?.players || [], finalPlayers);
      for (const player of batchResult?.players || []) {
        if (player?.competitiveUserId && player?.username) {
          knownUsernamesByCompetitiveId.set(player.competitiveUserId, player.username);
        }
      }

      if ((index + batch.length) % 25 === 0 || (batchResult?.players || []).length > 0) {
        writeIncrementalPlayersCache(rankedCache, finalPlayers);
        metrics.cachedPlayersDuring = finalPlayers.length;
        logPlayerRefreshProgress(`joueurs scannes ${Math.min(index + scanBatchSize, tournamentPlayers.length)}/${tournamentPlayers.length}`, metrics);
      }
    }
    const cache = {
      ...rankedCache,
      updatedAt: Date.now(),
      players: finalPlayers,
      localLeagueStandings,
      caenStandings,
      buildComplete: !(scanDeferredUntil && scanDeferredUntil > Date.now()),
    };
    writeEvaDataCache(cache);
    metrics.cachedPlayersDuring = finalPlayers.length;
    metrics.discoveredTotal = finalPlayers.length;
    try {
      writePlayerDiscoveryIndex(finalPlayers);
    } catch (err) {
      console.warn(`⚠️ Index joueurs final impossible: ${err.message}`);
    }
    logPlayerRefreshProgress(scanDeferredUntil && scanDeferredUntil > Date.now() ? 'pause decouverte joueurs' : 'termine', metrics);
    console.log(`📊 Cache EVA mis à jour (${finalPlayers.length} joueur(s), ${rankedCache.teams.length} équipe(s)).`);
    return { cache, deferredUntil: scanDeferredUntil && scanDeferredUntil > Date.now() ? scanDeferredUntil : 0 };
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

function startEvaCacheRefreshScheduler() {
  if (schedulerStarted) return;
  if (!shouldRunInlineRefresh()) {
    schedulerStarted = true;
    console.log('📴 [EVA] refresh embarqué désactivé; utilisez le worker autonome pour peupler la base.');
    return;
  }
  schedulerStarted = true;

  const run = () => {
    refreshEvaDataCache()
      .catch(err => console.error('❌ Mise à jour cache EVA impossible :', err));
  };

  run();
  setInterval(run, getRefreshMs());
}

async function getCachedCompetitivePlayers() {
  startEvaCacheRefreshScheduler();
  return readEvaDataCache().players;
}

async function getCachedCompetitivePlayersHybrid(options = {}) {
  const cache = await ensureEvaCacheFresh(options);
  return cache.players || [];
}

function getAllEvaTeams() {
  return readEvaDataCache().teams;
}

async function getAllEvaTeamsHybrid(options = {}) {
  const cache = await ensureEvaCacheFresh(options);
  return cache.teams || [];
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

async function getLocalLeagueStandingsHybrid({ maxAgeMs = 24 * 60 * 60 * 1000 } = {}) {
  const cache = await ensureEvaCacheFresh({ maxAgeMs });
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

function normalizeLookupText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9#]+/g, '');
}

function getUsernameBase(username) {
  return String(username || '').trim().split('#')[0] || '';
}

function safeParseJson(value, fallback = null) {
  if (value == null || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function levenshteinDistance(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  let current = new Array(right.length + 1).fill(0);

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const insertion = current[j - 1] + 1;
      const deletion = previous[j] + 1;
      const substitution = previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1);
      current[j] = Math.min(insertion, deletion, substitution);
    }
    [previous, current] = [current, previous];
  }

  return previous[right.length];
}

function getPlayerLookupFields(player) {
  return uniqueBy([
    player?.username || null,
    getUsernameBase(player?.username),
    player?.name || null,
    player?.displayName || null,
    player?.fullName || null,
  ].filter(Boolean), value => normalizeLookupText(value));
}

function scorePlayerLookup(query, player) {
  const normalizedQuery = normalizeLookupText(query);
  if (!normalizedQuery) return 0;

  let best = 0;
  for (const field of getPlayerLookupFields(player)) {
    const normalizedField = normalizeLookupText(field);
    if (!normalizedField) continue;

    if (normalizedField === normalizedQuery) {
      best = Math.max(best, 100);
      continue;
    }

    if (normalizedField === normalizeLookupText(getUsernameBase(field)) && normalizedField === normalizedQuery) {
      best = Math.max(best, 99);
      continue;
    }

    if (normalizeLookupText(getUsernameBase(field)) === normalizedQuery) {
      best = Math.max(best, 98);
      continue;
    }

    if (normalizedField.startsWith(normalizedQuery) || normalizedQuery.startsWith(normalizedField)) {
      const proximity = Math.max(0, 90 - Math.abs(normalizedField.length - normalizedQuery.length));
      best = Math.max(best, proximity);
      continue;
    }

    if (normalizedField.includes(normalizedQuery) || normalizedQuery.includes(normalizedField)) {
      const proximity = Math.max(0, 80 - Math.abs(normalizedField.length - normalizedQuery.length));
      best = Math.max(best, proximity);
      continue;
    }

    const distance = levenshteinDistance(normalizedQuery, normalizedField);
    const scale = Math.max(normalizedQuery.length, normalizedField.length) || 1;
    const similarity = 1 - (distance / scale);
    best = Math.max(best, Math.round(similarity * 70));
  }

  return best;
}

function readPublicPlayerCandidates() {
  const db = openEvaDb();
  if (!db) return [];

  try {
    const rows = db.prepare(`
      SELECT
        u.user_id,
        u.username,
        u.display_name,
        u.full_name,
        u.is_public,
        u.esport_enabled,
        u.esport_location_ids,
        s.player_id,
        s.current_stats,
        s.all_stats,
        s.season_id,
        s.refreshed_at
      FROM eva_public_users u
      LEFT JOIN eva_public_player_stats s ON s.user_id = u.user_id
      WHERE COALESCE(s.error, '') = ''
    `).all();

    return rows.map(row => ({
      source: 'public',
      id: row.player_id || row.user_id,
      userId: row.user_id,
      competitiveUserId: row.player_id ? String(row.player_id) : null,
      username: row.username || null,
      name: row.full_name || row.display_name || row.username || '',
      displayName: row.display_name || null,
      fullName: row.full_name || null,
      teamName: null,
      current: safeParseJson(row.current_stats, null),
      all: safeParseJson(row.all_stats, null),
      seasonId: row.season_id || null,
      refreshedAt: row.refreshed_at || 0,
      isPublic: Boolean(row.is_public),
      esportEnabled: Boolean(row.esport_enabled),
    }));
  } catch (err) {
    console.warn(`⚠️ Impossible de lire les candidats publics EVA: ${err.message}`);
    return [];
  }
}

function findBestPlayerMatch(username, { includePublic = true } = {}) {
  const query = String(username || '').trim();
  if (!query) return null;

  const cache = readEvaDataCache();

  const candidates = [
    ...cache.players.map(player => ({
      source: 'competitive-cache',
      id: player.id,
      userId: player.userId || null,
      competitiveUserId: player.competitiveUserId || null,
      username: player.username || null,
      name: player.name || player.username || '',
      displayName: player.name || null,
      fullName: null,
      teamName: player.teamName || null,
      current: player.current || null,
      all: player.all || null,
      seasonId: cache.activeSeason?.id || null,
      refreshedAt: cache.updatedAt || 0,
    })),
    ...(includePublic ? readPublicPlayerCandidates() : []),
  ].filter(player => player.username || player.name || player.displayName || player.fullName);

  let best = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const score = scorePlayerLookup(query, candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  if (!best || bestScore < 70) return null;
  return { player: best, score: bestScore };
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

async function getPlayerKdaStats(username) {
  const exact = findPlayer(username);
  if (exact) {
    return {
      playerName: exact.username,
      playerId: exact.id,
      userId: exact.userId,
      seasonId: readEvaDataCache().activeSeason?.id,
      seasonNumber: readEvaDataCache().activeSeason?.seasonNumber,
      current: exact.current,
      all: exact.all,
    };
  }

  const resolved = findBestPlayerMatch(username, { includePublic: true });
  if (!resolved) {
    throw new Error('Joueur introuvable dans le cache EVA et aucun profil public assez proche.');
  }

  const player = resolved.player;
  if ((player.current == null || player.all == null) && player.username) {
    const seasonId = readEvaDataCache().activeSeason?.id;
    const publicPlayer = await getPublicPlayerByUsername(player.username, seasonId).catch(() => null);
    if (publicPlayer) {
      const normalized = normalizePublicPlayerRecord(publicPlayer, player, player.username);
      return {
        playerName: normalized.username || normalized.name || player.username,
        playerId: normalized.id,
        userId: normalized.userId,
        seasonId: seasonId,
        seasonNumber: readEvaDataCache().activeSeason?.seasonNumber,
        current: normalized.current,
        all: normalized.all,
      };
    }
  }

  return {
    playerName: player.username || player.name,
    playerId: player.id || player.userId,
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

function getTopPlayers(limit = Number(config.EVA_TOP_PLAYERS_LIMIT || 10)) {
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
  getAllEvaTeamsHybrid,
  getCachedCompetitivePlayers,
  getCachedCompetitivePlayersHybrid,
  getCaenStandings,
  getCaenTeamStats,
  ensureEvaCacheFresh,
  getLocalLeagueStandingsHybrid,
  getLocalLeagueStandings,
  getPlayerKdaStats,
  getPlayerDiscoveryQueueStats,
  getTopPlayers,
  refreshEvaDataCache,
  startEvaCacheRefreshScheduler,
  findLocalLeagueStanding,
};
