// ========================================
// 🤖 JarlBot — V1.1
// Bot de gestion de défis d'équipes + sessions
// ========================================

require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
  PermissionFlagsBits,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const schedule = require('node-schedule');
const config = require('./config');
const {
  sauverDefi, getDefi, supprimerDefi, lireDefis,
  sauverSession, getSession, lireSessions,
} = require('./utils/storage');
const {
  getAllEvaTeams,
  getAllEvaTeamsHybrid,
  getCachedCompetitivePlayers,
  getCachedCompetitivePlayersHybrid,
  getCaenTeamStats,
  getLocalLeagueStandings,
  getLocalLeagueStandingsHybrid,
  findLocalLeagueStanding,
  getPlayerKdaStats,
  getTopPlayers,
  ensureEvaCacheFresh,
  startEvaCacheRefreshScheduler,
} = require('./utils/eva');

// ========================================
// 🔌 Initialisation du client Discord
// ========================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// ========================================
// 🛠️ Utilitaires généraux
// ========================================

/** Convertit "JJ/MM/AAAA" + "HH:MM" en objet Date */
function parseDateHeure(date, heure) {
  const [jour, mois, annee] = date.split('/').map(Number);
  const [h, m] = heure.split(':').map(Number);
  return new Date(annee, mois - 1, jour, h, m, 0);
}

/** Récupère le nom d'un rôle (ou fallback) */
function getNomRole(guild, roleId, fallback = 'Équipe') {
  const role = guild.roles.cache.get(roleId);
  return role ? role.name : fallback;
}

/** Programme une tâche si la date est dans le futur */
function planifier(nom, date, maintenant, callback) {
  if (date > maintenant) schedule.scheduleJob(nom, date, callback);
}

/** Génère un nom de salon basé sur le défi */
function genererNomSalon(defi, guild) {
  const date = defi.date.replace(/\//g, '-');
  return `${config.PREFIXE_SALON_PRIVE}-${defi.type}-${date}`.toLowerCase();
}

/** Génère un nom de salon basé sur la session */
function genererNomSalonSession(session) {
  const date = session.date.replace(/\//g, '-');

  return `${session.type}-${date}`
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[éèê]/g, 'e')
    .replace(/[àâ]/g, 'a')
    .replace(/[ùû]/g, 'u')
    .replace(/[îï]/g, 'i')
    .replace(/[ôö]/g, 'o')
    .replace(/[ç]/g, 'c');

    }
// ========================================
// 🚀 Démarrage du bot
// ========================================

function handleReady() {
  console.log(`✅ Bot connecté en tant que ${client.user.tag} !`);
  reprogrammerTaches();
getCachedCompetitivePlayers()
    .then(players => console.log(`📊 Cache joueurs compétitifs EVA chargé (${players.length} joueur(s)).`))
    .catch(err => console.error('❌ Impossible de précharger les joueurs compétitifs EVA :', err));
}

client.once('clientReady', handleReady);

// ========================================
// ⚡ Routeur d'interactions
// ========================================

client.on('interactionCreate', async (interaction) => {
  try {
    // --- Autocomplétion ---
    if (interaction.isAutocomplete()) {
      if (interaction.commandName === 'stat') {
        return gererAutocompleteStat(interaction);
      }
      if (interaction.commandName === 'stat-equipe') {
        return gererAutocompleteStatEquipe(interaction);
      }
      if (interaction.commandName === 'classement') {
        return gererAutocompleteClassement(interaction);
      }
    }

    // --- Commandes slash ---
    if (interaction.isChatInputCommand()) {
      switch (interaction.commandName) {
        case 'ping':    return interaction.reply('Pong ! 🏓');
        case 'mix':     return gererCommandeMatch(interaction);
        case 'scrim':   return gererCommandeMatch(interaction);
        case 'free':    return gererCommandeMatch(interaction);
        case 'renfort': return gererCommandeRenfort(interaction);
        case 'stat':    return gererCommandeStat(interaction);
        case 'stat-equipe': return gererCommandeStatEquipe(interaction);
        case 'classement': return gererCommandeClassement(interaction);
        case 'top': return gererCommandeTop(interaction);
        case 'planning': return gererCommandePlanning(interaction);
        case 'session': return gererCommandeSession(interaction);
      }
    }

    // --- Boutons ---
    if (interaction.isButton()) {
      // Boutons session : rejoindre / quitter
      if (
        interaction.customId === config.BUTTON_ID_REJOINDRE ||
        interaction.customId === config.BUTTON_ID_QUITTER
      ) {
        return gererBoutonSession(interaction);
      }
    }
  } catch (err) {
    console.error('❌ Erreur interaction :', err);
    if (interaction.isRepliable() && !interaction.replied) {
      await interaction.reply({ content: '❌ Une erreur est survenue.', flags: 64 }).catch(() => {});
    }
  }
});

// ========================================
// ⚔️ COMMANDES /mix, /scrim, /free
// ========================================

async function gererCommandeMatch(interaction) {
  const type = interaction.commandName;
  const date = interaction.options.getString('date');
  const heure = interaction.options.getString('heure');
  const niveauAttendu = interaction.options.getString('niveau-attendu');
  const monEquipe = interaction.options.getRole('mon-equipe');
  const adversaire = interaction.options.getRole('adversaire');
  const nombreMatchs = interaction.options.getInteger('nombre-matchs');
  const nombreJoueurs = interaction.options.getInteger('nombre-joueurs');

  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(date))
    return interaction.reply({ content: config.MESSAGES.ERREUR_FORMAT_DATE, flags: 64 });

  if (!/^\d{2}:\d{2}$/.test(heure))
    return interaction.reply({ content: config.MESSAGES.ERREUR_FORMAT_HEURE, flags: 64 });

  if (parseDateHeure(date, heure) <= new Date())
    return interaction.reply({ content: config.MESSAGES.ERREUR_DATE_PASSEE, flags: 64 });

  if (type === 'free') {
    if (typeof nombreJoueurs !== 'number' || nombreJoueurs < 2 || nombreJoueurs > 10) {
      return interaction.reply({ content: '❌ Pour un free, indique de 2 à 10 joueurs.', flags: 64 });
    }
  } else {
    if (!monEquipe || !adversaire) {
      return interaction.reply({ content: '❌ Pour un mix ou un scrim, précise ton équipe et l\'adversaire.', flags: 64 });
    }

    if (!interaction.member.roles.cache.has(monEquipe.id))
      return interaction.reply({ content: config.MESSAGES.ERREUR_PAS_LE_ROLE(monEquipe), flags: 64 });

    if (monEquipe.id === adversaire.id)
      return interaction.reply({ content: config.MESSAGES.ERREUR_AUTO_DEFI, flags: 64 });
  }

  const matchData = {
    type,
    niveauAttendu: type === 'free' ? niveauAttendu || null : null,
    nombreMatchs: type === 'free' ? undefined : nombreMatchs,
    nombreJoueurs: type === 'free' ? nombreJoueurs : undefined,
    monEquipeId: type === 'free' ? null : (monEquipe ? monEquipe.id : null),
    adversaireId: type === 'free' ? null : (adversaire ? adversaire.id : null),
    date,
    heure,
    auteurId: interaction.user.id,
    guildId: interaction.guild.id,
    channelId: interaction.channel.id,
    valide: false,
    participants: type === 'free' ? [interaction.user.id] : [],
  };

  let replyContent = config.MESSAGES.NOUVEAU_MATCH(matchData, monEquipe, adversaire);
  if (type === 'free') {
    replyContent += construireResumeParticipantsFree(matchData.participants, matchData.nombreJoueurs);
  } else {
    replyContent += `\n<@&${adversaire.id}> → réagissez avec ${config.EMOJI_ACCEPTER} pour accepter !`;
  }

  await interaction.reply(replyContent);
  const message = await interaction.fetchReply();

  await message.react(config.EMOJI_ACCEPTER);
  if (type !== 'free') {
    await message.react(config.EMOJI_REFUSER);
  }

  sauverDefi(message.id, matchData);
}

