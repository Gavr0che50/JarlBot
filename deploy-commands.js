require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  // Commande /ping
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Répond Pong !'),

  // Commande /defi
  new SlashCommandBuilder()
    .setName('defi')
    .setDescription('Lance un défi contre une autre équipe')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Type de match')
        .setRequired(true)
        .addChoices(
          { name: 'Mix', value: 'mix' },
          { name: 'Scrim', value: 'scrim' },
          { name: 'Free', value: 'free' }
        )
    )
      .addIntegerOption(option =>
    option.setName('nombre-matchs')
      .setDescription('Nombre de matchs à jouer (1 match = 40 min)')
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
        .setDescription('Date du match (ex: 25/12/2025)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('heure')
        .setDescription('Heure du match (ex: 20:30)')
        .setRequired(true)
    ),
].map(cmd => cmd.toJSON());

// === Envoi à Discord ===
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('🔄 Enregistrement des commandes slash...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('✅ Commandes enregistrées avec succès !');
  } catch (error) {
    console.error('❌ Erreur :', error);
  }
})();
