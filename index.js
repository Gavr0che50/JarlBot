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
  sauverSession, getSession, supprimerSession, lireSessions,
} = require('./utils/storage');
const { lireResultats, incrementWin, incrementLoss } = require('./utils/storage');

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
}

client.once('ready', handleReady);
client.once('clientReady', handleReady);

// ========================================
// ⚡ Routeur d'interactions
// ========================================

client.on('interactionCreate', async (interaction) => {
  try {
    // --- Commandes slash ---
    if (interaction.isChatInputCommand()) {
      switch (interaction.commandName) {
        case 'ping':    return interaction.reply('Pong ! 🏓');
        case 'mix':     return gererCommandeMatch(interaction);
        case 'scrim':   return gererCommandeMatch(interaction);
        case 'free':    return gererCommandeMatch(interaction);
        case 'renfort': return gererCommandeRenfort(interaction);
        case 'resultat': return gererCommandeResultat(interaction);
        case 'planning': return gererCommandePlanning(interaction);
        case 'session': return gererCommandeSession(interaction);
        case 'cleanup': return gererCommandeCleanup(interaction);
      }
    }

    // --- Boutons ---
    if (interaction.isButton()) {
      // Session join/leave
      if (
        interaction.customId === config.BUTTON_ID_REJOINDRE ||
        interaction.customId === config.BUTTON_ID_QUITTER
      ) {
        return gererBoutonSession(interaction);
      }

      // Résultats post-match (customId: result_<messageId>_<teamId>)
      if (interaction.customId && interaction.customId.startsWith('result_')) {
        return gererBoutonResultat(interaction);
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
    participants: [],
  };

  let replyContent = config.MESSAGES.NOUVEAU_MATCH(matchData, monEquipe, adversaire);
  if (type !== 'free') {
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
      const reactionPositive = reaction.message.reactions.cache.get(config.EMOJI_ACCEPTER);
      if (!reactionPositive) return;

      const users = await reactionPositive.users.fetch();
      const participantIds = [...new Set(
        users.filter(u => !u.bot).map(u => u.id)
      )];
      if (!participantIds.includes(matchData.auteurId)) participantIds.unshift(matchData.auteurId);

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

  // Planifier l'envoi du prompt de résultat à la fin du match (ne bloque pas le nettoyage)
  const finMatch = new Date(dateMatch.getTime() + (defi.type === 'free' ? config.DUREE_SESSION : (defi.nombreMatchs || 1) * config.DUREE_UN_MATCH));
  planifier(`prompt_result_${messageId}`, finMatch, maintenant, () => envoyerPromptResultat(messageId));
}

async function envoyerPromptResultat(messageId) {
  const defi = getDefi(messageId);
  if (!defi || !defi.salonId) return;
  if (!defi.monEquipeId || !defi.adversaireId) return; // skip frees

  try {
    const salon = await client.channels.fetch(defi.salonId).catch(() => null);
    if (!salon) return;

    const nomEquipeA = getNomRole(salon.guild, defi.monEquipeId, 'Équipe 1');
    const nomEquipeB = getNomRole(salon.guild, defi.adversaireId, 'Équipe 2');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`result_${messageId}_${defi.monEquipeId}`)
        .setLabel(`${nomEquipeA} a gagné ?`)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`result_${messageId}_${defi.adversaireId}`)
        .setLabel(`${nomEquipeB} a gagné ?`)
        .setStyle(ButtonStyle.Primary),
    );

    const prompt = await salon.send({ content: `🏁 Le match est terminé ! Qui a gagné ?
Un joueur de chaque équipe doit confirmer la même équipe pour valider le résultat. (Optionnel)` , components: [row] });

    defi.resultMessageId = prompt.id;
    defi.resultVotes = {};
    defini = defi; // no-op to satisfy linter
    sauverDefi(messageId, defi);
  } catch (err) {
    console.error('❌ Erreur envoi prompt résultat :', err);
  }
}

async function gererBoutonResultat(interaction) {
  // customId: result_<messageId>_<teamId>
  const parts = interaction.customId.split('_');
  if (parts.length < 3) return interaction.reply({ content: '❌ Identifiant invalide.', ephemeral: true });
  const messageId = parts[1];
  const teamId = parts.slice(2).join('_');

  const defi = getDefi(messageId);
  if (!defi) return interaction.reply({ content: '❌ Match introuvable.', ephemeral: true });
  if (!defi.resultVotes) defi.resultVotes = {};
  if (!defi.resultVotes[teamId]) defi.resultVotes[teamId] = [];

  const userId = interaction.user.id;
  if (!defi.resultVotes[teamId].includes(userId)) defi.resultVotes[teamId].push(userId);
  sauverDefi(messageId, defi);

  // Vérifier si le vote contient au moins un membre de chaque équipe
  const voters = defi.resultVotes[teamId];
  let hasA = false, hasB = false;
  for (const uid of voters) {
    const m = await interaction.guild.members.fetch(uid).catch(() => null);
    if (!m) continue;
    if (m.roles.cache.has(defi.monEquipeId)) hasA = true;
    if (m.roles.cache.has(defi.adversaireId)) hasB = true;
  }

  await interaction.reply({ content: '✅ Vote enregistré.', ephemeral: true });

  if (hasA && hasB) {
    // Accept result
    defi.result = { winnerRoleId: teamId, loserRoleId: (teamId === defi.monEquipeId ? defi.adversaireId : defi.monEquipeId) };
    defi.resultAccepted = true;
    sauverDefi(messageId, defi);

    // Apply results: credit wins/losses to role members (non-bot)
    const guild = interaction.guild;
    const winnerRole = guild.roles.cache.get(defi.result.winnerRoleId);
    const loserRole = guild.roles.cache.get(defi.result.loserRoleId);

    if (winnerRole) {
      for (const [, m] of winnerRole.members) {
        if (m.user.bot) continue;
        incrementWin(m.id);
      }
    }
    if (loserRole) {
      for (const [, m] of loserRole.members) {
        if (m.user.bot) continue;
        incrementLoss(m.id);
      }
    }

    // Edit original prompt to disable buttons
    try {
      const channel = await client.channels.fetch(defi.salonId).catch(() => null);
      if (channel && defi.resultMessageId) {
        const msg = await channel.messages.fetch(defi.resultMessageId).catch(() => null);
        if (msg) {
          const disabledRow = msg.components.map(row => {
            row.components.forEach(c => c.setDisabled(true));
            return row;
          });
          await msg.edit({ content: msg.content + `\n\n✅ Résultat validé : <@&${defi.result.winnerRoleId}> gagne.`, components: disabledRow }).catch(() => {});
        }
      }
    } catch (err) {
      console.error('❌ Impossible de mettre à jour le message résultat :', err);
    }

    // Notify salon
    try {
      const channel = await client.channels.fetch(defi.salonId).catch(() => null);
      if (channel) {
        await channel.send(`🏆 Résultat validé : <@&${defi.result.winnerRoleId}> gagne contre <@&${defi.result.loserRoleId}>. Utilisez /resultat pour consulter vos stats (hors tournoi de league).`);
      }
    } catch (err) {
      console.error('❌ Erreur notification résultat :', err);
    }
  }
}

async function gererCommandeResultat(interaction) {
  const user = interaction.options.getUser('joueur') || interaction.user;
  const resultats = lireResultats();
  const r = resultats[user.id] || { wins: 0, losses: 0 };
  await interaction.reply({ content: `📊 Bilan de ${user.tag} (hors tournoi de league) :\n✅ Victoires : ${r.wins}\n❌ Défaites : ${r.losses}`, flags: 64 });
}

async function gererCommandePlanning(interaction) {
  try {
    const events = await interaction.guild.scheduledEvents.fetch();
    const now = new Date();
    const max = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const upcoming = events.filter(ev => ev.scheduledStartAt && ev.scheduledStartAt >= now && ev.scheduledStartAt <= max);
    if (!upcoming || upcoming.size === 0) {
      return interaction.reply({ content: '📅 Aucun événement prévu dans les 7 prochains jours.', flags: 64 });
    }

    let text = '📅 Événements à venir (7 jours) :\n';
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
  const { lireSessions } = require('./utils/storage');
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
  const options = [
    interaction.options.getUser('joueur1'),
    interaction.options.getUser('joueur2'),
    interaction.options.getUser('joueur3'),
  ].filter(Boolean);

  if (!options.length) {
    return interaction.reply({ content: '❌ Indique au moins un joueur à inviter.', flags: 64 });
  }

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

  const invited = [];
  for (const user of options) {
    if (user.bot) continue;
    await channel.permissionOverwrites.edit(user.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    });
    invited.push(user.id);
    if (defi && defi.type === 'free' && !defi.participants.includes(user.id)) {
      defi.participants.push(user.id);
    }
    if (session && !session.participants.includes(user.id)) {
      session.participants.push(user.id);
    }
  }

  if (!invited.length) {
    return interaction.reply({ content: '❌ Aucun joueur valide à inviter.', flags: 64 });
  }

  if (defi && defiId) {
    sauverDefi(defiId, defi);
  }
  if (session && sessionId) {
    sauverSession(sessionId, session);
  }

  const mentionText = invited.map(id => `<@${id}>`).join(' ');
  await interaction.reply({
    content: `✅ Invitation envoyée : ${mentionText}`,
    flags: 64,
  });
}

async function gererCommandeCleanup(interaction) {
  if (!interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '❌ Commande réservée aux administrateurs.', flags: 64 });
  }

  await interaction.deferReply({ flags: 64 });

  const defis = lireDefis();
  const sessions = lireSessions();
  let deletedChannels = 0;
  let deletedEvents = 0;
  let deletedDefis = 0;
  let deletedSessions = 0;

  for (const jobName of Object.keys(schedule.scheduledJobs)) {
    schedule.cancelJob(jobName);
  }

  try {
    for (const [messageId, defi] of Object.entries(defis)) {
      if (defi.salonId) {
        const salon = await client.channels.fetch(defi.salonId).catch(err => {
          console.error(`❌ Impossible de récupérer le salon défi ${defi.salonId} :`, err.message);
          return null;
        });
        if (salon) {
          await salon.delete('Nettoyage administrateur').catch(err => {
            console.error(`❌ Impossible de supprimer le salon défi ${defi.salonId} :`, err.message);
          });
          deletedChannels++;
        }
      }
      if (defi.eventId && defi.guildId) {
        const guild = await client.guilds.fetch(defi.guildId).catch(() => null);
        if (guild) {
          const event = await guild.scheduledEvents.fetch(defi.eventId).catch(() => null);
          if (event) {
            await event.delete().catch(() => null);
            deletedEvents++;
          }
        }
      }
      supprimerDefi(messageId);
      deletedDefis++;
    }

    for (const [messageId, session] of Object.entries(sessions)) {
      if (session.salonId) {
        const salon = await client.channels.fetch(session.salonId).catch(err => {
          console.error(`❌ Impossible de récupérer le salon session ${session.salonId} :`, err.message);
          return null;
        });
        if (salon) {
          await salon.delete('Nettoyage administrateur').catch(err => {
            console.error(`❌ Impossible de supprimer le salon session ${session.salonId} :`, err.message);
          });
          deletedChannels++;
        }
      }
      if (session.eventId && session.guildId) {
        const guild = await client.guilds.fetch(session.guildId).catch(() => null);
        if (guild) {
          const event = await guild.scheduledEvents.fetch(session.eventId).catch(() => null);
          if (event) {
            await event.delete().catch(() => null);
            deletedEvents++;
          }
        }
      }
      supprimerSession(messageId);
      deletedSessions++;
    }

    await interaction.editReply({
      content:
        `✅ Nettoyage terminé : ${deletedChannels} salon(s) supprimé(s), ` +
        `${deletedEvents} événement(s) supprimé(s), ${deletedDefis} défi(s) supprimé(s), ` +
        `${deletedSessions} session(s) supprimée(s).`,
    });
  } catch (err) {
    console.error('❌ Erreur cleanup :', err);
    await interaction.editReply({ content: '❌ Une erreur est survenue lors du nettoyage.' });
  }
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