// ========================================
// 🗳️ Réactions sur les matchs
// ========================================

client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => null);

  const matchData = getDefi(reaction.message.id);
  if (!matchData || matchData.valide) return;

  const guild = reaction.message.guild;
  const emoji = reaction.emoji.name;

  if (emoji === config.EMOJI_ACCEPTER) {
    if (matchData.type === 'free') {
      const participantIds = await mettreAJourListeParticipantsFree(reaction.message, matchData);
      console.log(`🗳️ Free ${reaction.message.id} : ${participantIds.length}/${matchData.nombreJoueurs} participants`);
      if (participantIds.length >= matchData.nombreJoueurs) {
        await validerDefi(reaction.message, matchData);
      }
    } else {
      const adversaireCount = await getRoleMemberCount(guild, matchData.adversaireId);
      const threshold = adversaireCount === 0 ? 1 : Math.min(4, adversaireCount);
      const votes = await compterVotesValides(reaction, guild, matchData.adversaireId);
      console.log(`🗳️ ${matchData.type} ${reaction.message.id} : ${votes}/${threshold} votes valides (${adversaireCount} membres au rôle)`);

      if (votes >= threshold) {
        await validerDefi(reaction.message, matchData);
      }
    }
  }
});

client.on('messageReactionRemove', async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => null);

  const matchData = getDefi(reaction.message.id);
  if (!matchData || matchData.valide || matchData.type !== 'free') return;
  if (reaction.emoji.name !== config.EMOJI_ACCEPTER) return;

  await mettreAJourListeParticipantsFree(reaction.message, matchData);
});

async function compterVotesValides(reaction, guild, roleId) {
  const reactionPositive = reaction.message.reactions.cache.get(config.EMOJI_ACCEPTER);
  if (!reactionPositive) return 0;

  const users = await reactionPositive.users.fetch();
  let count = 0;

  for (const [, u] of users) {
    if (u.bot) continue;
    if (!roleId) {
      count++;
      continue;
    }
    const m = await guild.members.fetch(u.id).catch(() => null);
    if (m && m.roles.cache.has(roleId)) count++;
  }
  return count;
}

async function getRoleMemberCount(guild, roleId) {
  const role = guild.roles.cache.get(roleId);
  if (!role) return 0;

  const members = await guild.members.fetch().catch(() => null);
  if (!members) return role.members.filter(m => !m.user.bot).size;

  return members.filter(m => m.roles.cache.has(roleId) && !m.user.bot).size;
}

