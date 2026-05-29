const fs = require('fs');
const path = require('path');

const FICHIER = path.join(__dirname, '..', 'defis.json');

// Lire tous les défis sauvegardés
function lireDefis() {
  if (!fs.existsSync(FICHIER)) return {};
  try {
    const contenu = fs.readFileSync(FICHIER, 'utf8');
    return JSON.parse(contenu);
  } catch (err) {
    console.error('❌ Erreur lecture defis.json :', err);
    return {};
  }
}

// Écrire tous les défis
function ecrireDefis(defis) {
  fs.writeFileSync(FICHIER, JSON.stringify(defis, null, 2), 'utf8');
}

// Sauvegarder un défi
function sauverDefi(messageId, defi) {
  const defis = lireDefis();
  defis[messageId] = defi;
  ecrireDefis(defis);
}

// Récupérer un défi
function getDefi(messageId) {
  const defis = lireDefis();
  return defis[messageId] || null;
}

// Supprimer un défi
function supprimerDefi(messageId) {
  const defis = lireDefis();
  delete defis[messageId];
  ecrireDefis(defis);
}

module.exports = { lireDefis, sauverDefi, getDefi, supprimerDefi };
