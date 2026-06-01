// ========================================
// 🔧 CONFIGURATION DU BOT — JarlBot V1.1
// Modifie ces valeurs selon tes préférences
// ========================================

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

module.exports = {

  // ========================================
  // ⚙️ PARAMÈTRES GÉNÉRAUX
  // ========================================

  // Nombre de votes ✅ nécessaires de l'équipe adverse pour valider un match
  // 🧪 Mode test : mets 1 (validation immédiate)
  // 🚀 Mode prod : mets 4 ou plus
  SEUIL_VALIDATION: 1,

  // Préfixe utilisé pour nommer les salons privés créés automatiquement
  // Exemple final : match-mix-25-12-2025
  PREFIXE_SALON_PRIVE: 'match',


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

  // Valeurs de base ajustables à la main
  EVA_DEFAULT_CAEN_REGION_ID: '2395741613538603007',
  EVA_DEFAULT_LOCAL_LEAGUES_CIRCUIT_ID: '2395738311350114303',
  EVA_RATE_LIMIT_MAX_DELAY_MS: 5000,
  EVA_GRAPHQL_TIMEOUT_MS: 5000,
  EVA_CACHE_BEST_SCORE_BONUS: 100000,
  EVA_CAEN_PUBLIC_PLAYERS_PRELOAD_LIMIT: 30,
  EVA_TEAM_LINEUP_DISPLAY_LIMIT: 8,
  EVA_TOP_PLAYERS_LIMIT: 10,
  EVA_PLANNING_WINDOW_DAYS: 7,

  // --- Défis ---
  RAPPEL_MP_AVANT_MATCH:    48 * HOUR, // 48h avant : MP aux intéressés
  RAPPEL_24H_AVANT_MATCH:   24 * HOUR, // 24h avant : message dans le salon
  RAPPEL_1H_AVANT_MATCH:     1 * HOUR, //  1h avant : message dans le salon
  DUREE_UN_MATCH:           40 * MINUTE,      // 40 min par match
  DELAI_SUPPRESSION_SALON:  48 * HOUR, // 48h après : suppression salon + event

  // --- Sessions ---
  DUREE_SESSION:             3 * HOUR, // 3h de durée par défaut
  RAPPEL_MP_SESSION_AVANT:  48 * HOUR, // 48h avant : MP aux participants
  DELAI_SUPPRESSION_SALON_SESSION: 48 * HOUR, // 48h après la session



  // ========================================
  // 🌐 API EVA
  // ========================================

  EVA_COMPETITIVE_API_BASE_URL:
    process.env.EVA_COMPETITIVE_API_BASE_URL ||
    'https://competitive.eva.gg/api',
  EVA_GRAPHQL_URL:
    process.env.EVA_GRAPHQL_URL ||
    'https://api.eva.gg/graphql',
  EVA_LOCAL_LEAGUES_CIRCUIT_ID: process.env.EVA_LOCAL_LEAGUES_CIRCUIT_ID || '2395738311350114303',
  EVA_CAEN_REGION_ID: process.env.EVA_CAEN_REGION_ID || '2395741613538603007',
  EVA_CAEN_RANKING_IDS: process.env.EVA_CAEN_RANKING_IDS || '2489142894001680383,2441507312469446655',
  EVA_CAEN_TOURNAMENT_IDS: process.env.EVA_CAEN_TOURNAMENT_IDS || '',
  EVA_CAEN_TOURNAMENT_LIMIT: Number(process.env.EVA_CAEN_TOURNAMENT_LIMIT || 3),
  EVA_CAEN_MIN_MATCHES: Number(process.env.EVA_CAEN_MIN_MATCHES || 5),
  EVA_PLAYER_MIN_MATCHES: Number(process.env.EVA_PLAYER_MIN_MATCHES || 5),
  EVA_PUBLIC_PLAYER_BATCH_SIZE: Number(process.env.EVA_PUBLIC_PLAYER_BATCH_SIZE || 8),
  EVA_PLAYER_RESOLUTION_INTERVAL_MS: Number(process.env.EVA_PLAYER_RESOLUTION_INTERVAL_MS || 1000),
  EVA_PLAYER_RESOLUTION_JITTER_MS: Number(process.env.EVA_PLAYER_RESOLUTION_JITTER_MS || 1000),
  EVA_PLAYER_SUGGESTIONS: process.env.EVA_PLAYER_SUGGESTIONS || '',
  EVA_DATA_REFRESH_MS: Number(process.env.EVA_DATA_REFRESH_MS || 12 * HOUR),
  EVA_PLAYERS_CACHE_MS: Number(process.env.EVA_PLAYERS_CACHE_MS || 30 * MINUTE),
  EVA_REQUEST_CACHE_MS: Number(process.env.EVA_REQUEST_CACHE_MS || 10 * MINUTE),
  EVA_API_MIN_INTERVAL_MS: Number(process.env.EVA_API_MIN_INTERVAL_MS || 117),
  EVA_MAJOR_TOURNAMENT_IDS: process.env.EVA_MAJOR_TOURNAMENT_IDS || '2385727403616917503',
  EVA_V2_CACHE_TTL_MS: Number(process.env.EVA_V2_CACHE_TTL_MS || 24 * HOUR),
  EVA_V2_MIN_INTERVAL_MS: Number(process.env.EVA_V2_MIN_INTERVAL_MS || 120),
  EVA_V2_HTTP_TIMEOUT_MS: Number(process.env.EVA_V2_HTTP_TIMEOUT_MS || 10000),
  EVA_V2_TEAM_MEMBER_REFRESH_LIMIT: Number(process.env.EVA_V2_TEAM_MEMBER_REFRESH_LIMIT || 250),
  EVA_V2_TEAM_MEMBER_FULL_REFRESH_LIMIT: Number(process.env.EVA_V2_TEAM_MEMBER_FULL_REFRESH_LIMIT || 2000),
  EVA_V2_MAJOR_PLAYER_REFRESH_LIMIT: Number(process.env.EVA_V2_MAJOR_PLAYER_REFRESH_LIMIT || 20),
  EVA_V2_MAJOR_PLAYER_FULL_REFRESH_LIMIT: Number(process.env.EVA_V2_MAJOR_PLAYER_FULL_REFRESH_LIMIT || 100),
  EVA_V2_COMMAND_PLAYER_HYDRATE_LIMIT: Number(process.env.EVA_V2_COMMAND_PLAYER_HYDRATE_LIMIT || 3),


  // ========================================
  // 💬 MESSAGES PERSONNALISABLES
  // ========================================

  MESSAGES: {

    // ----------------------------------------
    // ⚔️ MATCHES
    // ----------------------------------------

    NOUVEAU_MATCH: (defi, monEquipe, adversaire) => {
      if (defi.type === 'free') {
        return `📢 **Nouveau free !**\n\n` +
          `🎮 Type : **${defi.type}**\n` +
          `👥 Joueurs : **${defi.nombreJoueurs}**\n` +
          `🎯 Niveau attendu : **${defi.niveauAttendu || 'Libre'}**\n` +
          `📅 Date : **${defi.date}**\n` +
          `🕐 Heure : **${defi.heure}**\n\n` +
          `Tout le monde peut y participer.\n` +
          `Réagissez avec ✅ pour rejoindre la partie.\n` +
          `Il faut **${defi.nombreJoueurs}** joueur(s) pour lancer le free.`;
      }
      return `📢 **Nouveau match !**\n\n` +
        `${monEquipe} défie ${adversaire} !\n` +
        `🎮 Type : **${defi.type}**\n` +
        `⚔️ Nombre de matchs : **${defi.nombreMatchs}** (~${defi.nombreMatchs * 40} min)\n` +
        `📅 Date : **${defi.date}**\n` +
        `🕐 Heure : **${defi.heure}**\n\n` +
        `${adversaire} → Réagissez avec ✅ pour accepter ou ❌ pour refuser.\n` +
        `Il faut **${module.exports.SEUIL_VALIDATION} vote(s) ✅** de l'équipe adverse pour valider le match.`;
    },

    BIENVENUE_SALON_PRIVE: (defi) => {
      if (defi.type === 'free') {
        const participants = defi.participants && defi.participants.length > 0
          ? defi.participants.map(id => `<@${id}>`).join(' ')
          : '*Participants à venir*';
        return `🎉 **Free accepté !**\n\n` +
          `🎮 Type : **${defi.type}**\n` +
          `🎯 Niveau attendu : **${defi.niveauAttendu || 'Libre'}**\n` +
          `📅 Date : **${defi.date}** à **${defi.heure}**\n` +
          `👥 Participants : ${participants}\n\n` +
          `Ce salon est privé : seuls les joueurs inscrits peuvent y discuter.\n` +
          `Il restera disponible jusqu'à la fin du free.\n\n` +
          `⏰ **Cliquez sur l'horloge ci-dessous pour être notifié(e) en MP 48h avant le free !**`;
      }
      return `🎉 **Match accepté !**\n\n` +
        `<@&${defi.monEquipeId}> vs <@&${defi.adversaireId}>\n` +
        `🎮 Type : **${defi.type}**\n` +
        `⚔️ Nombre de matchs : **${defi.nombreMatchs}** (~${defi.nombreMatchs * 40} min)\n` +
        `📅 Date : **${defi.date}** à **${defi.heure}**\n\n` +
        `Ce salon est privé : seules les deux équipes peuvent y discuter.\n` +
        `Il sera supprimé automatiquement 48h après le match.\n\n` +
        `⏰ **Cliquez sur l'horloge ci-dessous pour être notifié(e) en MP 48h avant le match !**`;
    },

    DEFI_ACCEPTE_REPLY: (defi, salonId) =>
      `✅ **Match validé !** Rendez-vous dans <#${salonId}> 🎮`,

    RAPPEL_24H: `⏰ **Rappel : votre match a lieu dans 24h !**`,
    RAPPEL_1H:  `🔥 **Rappel : votre match commence dans 1h !** Préparez-vous !`,

    RAPPEL_MP: (defi) => {
      if (defi.type === 'free') {
        return `⏰ **Rappel : ton free approche !**\n\n` +
          `🎮 Type : **${defi.type}**\n` +
          `👥 Joueurs attendus : **${defi.nombreJoueurs}**\n` +
          `🎯 Niveau attendu : **${defi.niveauAttendu || 'Libre'}**\n` +
          `📅 Date : **${defi.date}** à **${defi.heure}**\n\n` +
          `Bon jeu ! 🎮`;
      }

      return `⏰ **Rappel : ton match approche !**\n\n` +
        `🎮 Type : **${defi.type}**\n` +
        `⚔️ Nombre de matchs : **${defi.nombreMatchs}**\n` +
        `📅 Date : **${defi.date}** à **${defi.heure}**\n\n` +
        `Bon match ! 🍀`;
    },


    // ----------------------------------------
    // ❌ MESSAGES D'ERREUR (défis)
    // ----------------------------------------

    ERREUR_PAS_LE_ROLE: (role) =>
      `❌ Tu dois avoir le rôle ${role} pour lancer ce match.`,
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