async function mettreAJourListeParticipantsFree(message, matchData) {
  const reactionPositive = message.reactions.cache.get(config.EMOJI_ACCEPTER);
  if (!reactionPositive) return matchData.participants || [];

  const users = await reactionPositive.users.fetch();
  const participantIds = [...new Set(
    users.filter(u => !u.bot).map(u => u.id)
  )];
  if (!participantIds.includes(matchData.auteurId)) participantIds.unshift(matchData.auteurId);

  matchData.participants = participantIds;
  sauverDefi(message.id, matchData);

  if (!message.editable) return participantIds;

  const updated =
    config.MESSAGES.NOUVEAU_MATCH(matchData, null, null) +
    construireResumeParticipantsFree(participantIds, matchData.nombreJoueurs);
  await message.edit(updated).catch(() => {});
  return participantIds;
}

function construireResumeParticipantsFree(participantIds, nombreJoueurs) {
  const mentions = participantIds.length > 0
    ? participantIds.map(id => `<@${id}>`).join('\n')
    : '*Aucun participant pour l’instant*';

  return `\n\n👥 **Participants** (${participantIds.length}/${nombreJoueurs})\n${mentions}`;
}

function trouverDefiParSalonId(salonId) {
  const defis = lireDefis();
  return Object.entries(defis).find(([, defi]) => defi.salonId === salonId) || [null, null];
}

function trouverSessionParSalonId(salonId) {
  const sessions = lireSessions();
  return Object.entries(sessions).find(([, session]) => session.salonId === salonId) || [null, null];
}

// ========================================
// ✅ Validation d'un défi
// ========================================

async function validerDefi(message, defi) {
  const guild = message.guild;
  defi.valide = true;

  if (defi.type === 'free') {
    const reactionPositive = message.reactions.cache.get(config.EMOJI_ACCEPTER);
    if (reactionPositive) {
      const users = await reactionPositive.users.fetch();
      const participantIds = [...new Set(
        users.filter(u => !u.bot).map(u => u.id)
      )];
      if (!participantIds.includes(defi.auteurId)) {
        participantIds.unshift(defi.auteurId);
      }
      defi.participants = participantIds;
    }
  }

  try {
    // 1. Créer le salon privé
    const salon = await creerSalonPrive(guild, defi);
    defi.salonId = salon.id;

    // 2. Message de bienvenue + réaction ⏰
    const bienvenue = await salon.send(config.MESSAGES.BIENVENUE_SALON_PRIVE(defi));
    await bienvenue.react(config.EMOJI_RAPPEL_MP);
    defi.messageBienvenueId = bienvenue.id;

    // 3. Événement Discord
    const event = await creerEventDiscord(guild, defi, salon.name);
    defi.eventId = event.id;

    // 4. Sauvegarde + tâches
    sauverDefi(message.id, defi);
    programmerTachesDefi(message.id, defi);

    // 5. Confirmation
    await message.reply(config.MESSAGES.DEFI_ACCEPTE_REPLY(defi, salon.id));
  } catch (err) {
    console.error('❌ Erreur validation défi :', err);
    await message.reply(config.MESSAGES.ERREUR_VALIDATION);
  }
}

