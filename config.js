// ========================================
// 🔧 CONFIGURATION DU BOT — V1.0
// Modifie ces valeurs selon tes préférences
// ========================================

module.exports = {
  // === Validation du défi ===
  // Nombre de votes ✅ nécessaires de l'équipe adverse pour valider le défi
  SEUIL_VALIDATION: 1,

  // === Emojis utilisés pour les réactions ===
  EMOJI_ACCEPTER: '✅',
  EMOJI_REFUSER: '❌',
  EMOJI_RAPPEL_MP: '⏰',

  // === Délais (en millisecondes) ===
  // Astuce : 1000 = 1s, 60_000 = 1min, 3_600_000 = 1h
  RAPPEL_MP_AVANT_MATCH: 48 * 60 * 60 * 1000,  // 48h avant : MP aux intéressés
  RAPPEL_24H_AVANT_MATCH: 24 * 60 * 60 * 1000, // 24h avant : message dans le salon
  RAPPEL_1H_AVANT_MATCH: 1 * 60 * 60 * 1000,   //  1h avant : message dans le salon
  DUREE_UN_MATCH: 40 * 60 * 1000, // 40 minutes par match
  DELAI_SUPPRESSION_SALON: 2 * 60 * 60 * 1000, // 2h après : suppression salon + event

  // === Préfixe des salons privés créés ===
  // Le nom final sera : defi-{type}-{JJ-MM-AAAA}
  PREFIXE_SALON_PRIVE: 'defi',

  // === Messages personnalisables ===
  MESSAGES: {
    // Message posté dans le salon d'origine quand un défi est lancé
    NOUVEAU_DEFI: (defi, monEquipe, adversaire) =>
      `📢 **Nouveau défi !**\n\n` +
      `${monEquipe} défie ${adversaire} !\n` +
      `🎮 Type : **${defi.type}**\n` +
      `⚔️ Nombre de matchs : **${defi.nombreMatchs}** (~${defi.nombreMatchs * 40} min)\n` +
      `📅 Date : **${defi.date}**\n` +
      `🕐 Heure : **${defi.heure}**\n\n` +
      `${adversaire} → Réagissez avec ✅ pour accepter ou ❌ pour refuser.\n` +
      `Il faut **${module.exports.SEUIL_VALIDATION} vote(s) ✅** de l'équipe adverse pour valider le défi.`,

    // Message de bienvenue dans le salon privé
   BIENVENUE_SALON_PRIVE: (defi) =>
      `🎉 **Défi accepté !**\n\n` +
      `<@&${defi.monEquipeId}> vs <@&${defi.adversaireId}>\n` +
      `🎮 Type : **${defi.type}**\n` +
      `⚔️ Nombre de matchs : **${defi.nombreMatchs}** (~${defi.nombreMatchs * 40} min)\n` +
      `📅 Date : **${defi.date}** à **${defi.heure}**\n\n` +
      `Ce salon est privé : seules les deux équipes peuvent y discuter.\n` +
      `Il sera supprimé automatiquement 2h après le match.\n\n` +
      `⏰ **Cliquez sur l'horloge ci-dessous pour être notifié(e) en MP 48h avant le match !**`,

    // Confirmation postée en réponse au message de défi original
    DEFI_ACCEPTE_REPLY: (defi, salonId) =>
      `🎉 **Défi accepté !**\n` +
      `Un salon privé a été créé : <#${salonId}>\n` +
      `📅 RDV le **${defi.date}** à **${defi.heure}** (${defi.type})`,

    // Rappels dans le salon privé
    RAPPEL_24H: '⏰ **Rappel : le match est dans 24h !**',
    RAPPEL_1H: '🔔 **Rappel : le match commence dans 1h !**',

    // Rappel MP pour ceux qui ont cliqué sur ⏰
    RAPPEL_MP: (defi) =>
      `⏰ **Rappel : ton match arrive dans 48h !**\n` +
      `🎮 Type : **${defi.type}**\n` +
      `📅 Date : **${defi.date}** à **${defi.heure}**\n` +
      `💬 Salon : <#${defi.salonId}>`,

    // Titre + description de l'événement Discord
    EVENT_TITRE: (defi, nomMonEquipe, nomAdversaire) =>
      `${defi.type.toUpperCase()} - ${nomMonEquipe} vs ${nomAdversaire} (${defi.nombreMatchs} match${defi.nombreMatchs > 1 ? 's' : ''})`,
 EVENT_DESCRIPTION: (defi, nomMonEquipe, nomAdversaire) =>
      `🎮 Défi entre ${nomMonEquipe} et ${nomAdversaire}\n` +
      `🆚 Type : ${defi.type}\n` +
      `⚔️ Nombre de matchs : ${defi.nombreMatchs}\n` +
      `📅 Date : ${defi.date} à ${defi.heure}`,

    // Messages d'erreurs slash /defi
    ERREUR_PAS_LE_ROLE: (monEquipe) =>
      `❌ Tu n'as pas le rôle ${monEquipe} ! Tu ne peux pas défier au nom de cette équipe.`,
    ERREUR_AUTO_DEFI: `❌ Tu ne peux pas défier ta propre équipe !`,
    ERREUR_FORMAT_DATE: `❌ Format de date invalide. Utilise JJ/MM/AAAA (ex: 25/12/2025)`,
    ERREUR_FORMAT_HEURE: `❌ Format d'heure invalide. Utilise HH:MM (ex: 20:30)`,
    ERREUR_DATE_PASSEE: `❌ La date du match doit être dans le futur !`,
    ERREUR_PAS_VOTANT: `❌ Tu n'as pas le rôle de l'équipe défiée, tu ne peux pas voter sur ce défi.`,
    ERREUR_VALIDATION: `⚠️ Le défi a été validé mais une erreur est survenue lors de la création du salon ou de l'événement. Vérifie les permissions du bot.`,
    ERREUR_NB_MATCHS: `❌ Le nombre de matchs doit être entre 1 et 10.`,
  },
};

