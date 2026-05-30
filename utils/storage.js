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
  return lireFichier(FICHIER_RESULTATS);
}

function sauverResultat(userId, data) {
  const resultats = lireResultats();
  resultats[userId] = data;
  ecrireFichier(FICHIER_RESULTATS, resultats);
}

function incrementWin(userId) {
  const resultats = lireResultats();
  const cur = resultats[userId] || { wins: 0, losses: 0 };
  cur.wins = (cur.wins || 0) + 1;
  resultats[userId] = cur;
  ecrireFichier(FICHIER_RESULTATS, resultats);
}

function incrementLoss(userId) {
  const resultats = lireResultats();
  const cur = resultats[userId] || { wins: 0, losses: 0 };
  cur.losses = (cur.losses || 0) + 1;
  resultats[userId] = cur;
  ecrireFichier(FICHIER_RESULTATS, resultats);
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
  sauverResultat,
  incrementWin,
  incrementLoss,
};