async function creerSalonPrive(guild, defi) {
  const botId = client.user?.id || guild.client?.user?.id;
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
  ];

  if (defi.type === 'free') {
    const participantOverwrites = defi.participants.map(userId => ({
      id: userId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    }));
    overwrites.push(...participantOverwrites);
  } else {
    if (defi.monEquipeId) {
      overwrites.push({
        id: defi.monEquipeId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      });
    }
    if (defi.adversaireId) {
      overwrites.push({
        id: defi.adversaireId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      });
    }
  }

  if (botId) {
    overwrites.push({
      id: botId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }

  return guild.channels.create({
    name: genererNomSalon(defi, guild),
    type: ChannelType.GuildText,
    parent: process.env.CATEGORIE_DEFIS_ID,
    permissionOverwrites: overwrites,
  });
}

async function creerSalonPriveSession(guild, session) {
  const botId = client.user?.id || guild.client?.user?.id;
  const permissionsParticipants = session.participants.map(userId => ({
    id: userId,
    allow: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
    ],
  }));

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    ...permissionsParticipants,
  ];

  if (botId) {
    overwrites.push({
      id: botId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }

  return guild.channels.create({
    name: genererNomSalonSession(session),
    type: ChannelType.GuildText,

    // On peut réutiliser la catégorie "Défis" pour le moment
    parent: process.env.CATEGORIE_DEFIS_ID,

    permissionOverwrites: overwrites,
  });
}


async function creerEventDiscord(guild, defi, nomSalon) {
  const dateMatch = parseDateHeure(defi.date, defi.heure);
  const dateFin = new Date(
    dateMatch.getTime() +
      (defi.type === 'free' ? config.DUREE_SESSION : defi.nombreMatchs * config.DUREE_UN_MATCH)
  );

  const nomMonEquipe = getNomRole(guild, defi.monEquipeId, 'Équipe 1');
  const nomAdversaire = getNomRole(guild, defi.adversaireId, 'Équipe 2');
  const titreEvent = defi.type === 'free'
    ? `Free (${defi.niveauAttendu || 'Libre'})`
    : `${nomMonEquipe} vs ${nomAdversaire} (${defi.type})`;

  return guild.scheduledEvents.create({
    name: titreEvent,
    scheduledStartTime: dateMatch,
    scheduledEndTime: dateFin,
    privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
    entityType: GuildScheduledEventEntityType.External,
    entityMetadata: { location: `Salon #${nomSalon}` },
    description:
      (defi.type === 'free'
        ? `🎮 Free\n` +
          `🎯 Niveau attendu : ${defi.niveauAttendu || 'Libre'}\n` +
          `👥 Joueurs : ${defi.nombreJoueurs}\n`
        : `🎮 Défi entre ${nomMonEquipe} et ${nomAdversaire}\n` +
          `🆚 Type : ${defi.type}\n` +
          `⚔️ Nombre de matchs : ${defi.nombreMatchs}\n`) +
      `📅 Date : ${defi.date} à ${defi.heure}`,
  });
}

// ========================================
// ⏰ Planification & rappels
// ========================================

function programmerTachesDefi(messageId, defi) {
  const dateMatch = parseDateHeure(defi.date, defi.heure);
  const maintenant = new Date();

  planifier(`rappelMP_${messageId}`,
    new Date(dateMatch.getTime() - config.RAPPEL_MP_AVANT_MATCH),
    maintenant, () => envoyerRappelMP(messageId));

  planifier(`rappel24h_${messageId}`,
    new Date(dateMatch.getTime() - config.RAPPEL_24H_AVANT_MATCH),
    maintenant, () => envoyerRappelSalon(messageId, config.MESSAGES.RAPPEL_24H));

  planifier(`rappel1h_${messageId}`,
    new Date(dateMatch.getTime() - config.RAPPEL_1H_AVANT_MATCH),
    maintenant, () => envoyerRappelSalon(messageId, config.MESSAGES.RAPPEL_1H));

  planifier(`nettoyage_${messageId}`,
    new Date(dateMatch.getTime() + config.DELAI_SUPPRESSION_SALON),
    maintenant, () => nettoyerDefi(messageId));
}

async function gererCommandeStat(interaction) {
  const joueur = interaction.options.getString('joueur');
  if (!joueur) return interaction.reply({ content: '❌ Indique un joueur EVA.', flags: 64 });

  await interaction.deferReply({ flags: 64 });

  try {
    await ensureEvaCacheFresh({ maxAgeMs: 24 * 60 * 60 * 1000 });
    const data = await getPlayerKdaStats(joueur);
    const content = [`📊 **Stats EVA de ${data.playerName || joueur}**`];
    const current = data.current || {};
    const all = data.all || {};

    if (current.kda == null) {
      content.push('ℹ️ KDA indisponible pour ce joueur.');
    } else {
      content.push(`⚔️ KDA saison en cours : **${formatNumber(current.kda)}**${all.kda != null ? ` (${formatNumber(all.kda)} all-time)` : ''}`);
    }

    if (current.gameCount != null) {
      content.push(`🎮 Matchs joués saison en cours : **${current.gameCount}**${all.gameCount != null ? ` (${all.gameCount} all-time)` : ''}`);
    }

    const details = [];
    if (current.kills != null) details.push(`Kills: ${current.kills}`);
    if (current.deaths != null) details.push(`Deaths: ${current.deaths}`);
    if (current.assists != null) details.push(`Assists: ${current.assists}`);
    if (details.length > 0) content.push(details.join(' | '));

    await interaction.editReply({ content: content.join('\n') });
  } catch (err) {
    console.error('❌ Erreur commande /stat :', err);
    await interaction.editReply({ content: `❌ Impossible de récupérer les stats EVA. ${err.message}` });
  }
}

function formatNumber(value) {
  if (value == null) return 'N/A';
  return Number(value).toLocaleString('fr-FR', {
    maximumFractionDigits: 2,
  });
}

async function gererAutocompleteStat(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();

  try {
    const players = await getCachedCompetitivePlayersHybrid({ maxAgeMs: 24 * 60 * 60 * 1000 });
    const choices = players
      .filter(player =>
        player.name.toLowerCase().includes(focused) ||
        player.username.toLowerCase().includes(focused) ||
        (player.teamName || '').toLowerCase().includes(focused)
      )
      .slice(0, 25)
      .map(player => ({
        name: tronquerChoixAutocomplete(
          player.teamName ? `${player.name} - ${player.teamName}` : player.name
        ),
        value: player.username,
      }));

    await interaction.respond(choices);
  } catch (err) {
    console.error('❌ Erreur autocomplete /stat :', err);
    await interaction.respond([]).catch(() => {});
  }
}

function tronquerChoixAutocomplete(name) {
  return name.length > 100 ? `${name.slice(0, 97)}...` : name;
}

async function gererAutocompleteStatEquipe(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();

  try {
    const teams = await getAllEvaTeamsHybrid({ maxAgeMs: 24 * 60 * 60 * 1000 });
    const choices = teams
      .filter(team =>
        team.name.toLowerCase().includes(focused) ||
        (team.aliases || []).some(alias => alias.toLowerCase().includes(focused))
      )
      .slice(0, 25)
      .map(team => ({
        name: tronquerChoixAutocomplete(
          `${team.name}${team.aliases?.length ? ` (${team.aliases.join(', ')})` : ''}`
        ),
        value: team.aliases?.[0] || team.name,
      }));

    await interaction.respond(choices);
  } catch (err) {
    console.error('❌ Erreur autocomplete /stat-equipe :', err);
    await interaction.respond([]).catch(() => {});
  }
}

async function gererAutocompleteClassement(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();

  try {
    const standings = await getLocalLeagueStandingsHybrid({ maxAgeMs: 24 * 60 * 60 * 1000 });
    const choices = standings
      .filter(standing =>
        (standing.regionName || '').toLowerCase().includes(focused) ||
        (standing.rankingName || '').toLowerCase().includes(focused)
      )
      .slice(0, 25)
      .map(standing => ({
        name: tronquerChoixAutocomplete(
          `${standing.regionName || 'Site inconnu'} - ${standing.rankingName || 'Classement local'}`
        ),
        value: standing.regionId || standing.regionName || standing.rankingName,
      }));

    await interaction.respond(choices);
  } catch (err) {
    console.error('❌ Erreur autocomplete /classement :', err);
    await interaction.respond([]).catch(() => {});
  }
}

async function gererCommandeStatEquipe(interaction) {
  const equipe = interaction.options.getString('equipe');
  if (!equipe) return interaction.reply({ content: '❌ Indique une équipe EVA.', flags: 64 });

  await interaction.deferReply({ flags: 64 });

  try {
    await ensureEvaCacheFresh({ maxAgeMs: 24 * 60 * 60 * 1000 });
    const team = await getCaenTeamStats(equipe);
    const teamContent = [
      `📊 **Stats équipe EVA - ${team.name}**`,
      `🌍 Scope : **Toutes les équipes EVA**`,
      `🏟️ League / ranking : **${team.rankingName || 'Non classée'}**`,
      team.divisionTeamCount > 0
        ? `🏅 ${team.division} : **${team.divisionRank}/${team.divisionTeamCount}**`
        : `🏅 Région / ligue : **${team.division || 'EVA'}**`,
      `🏆 Points : **${team.points}** | Classement : **#${team.rank || team.position || 'N/A'}**`,
      `🎮 Matchs : **${team.played}** | ✅ ${team.wins} | ➖ ${team.draws} | ❌ ${team.losses}`,
    ];

    if (team.aliases?.length) teamContent.push(`🏷️ Tag(s) détecté(s) : **${team.aliases.join(', ')}**`);
    if (team.lineup?.length) teamContent.push(`👥 Lineup connue : ${team.lineup.slice(0, Number(config.EVA_TEAM_LINEUP_DISPLAY_LIMIT || 8)).join(', ')}`);
    if (team.lastMatch?.opponents?.length) {
      const match = team.lastMatch.opponents
        .map(opponent => `${opponent.name} ${opponent.score ?? '-'}`)
        .join(' vs ');
      teamContent.push(`📌 Dernier match : ${match}`);
    }

    await interaction.editReply({ content: teamContent.join('\n') });
  } catch (err) {
    console.error('❌ Erreur commande /stat-equipe :', err);
    await interaction.editReply({ content: `❌ Impossible de récupérer les stats équipe. ${err.message}` });
  }
}
async function gererCommandeClassement(interaction) {
  const site = interaction.options.getString('site');
  if (!site) return interaction.reply({ content: '❌ Choisis un site EVA.', flags: 64 });

  await interaction.deferReply({ flags: 64 });

  try {
    const query = String(site || '').trim().toLowerCase();
    const standings = await getLocalLeagueStandingsHybrid({ maxAgeMs: 24 * 60 * 60 * 1000 });
    const selectedStanding = standings.find(standing =>
      standing.regionId === site ||
      (standing.regionName || '').toLowerCase() === query ||
      (standing.rankingName || '').toLowerCase() === query ||
      (standing.regionName || '').toLowerCase().includes(query) ||
      (standing.rankingName || '').toLowerCase().includes(query)
    );
    if (!selectedStanding) {
      return interaction.editReply({ content: `❌ Site introuvable dans le cache EVA local : **${site}**.` });
    }

    const divisions = new Map();

    for (const team of selectedStanding.teams || []) {
      const key = team.division || 'Division inconnue';
      if (!divisions.has(key)) divisions.set(key, []);
      divisions.get(key).push(team);
    }

    const lines = [`🏆 **Classement ${selectedStanding.rankingName}${selectedStanding.seasonName ? ` - ${selectedStanding.seasonName}` : ''}**`];
    const sortedDivisions = [...divisions.entries()]
      .sort(([aName, aTeams], [bName, bTeams]) =>
        (aTeams[0]?.divisionNumber || parseDivisionNumberFromLabel(aName)) -
        (bTeams[0]?.divisionNumber || parseDivisionNumberFromLabel(bName))
      );

    for (const [division, teams] of sortedDivisions) {
      lines.push(`\n**${division}**`);
      teams
        .sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name, 'fr'))
        .forEach((team, index) => {
          lines.push(`${index + 1}. **${team.name}** - ${team.points} pts (${team.played} match${team.played > 1 ? 's' : ''})`);
        });
    }

    await interaction.editReply({ content: lines.join('\n') });
  } catch (err) {
    console.error('❌ Erreur commande /classement :', err);
    await interaction.editReply({ content: `❌ Impossible de récupérer le classement local. ${err.message}` });
  }
}

