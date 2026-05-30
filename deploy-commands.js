// ========================================
// 📡 DEPLOY COMMANDS — JarlBot V1.1
// Enregistre les commandes slash sur ton serveur Discord
// Lance avec : node deploy-commands.js
// ========================================

require('dotenv').config();
const {
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');

// ========================================
// 📋 Définition des commandes
// ========================================

const commands = [

  // ----------------------------------------
  // 🏓 /ping — Test de connexion du bot
  // ----------------------------------------
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Vérifie que le bot répond bien'),

  // ----------------------------------------
  // ⚔️ /defi — Lancer un défi entre équipes
  // ----------------------------------------
  new SlashCommandBuilder()
    .setName('defi')
    .setDescription('Lance un défi contre une autre équipe')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Type de match')
        .setRequired(true)
        .addChoices(
          { name: '🎮 Mix',   value: 'mix' },
          { name: '⚔️ Scrim', value: 'scrim' },
          { name: '🎯 Free',  value: 'free' },
        )
    )
    .addIntegerOption(option =>
      option.setName('nombre-matchs')
        .setDescription('Nombre de matchs à jouer (1 match ≈ 40 min)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(10)
    )
    .addRoleOption(option =>
      option.setName('mon-equipe')
        .setDescription('Ton équipe (tu dois avoir ce rôle)')
        .setRequired(true)
    )
    .addRoleOption(option =>
      option.setName('adversaire')
        .setDescription('Équipe que tu défies')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('date')
        .setDescription('Date du match (format : JJ/MM/AAAA — ex: 25/12/2025)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('heure')
        .setDescription('Heure du match (format : HH:MM — ex: 20:30)')
        .setRequired(true)
    ),

  // ----------------------------------------
  // 🎮 /session — Proposer une session spéciale
  // ----------------------------------------
  new SlashCommandBuilder()
    .setName('session')
    .setDescription('Propose une session spéciale (admin uniquement)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Type de session')
        .setRequired(true)
        .addChoices(
          { name: '🌙 Nocturne',           value: 'Nocturne' },
          { name: '☀️ Matinale',           value: 'Matinale' },
          { name: '🎉 Événement spécial',  value: 'Événement spécial' },
        )
    )
    .addIntegerOption(option =>
      option.setName('joueurs')
        .setDescription('Nombre de joueurs requis pour lancer la session')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(50)
    )
    .addStringOption(option =>
      option.setName('date')
        .setDescription('Date de la session (format : JJ/MM/AAAA — ex: 25/12/2025)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('heure')
        .setDescription('Heure de la session (format : HH:MM — ex: 22:00)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('description')
        .setDescription('Infos complémentaires (optionnel)')
        .setRequired(false)
    ),

].map(cmd => cmd.toJSON());

// ========================================
// 🚀 Envoi des commandes à Discord
// ========================================

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('🔄 Enregistrement des commandes slash...');

    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );

    console.log(`✅ ${commands.length} commande(s) enregistrée(s) avec succès !`);
  } catch (error) {
    console.error('❌ Erreur lors de l\'enregistrement :', error);
  }
})();
