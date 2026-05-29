// ========================================
// 🤖 JarlBot — V1.0
// Bot de gestion de défis d'équipes
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
} = require('discord.js');
const schedule = require('node-schedule');
const config = require('./config');
const { sauverDefi, getDefi, supprimerDefi, lireDefis } = require('./utils/storage');

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
// 🛠️ Utilitaires
// ========================================

/** Convertit "JJ/MM/AAAA" + "HH:MM" en objet Date */
function parseDateHeure(date, heure) {
  const [jour, mois, annee] = date.split('/').map(Number);
  const [h, m] = heure.split(':').map(Number);
  return new Date(annee, mois - 1, jour, h, m, 0);
}

/** Récupère le nom d'un rôle à partir de son ID */
function getNomRole(guild, roleId, fallback = 'Équipe') {
  const role = guild.roles.cache.get(roleId);
  return role ? role.name : fallback;
}

/** Nettoie un nom pour qu'il soit utilisable dans un nom de salon Discord */
function nettoyerNomPourSalon(nom) {
  return nom
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // enlève les accents
    .replace(/[^a-z0-9]+/g, '-') // remplace tout caractère spécial par -
    .replace(/^-+|-+$/g, ''); // supprime les - en début/fin
}

/** Génère le nom du salon privé : type-equipe1-vs-equipe2-date */
function genererNomSalon(defi, guild) {
  const nomEquipe1 = nettoyerNomPourSalon(getNomRole(guild, defi.monEquipeId, 'equipe1'));
  const nomEquipe2 = nettoyerNomPourSalon(getNomRole(guild, defi.adversaireId, 'equipe2'));
  const dateFormatee = defi.date.replace(/\//g, '-');
  return `${defi.type}-${nomEquipe1}-vs-${nomEquipe2}-${dateFormatee}`;
}

// ========================================
// ⏰ Planification des tâches (rappels + nettoyage)
// ========================================

function programmerTachesDefi(messageId, defi) {
  const dateMatch = parseDateHeure(defi.date, defi.heure);
  const maintenant = new Date();

  planifier(
    `rappel_mp_${messageId}`,
    new Date(dateMatch.getTime() - config.RAPPEL_MP_AVANT_MATCH),
    maintenant,
    () => envoyerRappelMP(messageId)
  );

  planifier(
    `rappel24h_${messageId}`,
    new Date(dateMatch.getTime() - config.RAPPEL_24H_AVANT_MATCH),
    maintenant,
    () => envoyerRappelSalon(messageId, config.MESSAGES.RAPPEL_24H)
  );

  planifier(
    `rappel1h_${messageId}`,
    new Date(dateMatch.getTime() - config.RAPPEL_1H_AVANT_MATCH),
    maintenant,
    () => envoyerRappelSalon(messageId, config.MESSAGES.RAPPEL_1H)
  );

  planifier(
    `nettoyage_${messageId}`,
    new Date(dateMatch.getTime() + config.DELAI_SUPPRESSION_SALON),
    maintenant,
    () => nettoyerDefi(messageId)
  );
}

function planifier(nom, date, maintenant, callback) {
  if (date > maintenant) {
    schedule.scheduleJob(nom, date, callback);
  }
}

// ========================================
// 📬 Envoi des rappels
// ========================================

async function envoyerRappelSalon(messageId, texte) {
  const defi = getDefi(messageId);
  if (!defi || !defi.salonId) return;

  try {
    const salon = await client.channels.fetch(defi.salonId);
    if (!salon) return;

    await salon.send(
      `${texte}\n` +
      `<@&${defi.monEquipeId}> vs <@&${defi.adversaireId}>\n` +
      `📅 ${defi.date} à ${defi.heure} (${defi.type})`
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
      try {
        await user.send(config.MESSAGES.RAPPEL_MP(defi));
      } catch {
        console.log(`⚠️ Impossible d'envoyer un MP à ${user.tag} (MP fermés ?)`);
      }
    }
  } catch (err) {
    console.error('❌ Erreur envoi rappel MP :', err);
  }
}

// ========================================
// 🧹 Nettoyage d'un défi terminé
// ========================================

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
// 🔄 Reprogrammer les tâches au démarrage
// ========================================

function reprogrammerTaches() {
  const defis = lireDefis();
  let count = 0;
  for (const [messageId, defi] of Object.entries(defis)) {
    if (defi.valide) {
      programmerTachesDefi(messageId, defi);
      count++;
    }
  }
  if (count > 0) console.log(`🔄 ${count} tâche(s) reprogrammée(s).`);
}

// ========================================
// 🎯 Validation d'un défi
// ========================================

async function validerDefi(message, defi) {
  const guild = message.guild;
  defi.valide = true;

  try {
    // 1. Créer le salon privé
    const salon = await creerSalonPrive(guild, defi);
    defi.salonId = salon.id;

    // 2. Envoyer le message de bienvenue + réaction ⏰
    const messageBienvenue = await salon.send(config.MESSAGES.BIENVENUE_SALON_PRIVE(defi));
    await messageBienvenue.react(config.EMOJI_RAPPEL_MP);
    defi.messageBienvenueId = messageBienvenue.id;

    // 3. Créer l'événement Discord
    const event = await creerEventDiscord(guild, defi, salon.name);
    defi.eventId = event.id;

    // 4. Sauvegarder les nouvelles infos
    sauverDefi(message.id, defi);

    // 5. Programmer les rappels + nettoyage
    programmerTachesDefi(message.id, defi);

    // 6. Annoncer dans le salon d'origine
    await message.reply(config.MESSAGES.DEFI_ACCEPTE_REPLY(defi, salon.id));
  } catch (err) {
    console.error('❌ Erreur validation défi :', err);
    await message.reply(config.MESSAGES.ERREUR_VALIDATION);
  }
}

/** Crée un salon privé visible uniquement par les deux équipes */
async function creerSalonPrive(guild, defi) {
  return guild.channels.create({
    name: genererNomSalon(defi, guild),
    type: ChannelType.GuildText,
    parent: process.env.CATEGORIE_DEFIS_ID,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: defi.monEquipeId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      },
      {
        id: defi.adversaireId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      },
    ],
  });
}