function parseDivisionNumberFromLabel(label) {
  const match = String(label || '').match(/division\s*(\d+)/i);
  return match ? Number(match[1]) : 999;
}

async function gererCommandeTop(interaction) {
  await interaction.deferReply({ flags: 64 });

  try {
    const cachedPlayers = await getCachedCompetitivePlayersHybrid({ maxAgeMs: 24 * 60 * 60 * 1000 });
    const players = getTopPlayers(Number(config.EVA_TOP_PLAYERS_LIMIT || 10));
    if (players.length === 0) {
      return interaction.editReply({ content: '❌ Aucun top joueur disponible dans le cache EVA local.' });
    }

    const lines = [
      `🏆 **Top ${Number(config.EVA_TOP_PLAYERS_LIMIT || 10)} joueurs compétitifs EVA - saison en cours**`,
      `👥 **Total joueurs compétitifs affichés dans le top : ${players.length}**`,
      `**(DEBUG) : Nombre total de joueurs actuel dans le cache : ${cachedPlayers.length}**`,
    ];
    players.forEach((player, index) => {
      lines.push(
        `${index + 1}. **${player.name}** (${player.username}) - KDA **${formatNumber(player.current.kda)}** ` +
        `(${player.current.gameCount} match${player.current.gameCount > 1 ? 's' : ''})`
      );
    });

    await interaction.editReply({ content: lines.join('\n') });
  } catch (err) {
    console.error('❌ Erreur commande /top :', err);
    await interaction.editReply({ content: `❌ Impossible de lire le top joueurs. ${err.message}` });
  }
}

