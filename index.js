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
  ensureEvaV2Fresh,
  getEvaPlayerStats,
  getEvaTeamStats,
  getEvaCityStandings,
  getEvaTopPlayers,
  getEvaTopTeams,
  searchPlayers,
  searchTeams,
  searchLocations,
  estimateRefreshETA,
} = require('./utils/eva-v2');

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

const confirmationsAnnulationMatch = new Map();

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
  const heure = String(defi.heure || '')
    .replace(/:/g, '-')
    .replace(/[^0-9-]/g, '');
  return `${defi.type}-${date}-${heure}`.toLowerCase();
}

function construireBoutonAnnulationMatch(defi) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${config.BUTTON_ID_ANNULER_MATCH}:${defi.messageId}`)
      .setLabel('Annuler le match')
      .setEmoji('🛑')
      .setStyle(ButtonStyle.Danger),
  );
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

async function handleReady() {
  console.log(`✅ Bot connecté en tant que ${client.user.tag} !`);
  reprogrammerTaches();

  try {
    const eta = await estimateRefreshETA({ full: true }).catch(() => ({ estimatedMs: 0, estimatedRequests: 0 }));
    if (eta && eta.estimatedMs > 0) {
      console.log(`⏳ Import initial EVA v2 estimé ~ ${Math.round(eta.estimatedMs / 60000)} min (${eta.estimatedRequests} requêtes)`);
    } else {
      console.log('⏳ Import initial EVA v2 : estimation non disponible.');
    }

    const start = Date.now();
    const status = await ensureEvaV2Fresh({ force: true });
    const duration = Date.now() - start;
    console.log(`Cache EVA v2 pret (${status.teams} equipes, ${status.players} joueurs indexes) — terminé en ${Math.round(duration/1000)}s.`);
  } catch (err) {
    console.error('Impossible de precharger le cache EVA v2 :', err);
  }

  demarrerRefreshEvaV2Periodique();
}

client.once('ready', handleReady);

function demarrerRefreshEvaV2Periodique() {
  const intervalMs = Number(config.EVA_V2_CACHE_TTL_MS || 24 * 60 * 60 * 1000);
  const timer = setInterval(() => {
    (async () => {
      try {
        const eta = await estimateRefreshETA({ full: false }).catch(() => ({ estimatedMs: 0, estimatedRequests: 0 }));
        if (eta && eta.estimatedMs > 0) {
          console.log(`⏳ Refresh periodique EVA v2 estimé ~ ${Math.round(eta.estimatedMs / 60000)} min (${eta.estimatedRequests} requêtes)`);
        }
        const start = Date.now();
        const status = await ensureEvaV2Fresh({ force: true });
        const duration = Date.now() - start;
        console.log(`Refresh EVA v2 periodique termine (${status.teams} equipes, ${status.players} joueurs) — ${Math.round(duration/1000)}s.`);
      } catch (err) {
        console.error('Refresh EVA v2 periodique en erreur :', err);
      }
    })();
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
}

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
        case 'help':    return gererCommandeHelp(interaction);
        case 'ping':    return interaction.reply('Pong ! 🏓');
        case 'mix':     return gererCommandeMatch(interaction);
        case 'scrim':   return gererCommandeMatch(interaction);
        case 'free':    return gererCommandeMatch(interaction);
        case 'renfort': return gererCommandeRenfort(interaction);
        case 'stat':    return gererCommandeStat(interaction);
        case 'stat-equipe': return gererCommandeStatEquipe(interaction);
        case 'classement': return gererCommandeClassement(interaction);
        case 'top': return gererCommandeTop(interaction);
        case 'top-equipe': return gererCommandeTopEquipe(interaction);
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
      if (interaction.customId.startsWith(config.BUTTON_ID_ANNULER_MATCH)) {
        return gererBoutonAnnulationMatch(interaction);
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

async function gererCommandeHelp(interaction) {
  const lines = [
    '**Guide rapide JarlBot**',
    'JarlBot organise les matchs EVA, les sessions, les renforts et affiche les classements/stats EVA.',
    '',
    '**Matchs et salons privés**',
    '`/mix` : crée un match amical entre ton équipe et une autre équipe.',
    'À remplir : nombre de matchs, date, heure, ton rôle équipe, adversaire.',
    '`/scrim` : crée un match d’entraînement compétitif, avec le même fonctionnement que `/mix`.',
    '`/free` : ouvre une session libre à plusieurs joueurs, avec un niveau attendu.',
    '`/renfort` : invite un joueur dans un salon privé existant pour aider une équipe.',
    '',
    '**Sessions communautaires**',
    '`/session` : propose une session spéciale, comme Nocturne, Matinale ou événement.',
    'Les joueurs rejoignent avec les boutons. Le bot crée le salon quand le nombre demandé est atteint.',
    '`/planning` : affiche les événements Discord prévus dans les prochains jours.',
    '',
    '**Stats EVA**',
    '`/stat joueur:` : affiche les stats d’un joueur EVA.',
    'Astuce : tape juste le pseudo si tu ne connais pas le discriminant, par exemple `TGMxRIBS`.',
    '`/stat-equipe equipe:` : affiche salle, ligue, points, rang et roster d’une équipe.',
    '`/classement site:` : affiche les équipes classées dans une ville ou salle EVA.',
    '`/top` : affiche les meilleurs joueurs EVA de la major league, avec KDA et tendance.',
    '`/top-equipe` : affiche les meilleures équipes EVA de la major league.',
    '',
    '**Utilitaires**',
    '`/ping` : vérifie simplement que le bot répond.',
    '',
    '**Conseils**',
    'Les champs avec autocomplétion proposent les joueurs, équipes et villes connus.',
    'Si une stat manque, le profil EVA peut être privé ou pas encore indexé.',
    'Les données EVA sont gardées en cache et rafraîchies régulièrement pour répondre vite.',
  ];

  await interaction.reply({ content: lines.join('\n'), flags: 64 });
}

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
  } else if (emoji === config.EMOJI_REFUSER && matchData.type !== 'free') {
    const adversaireCount = await getRoleMemberCount(guild, matchData.adversaireId);
    const threshold = adversaireCount === 0 ? 1 : Math.min(4, adversaireCount);
    const votes = await compterVotesRefus(reaction, guild, matchData.adversaireId);
    console.log(`🗳️ ${matchData.type} ${reaction.message.id} : ${votes}/${threshold} votes refus (${adversaireCount} membres au rôle)`);

    if (votes >= threshold) {
      await refuserDefi(reaction.message, matchData);
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

async function compterVotesRefus(reaction, guild, roleId) {
  const reactionNegative = reaction.message.reactions.cache.get(config.EMOJI_REFUSER);
  if (!reactionNegative) return 0;

  const users = await reactionNegative.users.fetch();
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

function trouverDefiParMessageOuSalonId(messageId) {
  const defis = lireDefis();
  return (
    Object.entries(defis).find(([, defi]) => defi.messageId === messageId) ||
    Object.entries(defis).find(([, defi]) => defi.messageBienvenueId === messageId) ||
    Object.entries(defis).find(([, defi]) => defi.salonId === messageId) ||
    [null, null]
  );
}

// ========================================
// ✅ Validation d'un défi
// ========================================

async function validerDefi(message, defi) {
  const guild = message.guild;
  defi.messageId = message.id;
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
    await bienvenue.edit({
      content: `${config.MESSAGES.BIENVENUE_SALON_PRIVE(defi)}\n\nBouton disponible pour annuler le match.`,
      components: [construireBoutonAnnulationMatch(defi)],
    }).catch(() => {});
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

async function refuserDefi(message, defi) {
  defi.refuse = true;
  sauverDefi(message.id, defi);

  if (message.editable) {
    await message.edit({
      content: `${message.content}\n\n⛔ Le match a été refusé par vote.`,
      components: [],
    }).catch(() => {});
  }

  supprimerDefi(message.id);
}

async function annulerDefi(defi, publicMessageId, reason = 'annulation') {
  const channel = defi.salonId ? await client.channels.fetch(defi.salonId).catch(() => null) : null;
  if (channel) {
    await channel.delete(`Match ${reason}`).catch(err => {
      console.error(`❌ Impossible de supprimer le salon ${defi.salonId} :`, err.message);
    });
  }

  const guild = channel?.guild || client.guilds.cache.get(defi.guildId);
  if (guild && defi.eventId) {
    const event = await guild.scheduledEvents.fetch(defi.eventId).catch(() => null);
    if (event) {
      await event.delete(`Match ${reason}`).catch(err => {
        console.error(`❌ Impossible de supprimer l'événement ${defi.eventId} :`, err.message);
      });
    }
  }

  supprimerDefi(publicMessageId);
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
    const data = await getEvaPlayerStats(joueur);
    const content = [`Stats EVA de **${data.name || joueur}**`];
    const current = data.current || {};
    const previous = data.previous || {};
    const all = data.all || {};

    if (data.username) content.push(`Profil : **${data.username}**`);
    if (data.teamName) content.push(`Equipe : **${data.teamName}**`);
    if (data.locationName || data.leagueName) {
      const local = [data.locationName, data.leagueName].filter(Boolean).join(' - ');
      content.push(`Ligue locale : **${local || 'N/A'}**${data.localRank ? ` | rang equipe #${data.localRank}` : ''}`);
    }

    const trend = formatTrend(data.trend);
    content.push(`KDA saison : **${formatNumber(current.kda)}**${previous.kda ? ` vs ${formatNumber(previous.kda)} saison precedente` : ''} (${trend})`);
    content.push(`Matchs saison : **${current.gameCount || 0}**${all.gameCount != null ? ` (${all.gameCount} all-time)` : ''}`);

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

function formatTrend(value) {
  if (value === 'hausse') return '🟢 ↗ en hausse';
  if (value === 'baisse') return '🔴 ↘ en baisse';
  return '⚪ → stable';
}

function limiterMessageDiscord(content, maxLength = 1900) {
  if (content.length <= maxLength) return content;
  return `${content.slice(0, maxLength - 20)}\n... (tronque)`;
}

async function gererAutocompleteStat(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();

  try {
    await ensureEvaV2Fresh();
    const choices = searchPlayers(focused, 25)
      .map(player => ({
        name: tronquerChoixAutocomplete(
          player.team_name ? `${player.name} - ${player.team_name}` : player.name
        ),
        value: player.eva_username || player.name,
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
    await ensureEvaV2Fresh();
    const choices = searchTeams(focused, 25)
      .map(team => ({
        name: tronquerChoixAutocomplete(
          team.current_region_name ? `${team.name} - ${team.current_region_name}` : team.name
        ),
        value: team.name,
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
    await ensureEvaV2Fresh();
    const choices = searchLocations(focused, 25)
      .map(standing => ({
        name: tronquerChoixAutocomplete(
          `${standing.name || 'Site inconnu'} - ${standing.ranking_name || 'Classement local'}`
        ),
        value: standing.name || standing.ranking_name,
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
    const team = await getEvaTeamStats(equipe);
    const teamContent = [
      `Stats equipe EVA - **${team.name}**`,
      `Salle / ville : **${team.current_region_name || 'N/A'}**`,
      `Ligue : **${team.current_ranking_name || 'Non classee'}**`,
      `Classement local : **#${team.current_rank || team.current_position || 'N/A'}**`,
      `Points saison : **${team.current_points || 0}** (${formatTrend(team.trend_label)})`,
      `Matchs : **${team.current_played || 0}** | W ${team.current_wins || 0} | D ${team.current_draws || 0} | L ${team.current_losses || 0}`,
    ];

    if (team.previous_points != null) teamContent.push(`Saison precedente : **${team.previous_points} pts**, rang **#${team.previous_rank || 'N/A'}**`);
    if (team.roster?.length) {
      teamContent.push(`Roster : ${team.roster.slice(0, Number(config.EVA_TEAM_LINEUP_DISPLAY_LIMIT || 8)).map(player => player.eva_username || player.name).join(', ')}`);
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
    const standings = await getEvaCityStandings(site);
    if (!standings.rankings.length) {
      return interaction.editReply({ content: `Aucun classement local trouve pour **${site}**.` });
    }

    const lines = [`Classements EVA - **${standings.locationName}**`];
    for (const ranking of standings.rankings.slice(0, 4)) {
      lines.push(`\n**${ranking.ranking_name}${ranking.season_name ? ` - ${ranking.season_name}` : ''}**`);
      const teams = [...(ranking.teams || [])]
        .sort((a, b) => b.points - a.points || a.rank - b.rank || a.team_name.localeCompare(b.team_name, 'fr'))
        .slice(0, 15);
      for (const team of teams) {
        lines.push(`#${team.rank || team.position || '-'} **${team.team_name}** - ${team.points} pts (${team.played || 0} match${team.played > 1 ? 's' : ''})`);
      }
    }

    await interaction.editReply({ content: limiterMessageDiscord(lines.join('\n')) });
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
    const limit = Number(config.EVA_TOP_PLAYERS_LIMIT || 10);
    const players = await getEvaTopPlayers(limit);
    if (players.length === 0) {
      return interaction.editReply({ content: 'Aucun top joueur disponible dans la base EVA v2.' });
    }

    const lines = [
      `Top ${limit} joueurs EVA - major league`,
    ];
    players.forEach((player, index) => {
      lines.push(
        `${index + 1}. **${player.name}**${player.teamName ? ` - ${player.teamName}` : ''} - KDA **${formatNumber(player.kda)}** ` +
        `(${player.gameCount} match${player.gameCount > 1 ? 's' : ''}, ${formatTrend(player.trend)})`
      );
    });

    await interaction.editReply({ content: lines.join('\n') });
  } catch (err) {
    console.error('❌ Erreur commande /top :', err);
    await interaction.editReply({ content: `❌ Impossible de lire le top joueurs. ${err.message}` });
  }
}

async function gererCommandeTopEquipe(interaction) {
  await interaction.deferReply({ flags: 64 });

  try {
    const limit = Number(config.EVA_TOP_PLAYERS_LIMIT || 10);
    const teams = await getEvaTopTeams(limit);
    if (teams.length === 0) {
      return interaction.editReply({ content: 'Aucun top equipe disponible dans la base EVA v2.' });
    }

    const lines = [`Top ${limit} equipes EVA - major league`];
    teams.forEach((team, index) => {
      const diff = Number(team.score_for || 0) - Number(team.score_against || 0);
      lines.push(
        `${index + 1}. **${team.team_name}** - ${team.points} pts ` +
        `(${team.wins || 0}W/${team.draws || 0}D/${team.losses || 0}L, diff ${diff >= 0 ? '+' : ''}${diff}, ${formatTrend(team.trend_label)})`
      );
    });

    await interaction.editReply({ content: lines.join('\n') });
  } catch (err) {
    console.error('❌ Erreur commande /top-equipe :', err);
    await interaction.editReply({ content: `❌ Impossible de lire le top equipes. ${err.message}` });
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

async function gererBoutonAnnulationMatch(interaction) {
  const [defiId, defi] = trouverDefiParMessageOuSalonId(interaction.message.id);
  if (!defi) {
    return interaction.reply({ content: '❌ Ce match n’existe plus.', flags: 64 });
  }

  if (!defi.salonId) {
    return interaction.reply({ content: '❌ Ce match n’a pas encore de salon privé à annuler.', flags: 64 });
  }

  const key = `${interaction.message.id}:${interaction.user.id}`;
  const now = Date.now();
  const confirmation = confirmationsAnnulationMatch.get(key);

  if (!confirmation || confirmation.expiresAt < now) {
    confirmationsAnnulationMatch.set(key, { expiresAt: now + (30 * 1000) });
    setTimeout(() => {
      const current = confirmationsAnnulationMatch.get(key);
      if (current && current.expiresAt <= Date.now()) confirmationsAnnulationMatch.delete(key);
    }, 31 * 1000).unref?.();

    return interaction.reply({
      content: 'Vous êtes sûr ? Recliquez sur le bouton pour confirmer l’annulation.',
      flags: 64,
    });
  }

  confirmationsAnnulationMatch.delete(key);
  await annulerDefi(defi, defiId, 'annulation confirmée');

  if (interaction.message.editable) {
    await interaction.message.edit({
      content: `${interaction.message.content}\n\n🛑 Match annulé.`,
      components: [],
    }).catch(() => {});
  }

  return interaction.reply({
    content: '🛑 Le match a bien été annulé.',
    flags: 64,
  });
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