/** Crée l'événement Discord (calendrier natif) */
async function creerEventDiscord(guild, defi, nomSalon) {
  const dateMatch = parseDateHeure(defi.date, defi.heure);
  const dateFin = new Date(dateMatch.getTime() + defi.nombreMatchs * config.DUREE_UN_MATCH);

  const nomMonEquipe = getNomRole(guild, defi.monEquipeId, 'Équipe 1');
  const nomAdversaire = getNomRole(guild, defi.adversaireId, 'Équipe 2');

  // Titre et description construits directement ici (pas via config)
  const titre = `${nomMonEquipe} vs ${nomAdversaire} (${defi.type})`;
  const description =
    `🎮 Défi entre ${nomMonEquipe} et ${nomAdversaire}\n` +
    `🆚 Type : ${defi.type}\n` +
    `⚔️ Nombre de matchs : ${defi.nombreMatchs}\n` +
    `📅 Date : ${defi.date} à ${defi.heure}`;

  return guild.scheduledEvents.create({
    name: titre,
    scheduledStartTime: dateMatch,
    scheduledEndTime: dateFin,
    privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
    entityType: GuildScheduledEventEntityType.External,
    entityMetadata: { location: `Salon #${nomSalon}` },
    description: description,
  });
}

// ========================================
// 🚀 Démarrage du bot
// ========================================

client.once('ready', () => {
  console.log(`✅ Bot connecté en tant que ${client.user.tag} !`);
  reprogrammerTaches();
});

// ========================================
// ⚡ Commandes slash
// ========================================

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    await interaction.reply('Pong ! 🏓');
    return;
  }

  if (interaction.commandName === 'defi') {
    await gererCommandeDefi(interaction);
  }
});

/** Gère la commande /defi */
async function gererCommandeDefi(interaction) {
  const type = interaction.options.getString('type');
  const monEquipe = interaction.options.getRole('mon-equipe');
  const adversaire = interaction.options.getRole('adversaire');
  const date = interaction.options.getString('date');
  const heure = interaction.options.getString('heure');
  const nombreMatchs = interaction.options.getInteger('nombre-matchs');

  // Validations
  if (!interaction.member.roles.cache.has(monEquipe.id)) {
    return interaction.reply({ content: config.MESSAGES.ERREUR_PAS_LE_ROLE(monEquipe), ephemeral: true });
  }
  if (monEquipe.id === adversaire.id) {
    return interaction.reply({ content: config.MESSAGES.ERREUR_AUTO_DEFI, ephemeral: true });
  }
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
    return interaction.reply({ content: config.MESSAGES.ERREUR_FORMAT_DATE, ephemeral: true });
  }
  if (!/^\d{2}:\d{2}$/.test(heure)) {
    return interaction.reply({ content: config.MESSAGES.ERREUR_FORMAT_HEURE, ephemeral: true });
  }
  if (parseDateHeure(date, heure) <= new Date()) {
    return interaction.reply({ content: config.MESSAGES.ERREUR_DATE_PASSEE, ephemeral: true });
  }

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

  await interaction.reply({
    content: config.MESSAGES.NOUVEAU_DEFI(defi, monEquipe, adversaire),
  });

  const message = await interaction.fetchReply();
  await message.react(config.EMOJI_ACCEPTER);
  await message.react(config.EMOJI_REFUSER);

  sauverDefi(message.id, defi);
}

// ========================================
// 👍 Gestion des réactions (votes)
// ========================================

client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;

  if (reaction.partial) {
    try { await reaction.fetch(); } catch { return; }
  }

  const defi = getDefi(reaction.message.id);
  if (!defi || defi.valide) return;

  const guild = reaction.message.guild;
  const membre = await guild.members.fetch(user.id).catch(() => null);
  if (!membre) return;

  const emoji = reaction.emoji.name;

  if (emoji !== config.EMOJI_ACCEPTER && emoji !== config.EMOJI_REFUSER) {
    await reaction.users.remove(user.id).catch(() => {});
    return;
  }

  if (!membre.roles.cache.has(defi.adversaireId)) {
    await reaction.users.remove(user.id).catch(() => {});
    try { await user.send(config.MESSAGES.ERREUR_PAS_VOTANT); } catch {}
    return;
  }

  if (emoji === config.EMOJI_ACCEPTER) {
    const votesValides = await compterVotesValides(reaction, guild, defi.adversaireId);
    console.log(`🗳️ Défi ${reaction.message.id} : ${votesValides}/${config.SEUIL_VALIDATION} votes valides`);

    if (votesValides >= config.SEUIL_VALIDATION) {
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
// 🔑 Connexion
// ========================================
client.login(process.env.DISCORD_TOKEN);