async function gererCommandePlanning(interaction) {
  try {
    const events = await interaction.guild.scheduledEvents.fetch();
    const now = new Date();
    const max = new Date(now.getTime() + Number(config.EVA_PLANNING_WINDOW_DAYS || 7) * 24 * 60 * 60 * 1000);
    const upcoming = events.filter(ev => ev.scheduledStartAt && ev.scheduledStartAt >= now && ev.scheduledStartAt <= max);
    if (!upcoming || upcoming.size === 0) {
      return interaction.reply({ content: `📅 Aucun événement prévu dans les ${Number(config.EVA_PLANNING_WINDOW_DAYS || 7)} prochains jours.`, flags: 64 });
    }

    let text = `📅 Événements à venir (${Number(config.EVA_PLANNING_WINDOW_DAYS || 7)} jours) :\n`;
    const sorted = upcoming.sort((a,b) => a.scheduledStartAt - b.scheduledStartAt);
    for (const [, ev] of sorted) {
      const when = new Date(ev.scheduledStartAt).toLocaleString();
      text += `\n• **${ev.name}** — ${when}\n  ${ev.description || ''}\n`;
    }

    await interaction.reply({ content: text, flags: 64 });
  } catch (err) {
    console.error('❌ Erreur commande planning :', err);
    await interaction.reply({ content: '❌ Impossible de récupérer le planning.', flags: 64 });
  }
}

function reprogrammerTaches() {
  // Défis
  const defis = lireDefis();
  let countDefis = 0;
  for (const [messageId, defi] of Object.entries(defis)) {
    if (defi.valide) {
      programmerTachesDefi(messageId, defi);
      countDefis++;
    }
  }
  if (countDefis > 0) console.log(`🔄 ${countDefis} défi(s) reprogrammé(s).`);

  // Sessions
  const sessions = lireSessions();
  let countSessions = 0;
  for (const [messageId, session] of Object.entries(sessions)) {
    if (session.lancee && session.messageBienvenueId) {
      programmerTachesSession(messageId, session);
      countSessions++;
    }
  }
  if (countSessions > 0) console.log(`🔄 ${countSessions} session(s) reprogrammée(s).`);
}
async function envoyerRappelSalon(messageId, texte) {
  const defi = getDefi(messageId);
  if (!defi || !defi.salonId) return;

  try {
    const salon = await client.channels.fetch(defi.salonId);
    if (!salon) return;

    let rappelText = `${texte}\n📅 ${defi.date} à ${defi.heure} (${defi.type})`;
    if (defi.type !== 'free') {
      rappelText = `${texte}\n<@&${defi.monEquipeId}> vs <@&${defi.adversaireId}>\n📅 ${defi.date} à ${defi.heure} (${defi.type})`;
    }

    await salon.send(rappelText);
  } catch (err) {
    console.error('❌ Erreur envoi rappel salon :', err);
  }
}

async function envoyerRappelMP(messageId) {
  const defi = getDefi(messageId);
  if (!defi || !defi.salonId || !defi.messageBienvenueId) return;

  try {
    const salon = await client.channels.fetch(defi.salonId);
    if (!salon) return;
    const message = await salon.messages.fetch(defi.messageBienvenueId);
    if (!message) return;

    const reactionHorloge = message.reactions.cache.get(config.EMOJI_RAPPEL_MP);
    if (!reactionHorloge) return;

    const users = await reactionHorloge.users.fetch();
    for (const [, user] of users) {
      if (user.bot) continue;
      try { await user.send(config.MESSAGES.RAPPEL_MP(defi)); }
      catch { console.log(`⚠️ MP impossible à ${user.tag}`); }
    }
  } catch (err) {
    console.error('❌ Erreur envoi rappel MP :', err);
  }
}

async function nettoyerDefi(messageId) {
  const defi = getDefi(messageId);
  if (!defi) return;

  try {
    if (defi.salonId) {
      const salon = await client.channels.fetch(defi.salonId).catch(() => null);
      if (salon) await salon.delete('Nettoyage automatique après le match');
    }
    if (defi.eventId && defi.guildId) {
      const guild = await client.guilds.fetch(defi.guildId);
      const event = await guild.scheduledEvents.fetch(defi.eventId).catch(() => null);
      if (event) await event.delete();
    }
  } catch (err) {
    console.error('❌ Erreur nettoyage :', err);
  }

  supprimerDefi(messageId);
  console.log(`🗑️ Défi ${messageId} nettoyé.`);
}

