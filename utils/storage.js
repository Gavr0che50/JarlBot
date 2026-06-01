const path = require('path');

let DatabaseSync = null;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (err) {
  throw new Error('node:sqlite est requis pour le stockage SQLite du bot.');
}

const DB_PATH = path.join(__dirname, '..', 'bot-state.db');

let db = null;

function openDb() {
  if (db) return db;

  db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS defis (
      message_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      message_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  return db;
}

function readTable(table) {
  const rows = openDb().prepare(`SELECT message_id, data FROM ${table}`).all();
  const result = {};
  for (const row of rows) {
    if (!row?.message_id || !row.data) continue;
    try {
      result[row.message_id] = JSON.parse(row.data);
    } catch (err) {
      console.warn(`⚠️ Donnée SQLite illisible dans ${table} pour ${row.message_id}: ${err.message}`);
    }
  }
  return result;
}

function upsert(table, messageId, payload) {
  if (!messageId) return;

  openDb().prepare(`
    INSERT INTO ${table} (message_id, data, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(message_id) DO UPDATE SET
      data = excluded.data,
      updated_at = excluded.updated_at
  `).run(String(messageId), JSON.stringify(payload), Date.now());
}

function remove(table, messageId) {
  if (!messageId) return;
  openDb().prepare(`DELETE FROM ${table} WHERE message_id = ?`).run(String(messageId));
}

function getOne(table, messageId) {
  if (!messageId) return null;

  const row = openDb().prepare(`SELECT data FROM ${table} WHERE message_id = ?`).get(String(messageId));
  if (!row?.data) return null;

  try {
    return JSON.parse(row.data);
  } catch (err) {
    console.warn(`⚠️ Donnée SQLite illisible pour ${table}/${messageId}: ${err.message}`);
    return null;
  }
}

function lireDefis() {
  return readTable('defis');
}

function sauverDefi(messageId, defi) {
  upsert('defis', messageId, defi);
}

function getDefi(messageId) {
  return getOne('defis', messageId);
}

function supprimerDefi(messageId) {
  remove('defis', messageId);
}

function lireSessions() {
  return readTable('sessions');
}

function sauverSession(messageId, session) {
  upsert('sessions', messageId, session);
}

function getSession(messageId) {
  return getOne('sessions', messageId);
}

function supprimerSession(messageId) {
  remove('sessions', messageId);
}

module.exports = {
  lireDefis,
  sauverDefi,
  getDefi,
  supprimerDefi,
  lireSessions,
  sauverSession,
  getSession,
  supprimerSession,
};
