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
  sauverSession, getSession, supprimerSession,
} = require('./utils/storage');

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

client.once('ready', () => {
  console.log(`✅ Bot connecté en tant que ${client.user.tag} !`);
  reprogrammerTaches();
});

// ========================================
// ⚡ Routeur d'interactions
// ========================================

client.on('interactionCreate', async (interaction) => {
  try {
    // --- Commandes slash ---
    if (interaction.isChatInputCommand()) {
      switch (interaction.commandName) {
        case 'ping':    return interaction.reply('Pong ! 🏓');
        case 'defi':    return gererCommandeDefi(interaction);
        case 'session': return gererCommandeSession(interaction);
      }
    }

    // --- Boutons ---
    if (interaction.isButton()) {
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
      await interaction.reply({ content: '❌ Une erreur est survenue.', ephemeral: true }).catch(() => {});
    }
  }
});

// ========================================
// ⚔️ COMMANDE /defi
// ========================================

async function gererCommandeDefi(interaction) {
  const type = interaction.options.getString('type');
  const monEquipe = interaction.options.getRole('mon-equipe');
  const adversaire = interaction.options.getRole('adversaire');
  const date = interaction.options.getString('date');
  const heure = interaction.options.getString('heure');
  const nombreMatchs = interaction.options.getInteger('nombre-matchs');

  // Validations
  if (!interaction.member.roles.cache.has(monEquipe.id))
    return interaction.reply({ content: config.MESSAGES.ERREUR_PAS_LE_ROLE(monEquipe), ephemeral: true });

  if (monEquipe.id === adversaire.id)
    return interaction.reply({ content: config.MESSAGES.ERREUR_AUTO_DEFI, ephemeral: true });

  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(date))
    return interaction.reply({ content: config.MESSAGES.ERREUR_FORMAT_DATE, ephemeral: true });

  if (!/^\d{2}:\d{2}$/.test(heure))
    return interaction.reply({ content: config.MESSAGES.ERREUR_FORMAT_HEURE, ephemeral: true });

  if (parseDateHeure(date, heure) <= new Date())
    return interaction.reply({ content: config.MESSAGES.ERREUR_DATE_PASSEE, ephemeral: true });

  // Crée le défi
  const defi = {
    type,
    nombreMatchs,
    monEquipeId: monEquipe.id,
    adversaireId: adversaire.id,
    date,
    heure,
    auteurId: interaction.user.id,
    guildId: interaction.guild.id,
    channelId: interaction.channel.id,
    valide: false,
  };

  await interaction.reply(
    `${config.MESSAGES.NOUVEAU_DEFI(defi, monEquipe, adversaire)}\n` +
    `<@&${adversaire.id}> → réagissez avec ${config.EMOJI_ACCEPTER} pour accepter !`
  );
  const message = await interaction.fetchReply();

  await message.react(config.EMOJI_ACCEPTER);
  await message.react(config.EMOJI_REFUSER);

  sauverDefi(message.id, defi);
}

// ========================================
// 🗳️ Réactions sur les défis
// ========================================

client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => null);

  const defi = getDefi(reaction.message.id);
  if (!defi || defi.valide) return;

  const guild = reaction.message.guild;
  const emoji = reaction.emoji.name;

  if (emoji === config.EMOJI_ACCEPTER) {
    const votes = await compterVotesValides(reaction, guild, defi.adversaireId);
    console.log(`🗳️ Défi ${reaction.message.id} : ${votes}/${config.SEUIL_VALIDATION} votes valides`);

    if (votes >= config.SEUIL_VALIDATION) {
      await validerDefi(reaction.message, defi);
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
    const m = await guild.members.fetch(u.id).catch(() => null);
    if (m && m.roles.cache.has(roleId)) count++;
  }
  return count;
}

// ========================================
// ✅ Validation d'un défi
// ========================================

async function validerDefi(message, defi) {
  const guild = message.guild;
  defi.valide = true;

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
  return guild.channels.create({
    name: genererNomSalon(defi, guild),
    type: ChannelType.GuildText,
    parent: process.env.CATEGORIE_DEFIS_ID,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: defi.monEquipeId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      { id: defi.adversaireId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
    ],
  });
}

async function creerSalonPriveSession(guild, session) {
  const permissionsParticipants = session.participants.map(userId => ({
    id: userId,
    allow: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
    ],
  }));

  return guild.channels.create({
    name: genererNomSalonSession(session),
    type: ChannelType.GuildText,

    // On peut réutiliser la catégorie "Défis" pour le moment
    parent: process.env.CATEGORIE_DEFIS_ID,

    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      ...permissionsParticipants,
    ],
  });
}


async function creerEventDiscord(guild, defi, nomSalon) {
  const dateMatch = parseDateHeure(defi.date, defi.heure);
  const dateFin = new Date(dateMatch.getTime() + defi.nombreMatchs * config.DUREE_UN_MATCH);

  const nomMonEquipe = getNomRole(guild, defi.monEquipeId, 'Équipe 1');
  const nomAdversaire = getNomRole(guild, defi.adversaireId, 'Équipe 2');

  return guild.scheduledEvents.create({
    name: `${nomMonEquipe} vs ${nomAdversaire} (${defi.type})`,
    scheduledStartTime: dateMatch,
    scheduledEndTime: dateFin,
    privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
    entityType: GuildScheduledEventEntityType.External,
    entityMetadata: { location: `Salon #${nomSalon}` },
    description:
      `🎮 Défi entre ${nomMonEquipe} et ${nomAdversaire}\n` +
      `🆚 Type : ${defi.type}\n` +
      `⚔️ Nombre de matchs : ${defi.nombreMatchs}\n` +
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
    await salon.send(
      `${texte}\n<@&${defi.monEquipeId}> vs <@&${defi.adversaireId}>\n📅 ${defi.date} à ${defi.heure} (${defi.type})`
    );
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
    return interaction.reply({ content: config.MESSAGES.ERREUR_FORMAT_DATE, ephemeral: true });
  if (!/^\d{2}:\d{2}$/.test(heure))
    return interaction.reply({ content: config.MESSAGES.ERREUR_FORMAT_HEURE, ephemeral: true });
  if (parseDateHeure(date, heure) <= new Date())
    return interaction.reply({ content: config.MESSAGES.ERREUR_DATE_PASSEE, ephemeral: true });

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
  const message = await interaction.reply({ embeds: [embed], components, fetchReply: true });

  sauverSession(message.id, session);
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
    return interaction.reply({ content: config.MESSAGES.SESSION_INTROUVABLE, ephemeral: true });
  if (session.lancee)
    return interaction.reply({ content: '⚠️ Cette session est déjà lancée.', ephemeral: true });

  const userId = interaction.user.id;

  if (interaction.customId === config.BUTTON_ID_REJOINDRE) {
    if (session.participants.includes(userId))
      return interaction.reply({ content: config.MESSAGES.SESSION_DEJA_INSCRIT, ephemeral: true });
    session.participants.push(userId);
  } else if (interaction.customId === config.BUTTON_ID_QUITTER) {
    if (!session.participants.includes(userId))
      return interaction.reply({ content: config.MESSAGES.SESSION_PAS_INSCRIT, ephemeral: true });
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

    return interaction.reply({
      content: '❌ Impossible de créer le salon privé de session.',
      ephemeral: true,
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
    new Date(dateSession.getTime() - config.RAPPEL_MP_AVANT_MATCH),
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