// ========================================
// 🎮 COMMANDE /session
// ========================================

async function gererCommandeSession(interaction) {
  if (!interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '❌ Commande réservée aux administrateurs.', flags: 64 });
  }

  const type = interaction.options.getString('type');
  const joueursRequis = interaction.options.getInteger('joueurs');
  const date = interaction.options.getString('date');
  const heure = interaction.options.getString('heure');
  const description = interaction.options.getString('description') || null;

  // Validations format
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(date))
    return interaction.reply({ content: config.MESSAGES.ERREUR_FORMAT_DATE, flags: 64 });
  if (!/^\d{2}:\d{2}$/.test(heure))
    return interaction.reply({ content: config.MESSAGES.ERREUR_FORMAT_HEURE, flags: 64 });
  if (parseDateHeure(date, heure) <= new Date())
    return interaction.reply({ content: config.MESSAGES.ERREUR_DATE_PASSEE, flags: 64 });

  const session = {
    type,
    joueursRequis,
    date,
    heure,
    description,
    auteurId: interaction.user.id,
    auteurTag: interaction.user.tag,
    guildId: interaction.guild.id,
    channelId: interaction.channel.id,
    participants: [],
    lancee: false,
  };

  try {
    const event = await creerEventSession(interaction.guild, session);
    session.eventId = event.id;
  } catch (err) {
    console.error('❌ Erreur création event session :', err);
  }

  const embed = construireEmbedSession(session);
  const components = [construireBoutonsSession()];
  await interaction.reply({ embeds: [embed], components });
  const message = await interaction.fetchReply().catch((err) => {
    console.error('❌ Impossible de récupérer le message de session :', err);
    return null;
  });

  if (message) {
    sauverSession(message.id, session);
  } else {
    console.error('❌ Session non sauvegardée : message inconnu après reply');
  }
}

async function gererCommandeRenfort(interaction) {
  const channelId = interaction.channelId;
  const userId = interaction.user.id;
  const cible = interaction.options.getUser('joueur');
  const equipeOption = interaction.options.getRole('equipe');

  if (!cible) return interaction.reply({ content: '❌ Indique un joueur à inviter.', flags: 64 });
  if (!equipeOption) return interaction.reply({ content: '❌ Indique l’équipe qui demande le renfort.', flags: 64 });

  const [defiId, defi] = trouverDefiParSalonId(channelId);
  const [sessionId, session] = !defi ? trouverSessionParSalonId(channelId) : [null, null];

  if (!defi && !session) {
    return interaction.reply({ content: '❌ Cette commande doit être utilisée dans un salon privé de match ou de session.', flags: 64 });
  }

  const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
  const isAuthorizedByDefi = defi && (
    defi.auteurId === userId ||
    (defi.type === 'free' && defi.participants.includes(userId)) ||
    interaction.member.roles.cache.has(defi.monEquipeId) ||
    interaction.member.roles.cache.has(defi.adversaireId)
  );
  const isAuthorizedBySession = session && (
    session.auteurId === userId || session.participants.includes(userId)
  );

  if (!isAdmin && !isAuthorizedByDefi && !isAuthorizedBySession) {
    return interaction.reply({ content: '❌ Tu n\'es pas autorisé(e) à inviter des joueurs dans ce salon.', flags: 64 });
  }

  const channel = await client.channels.fetch(channelId);
  if (!channel || channel.type !== ChannelType.GuildText) {
    return interaction.reply({ content: '❌ Impossible de récupérer le salon actuel.', flags: 64 });
  }
  // Inviter un seul utilisateur
  if (!cible.bot) {
    await channel.permissionOverwrites.edit(cible.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    });

    if (defi && defi.type === 'free' && !defi.participants.includes(cible.id)) {
      defi.participants.push(cible.id);
    }
    if (session && !session.participants.includes(cible.id)) {
      session.participants.push(cible.id);
    }

    // Pour les matchs, stocker les informations de renfort
    if (defi) {
      if (!defi.renforts) defi.renforts = [];
      defi.renforts.push({ userId: cible.id, equipeId: equipeOption.id });
    }

    if (defi && defiId) sauverDefi(defiId, defi);
    if (session && sessionId) sauverSession(sessionId, session);

    await interaction.reply({ content: `✅ Invitation envoyée : <@${cible.id}>`, flags: 64 });
    return;
  }
  return interaction.reply({ content: '❌ Impossible d\'inviter un bot.', flags: 64 });
}

function construireEmbedSession(session, lancee = false) {
  const participantsTexte = session.participants.length > 0
    ? session.participants.map(id => `<@${id}>`).join('\n')
    : config.MESSAGES.SESSION_PARTICIPANTS_VIDE;

  const embed = new EmbedBuilder()
    .setColor(lancee ? config.COULEUR_SESSION_LANCEE : config.COULEUR_SESSION_OUVERTE)
    .setTitle(config.MESSAGES.SESSION_TITRE(session.type))
    .setDescription(config.MESSAGES.SESSION_DESCRIPTION(session.type))
    .addFields(
      { name: '👥 Joueurs', value: `${session.participants.length} / ${session.joueursRequis}`, inline: true },
      { name: '📅 Date', value: session.date, inline: true },
      { name: '🕐 Heure', value: session.heure, inline: true },
    )
    .addFields({ name: '✅ Participants', value: participantsTexte })
    .setFooter({ text: config.MESSAGES.SESSION_FOOTER(session.auteurTag) })
    .setTimestamp();

  if (session.description) embed.addFields({ name: '📝 Description', value: session.description });
  return embed;
}

