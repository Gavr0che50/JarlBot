const fs = require('fs');
const path = require('path');

const FICHIER_DEFIS = path.join(__dirname, '..', 'defis.json');
const FICHIER_SESSIONS = path.join(__dirname, '..', 'sessions.json');
const FICHIER_RESULTATS = path.join(__dirname, '..', 'resultats.json');

// ========================================
// 🛠️ Fonctions génériques (lecture/écriture)
// ========================================

function lireFichier(chemin) {
  if (!fs.existsSync(chemin)) return {};
  try {
    const contenu = fs.readFileSync(chemin, 'utf8');
    return JSON.parse(contenu);
  } catch (err) {
    console.error(`❌ Erreur lecture ${chemin} :`, err);
    return {};
  }
}

function ecrireFichier(chemin, donnees) {
  fs.writeFileSync(chemin, JSON.stringify(donnees, null, 2), 'utf8');
}

// ========================================
// 🎯 Défis
// ========================================

function lireDefis() {
  return lireFichier(FICHIER_DEFIS);
}

function sauverDefi(messageId, defi) {
  const defis = lireDefis();
  defis[messageId] = defi;
  ecrireFichier(FICHIER_DEFIS, defis);
}

function getDefi(messageId) {
  return lireDefis()[messageId] || null;
}

function supprimerDefi(messageId) {
  const defis = lireDefis();
  delete defis[messageId];
  ecrireFichier(FICHIER_DEFIS, defis);
}

// ========================================
// 🎮 Sessions spéciales
// ========================================

function lireSessions() {
  return lireFichier(FICHIER_SESSIONS);
}

function sauverSession(messageId, session) {
  const sessions = lireSessions();
  sessions[messageId] = session;
  ecrireFichier(FICHIER_SESSIONS, sessions);
}

function getSession(messageId) {
  return lireSessions()[messageId] || null;
}

function supprimerSession(messageId) {
  const sessions = lireSessions();
  delete sessions[messageId];
  ecrireFichier(FICHIER_SESSIONS, sessions);
}

// ========================================
// 🏆 Résultats
// ========================================

function lireResultats() {
  const raw = lireFichier(FICHIER_RESULTATS);
  return {
    users: raw.users || {},
    teams: raw.teams || {},
  };
}
function saveResultats(all) {
  ecrireFichier(FICHIER_RESULTATS, all);
}

function getUserResult(userId) {
  const r = lireResultats();
  return r.users[userId] || { wins: 0, losses: 0, participations: { free: 0, session: 0, mix: 0, scrim: 0 } };
}

function getTeamResult(teamId) {
  const r = lireResultats();
  return r.teams[teamId] || { wins: 0, losses: 0 };
}

function incrementWin(userId) {
  const r = lireResultats();
  const cur = r.users[userId] || { wins: 0, losses: 0, participations: { free: 0, session: 0, mix: 0, scrim: 0 } };
  cur.wins = (cur.wins || 0) + 1;
  r.users[userId] = cur;
  saveResultats(r);
}

function incrementLoss(userId) {
  const r = lireResultats();
  const cur = r.users[userId] || { wins: 0, losses: 0, participations: { free: 0, session: 0, mix: 0, scrim: 0 } };
  cur.losses = (cur.losses || 0) + 1;
  r.users[userId] = cur;
  saveResultats(r);
}

function incrementParticipation(userId, type) {
  const r = lireResultats();
  const cur = r.users[userId] || { wins: 0, losses: 0, participations: { free: 0, session: 0, mix: 0, scrim: 0 } };
  if (!cur.participations) cur.participations = { free: 0, session: 0, mix: 0, scrim: 0 };
  if (!cur.participations[type]) cur.participations[type] = 0;
  cur.participations[type] = cur.participations[type] + 1;
  r.users[userId] = cur;
  saveResultats(r);
}

function incrementTeamWin(teamId) {
  const r = lireResultats();
  const cur = r.teams[teamId] || { wins: 0, losses: 0 };
  cur.wins = (cur.wins || 0) + 1;
  r.teams[teamId] = cur;
  saveResultats(r);
}

function incrementTeamLoss(teamId) {
  const r = lireResultats();
  const cur = r.teams[teamId] || { wins: 0, losses: 0 };
  cur.losses = (cur.losses || 0) + 1;
  r.teams[teamId] = cur;
  saveResultats(r);
}

// ========================================
// 📦 Exports
// ========================================

module.exports = {
  // Défis
  lireDefis,
  sauverDefi,
  getDefi,
  supprimerDefi,
  // Sessions
  lireSessions,
  sauverSession,
  getSession,
  supprimerSession,
  // Résultats
  lireResultats,
  saveResultats,
  getUserResult,
  getTeamResult,
  incrementWin,
  incrementLoss,
  incrementTeamWin,
  incrementTeamLoss,
  incrementParticipation,
};
