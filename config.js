// ========================================
// 🔧 CONFIGURATION DU BOT — JarlBot V1.1
// Modifie ces valeurs selon tes préférences
// ========================================

module.exports = {

  // ========================================
  // ⚙️ PARAMÈTRES GÉNÉRAUX
  // ========================================

  // Nombre de votes ✅ nécessaires de l'équipe adverse pour valider un défi
  // 🧪 Mode test : mets 2 (avec ton vote qui compte double = validation immédiate)
  // 🚀 Mode prod : mets 3 ou plus
  SEUIL_VALIDATION: 2,

  // Préfixe utilisé pour nommer les salons privés créés automatiquement
  // Exemple final : defi-mix-25-12-2025
  PREFIXE_SALON_PRIVE: 'defi',


  // ========================================
  // 😀 EMOJIS DES RÉACTIONS
  // ========================================

  EMOJI_ACCEPTER: '✅',
  EMOJI_REFUSER: '❌',
  EMOJI_RAPPEL_MP: '⏰',


  // ========================================
  // 🎨 COULEURS DES EMBEDS (sessions)
  // ========================================

  COULEUR_SESSION_OUVERTE: 0x5865F2, // 🔵 Bleu Discord
  COULEUR_SESSION_LANCEE:  0x57F287, // 🟢 Vert


  // ========================================
  // 🔘 IDENTIFIANTS DES BOUTONS (sessions)
  // ========================================

  BUTTON_ID_REJOINDRE: 'session_join',
  BUTTON_ID_QUITTER:   'session_leave',


  // ========================================
  // ⏱️ DÉLAIS (en millisecondes)
  // Astuce : 1000 = 1s | 60_000 = 1min | 3_600_000 = 1h
  // ========================================

  // --- Défis ---
  RAPPEL_MP_AVANT_MATCH:    48 * 60 * 60 * 1000, // 48h avant : MP aux intéressés
  RAPPEL_24H_AVANT_MATCH:   24 * 60 * 60 * 1000, // 24h avant : message dans le salon
  RAPPEL_1H_AVANT_MATCH:     1 * 60 * 60 * 1000, //  1h avant : message dans le salon
  DUREE_UN_MATCH:           40 * 60 * 1000,      // 40 min par match
  DELAI_SUPPRESSION_SALON:   2 * 60 * 60 * 1000, //  2h après : suppression salon + event

  // --- Sessions ---
  DUREE_SESSION:             3 * 60 * 60 * 1000, // 3h de durée par défaut
  RAPPEL_MP_SESSION_AVANT:  48 * 60 * 60 * 1000, // 48h avant : MP aux participants


  // ========================================
  // 💬 MESSAGES PERSONNALISABLES
  // ========================================

  MESSAGES: {

    // ----------------------------------------
    // ⚔️ DÉFIS
    // ----------------------------------------

    NOUVEAU_DEFI: (defi, monEquipe, adversaire) =>
      `📢 **Nouveau défi !**\n\n` +
      `${monEquipe} défie ${adversaire} !\n` +
      `🎮 Type : **${defi.type}**\n` +
      `⚔️ Nombre de matchs : **${defi.nombreMatchs}** (~${defi.nombreMatchs * 40} min)\n` +
      `📅 Date : **${defi.date}**\n` +
      `🕐 Heure : **${defi.heure}**\n\n` +
      `${adversaire} → Réagissez avec ✅ pour accepter ou ❌ pour refuser.\n` +
      `Il faut **${module.exports.SEUIL_VALIDATION} vote(s) ✅** de l'équipe adverse pour valider le défi.`,

    BIENVENUE_SALON_PRIVE: (defi) =>
      `🎉 **Défi accepté !**\n\n` +
      `<@&${defi.monEquipeId}> vs <@&${defi.adversaireId}>\n` +
      `🎮 Type : **${defi.type}**\n` +
      `⚔️ Nombre de matchs : **${defi.nombreMatchs}** (~${defi.nombreMatchs * 40} min)\n` +
      `📅 Date : **${defi.date}** à **${defi.heure}**\n\n` +
      `Ce salon est privé : seules les deux équipes peuvent y discuter.\n` +
      `Il sera supprimé automatiquement 2h après le match.\n\n` +
      `⏰ **Cliquez sur l'horloge ci-dessous pour être notifié(e) en MP 48h avant le match !**`,

    DEFI_ACCEPTE_REPLY: (defi, salonId) =>
      `✅ **Défi validé !** Rendez-vous dans <#${salonId}> 🎮`,

    RAPPEL_24H: `⏰ **Rappel : votre match a lieu dans 24h !**`,
    RAPPEL_1H:  `🔥 **Rappel : votre match commence dans 1h !** Préparez-vous !`,

    RAPPEL_MP: (defi) =>
      `⏰ **Rappel : ton match approche !**\n\n` +
      `🎮 Type : **${defi.type}**\n` +
      `⚔️ Nombre de matchs : **${defi.nombreMatchs}**\n` +
      `📅 Date : **${defi.date}** à **${defi.heure}**\n\n` +
      `Bon match ! 🍀`,


    // ----------------------------------------
    // ❌ MESSAGES D'ERREUR (défis)
    // ----------------------------------------

    ERREUR_PAS_LE_ROLE: (role) =>
      `❌ Tu dois avoir le rôle ${role} pour lancer ce défi.`,
    ERREUR_AUTO_DEFI:    `❌ Tu ne peux pas défier ta propre équipe !`,
    ERREUR_FORMAT_DATE:  `❌ Format de date invalide. Utilise **JJ/MM/AAAA** (ex: 25/12/2025).`,
    ERREUR_FORMAT_HEURE: `❌ Format d'heure invalide. Utilise **HH:MM** (ex: 20:30).`,
    ERREUR_DATE_PASSEE:  `❌ La date doit être dans le futur.`,
    ERREUR_VALIDATION:   `❌ Une erreur est survenue lors de la validation du défi.`,


    // ----------------------------------------
    // 🎮 SESSIONS SPÉCIALES
    // ----------------------------------------

    SESSION_TITRE: (type) => `🎮 Session ${type}`,

    SESSION_DESCRIPTION: (type) =>
      `Une session **${type}** est proposée !\n` +
      `Clique sur **Je participe** pour t'inscrire. 🚀`,

    SESSION_PARTICIPANTS_VIDE: `*Aucun participant pour l'instant...*`,

    SESSION_FOOTER: (auteur) => `Proposée par ${auteur}`,

    SESSION_LANCEE: (session) => {
      const mentions = session.participants.map(id => `<@${id}>`).join(' ');
      return (
        `🎉 **La session ${session.type} est lancée !**\n\n` +
        `📅 ${session.date} à ${session.heure}\n` +
        `👥 Participants : ${mentions}\n\n` +
        `Bon jeu à tous ! 🎮`
      );
    },

    RAPPEL_MP_SESSION: (session) =>
      `⏰ **Rappel : la session ${session.type} commence dans 48h !**\n\n` +
      `📅 Date : **${session.date}** à **${session.heure}**\n\n` +
      `À tout à l'heure ! 🎮`,


    // ----------------------------------------
    // ❌ MESSAGES D'ERREUR (sessions)
    // ----------------------------------------

    SESSION_INTROUVABLE:  `❌ Cette session n'existe plus.`,
    SESSION_DEJA_INSCRIT: `⚠️ Tu es déjà inscrit à cette session.`,
    SESSION_PAS_INSCRIT:  `⚠️ Tu n'es pas inscrit à cette session.`,

  },
};