function construireBoutonsSession() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(config.BUTTON_ID_REJOINDRE)
      .setLabel('Je participe')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(config.BUTTON_ID_QUITTER)
      .setLabel('Me retirer')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Secondary),
  );
}

async function gererBoutonSession(interaction) {
  const session = getSession(interaction.message.id);
  if (!session)
    return interaction.reply({ content: config.MESSAGES.SESSION_INTROUVABLE, flags: 64 });
  if (session.lancee)
    return interaction.reply({ content: '⚠️ Cette session est déjà lancée.', flags: 64 });

  const userId = interaction.user.id;

  if (interaction.customId === config.BUTTON_ID_REJOINDRE) {
    if (session.participants.includes(userId))
      return interaction.reply({ content: config.MESSAGES.SESSION_DEJA_INSCRIT, flags: 64 });
    session.participants.push(userId);
  } else if (interaction.customId === config.BUTTON_ID_QUITTER) {
    if (!session.participants.includes(userId))
      return interaction.reply({ content: config.MESSAGES.SESSION_PAS_INSCRIT, flags: 64 });
    session.participants = session.participants.filter(id => id !== userId);
  }

 if (session.participants.length >= session.joueursRequis) {
  session.lancee = true;

  try {
    // 1. Créer le salon privé de session
    const salon = await creerSalonPriveSession(interaction.guild, session);
    session.salonId = salon.id;

    // 2. Créer l'événement Discord
    const event = await creerEventSession(interaction.guild, session);
    session.eventId = event.id;

    // 3. Sauvegarder la session mise à jour
    sauverSession(interaction.message.id, session);

    // 4. Mettre à jour l'embed public
    const embed = construireEmbedSession(session, true);
    await interaction.update({ embeds: [embed], components: [] });

    // 5. Envoyer un message dans le salon privé et ajouter la réaction horloge
    const messageBienvenue = await salon.send(
      `🎉 **Session ${session.type} validée !**\n\n` +
      `📅 Date : **${session.date}** à **${session.heure}**\n` +
      `👥 Participants : ${session.participants.map(id => `<@${id}>`).join(' ')}\n\n` +
      `Bienvenue dans votre salon privé de session !\n\n` +
      `⏰ Réagis avec ${config.EMOJI_RAPPEL_MP} si tu veux être notifié(e) en MP 48h avant la session.`
    );
    await messageBienvenue.react(config.EMOJI_RAPPEL_MP);
    session.messageBienvenueId = messageBienvenue.id;

    // 6. Sauvegarder la session mise à jour avec le message de bienvenue
    sauverSession(interaction.message.id, session);
    programmerTachesSession(interaction.message.id, session);

    // 7. Confirmer dans le salon public
    await interaction.followUp({
      content:
        config.MESSAGES.SESSION_LANCEE(session) +
        `\n\n📌 Salon privé créé : <#${salon.id}>`,
    });

    return;

  } catch (err) {
    console.error('❌ Erreur validation session :', err);

    if (!interaction.replied) {
      return interaction.reply({
        content: '❌ Impossible de créer le salon privé de session.',
        flags: 64,
      });
    }

    return interaction.followUp({
      content: '❌ Impossible de créer le salon privé de session.',
      flags: 64,
    });
  }
}


  sauverSession(interaction.message.id, session);
  const embed = construireEmbedSession(session);
  await interaction.update({ embeds: [embed] });
}

async function creerEventSession(guild, session) {
  const dateDebut = parseDateHeure(session.date, session.heure);
  const dateFin = new Date(dateDebut.getTime() + config.DUREE_SESSION);

  return guild.scheduledEvents.create({
    name: `Session ${session.type}`,
    scheduledStartTime: dateDebut,
    scheduledEndTime: dateFin,
    privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
    entityType: GuildScheduledEventEntityType.External,
    entityMetadata: { location: 'Discord' },
    description: session.description || `Session ${session.type} organisée sur le serveur.`,
  });
}

function programmerTachesSession(messageId, session) {
  const dateSession = parseDateHeure(session.date, session.heure);
  const maintenant = new Date();

  planifier(
    `rappel_mp_session_${messageId}`,
    new Date(dateSession.getTime() - config.RAPPEL_MP_SESSION_AVANT),
    maintenant,
    () => envoyerRappelMPSession(messageId)
  );
}

async function envoyerRappelMPSession(messageId) {
  const session = getSession(messageId);
  if (!session || !session.salonId || !session.messageBienvenueId) return;

  try {
    const salon = await client.channels.fetch(session.salonId);
    const message = await salon.messages.fetch(session.messageBienvenueId);
    const reaction = message.reactions.cache.get(config.EMOJI_RAPPEL_MP);
    if (!reaction) return;

    const users = await reaction.users.fetch();
    for (const [, user] of users) {
      if (user.bot) continue;
      try {
        await user.send(config.MESSAGES.RAPPEL_MP_SESSION(session));
      } catch {
        console.log(`⚠️ MP impossible à ${user.tag}`);
      }
    }
  } catch (err) {
    console.error('❌ Erreur rappel MP session :', err);
  }
}

// ========================================
// 🔑 Connexion
// ========================================
client.login(process.env.DISCORD_TOKEN);
