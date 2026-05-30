const fs = require('fs');
const path = require('path');

const FICHIER_DEFIS = path.join(__dirname, '..', 'defis.json');
const FICHIER_SESSIONS = path.join(__dirname, '..', 'sessions.json');

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
};
