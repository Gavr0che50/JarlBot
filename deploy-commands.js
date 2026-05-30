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
  // 🎮 /mix — Lancer un match mix
  // ----------------------------------------
  new SlashCommandBuilder()
    .setName('mix')
    .setDescription('Lance un match mix sur le serveur')
    .addIntegerOption(option =>
      option.setName('nombre-matchs')
        .setDescription('Nombre de matchs à jouer (1 match ≈ 40 min)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(10)
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
    )
    .addRoleOption(option =>
      option.setName('mon-equipe')
        .setDescription('Ton équipe (requis pour mix)')
        .setRequired(true)
    )
    .addRoleOption(option =>
      option.setName('adversaire')
        .setDescription('Équipe que tu défies (requis pour mix)')
        .setRequired(true)
    ),

  // ----------------------------------------
  // ⚔️ /scrim — Lancer un scrim
  // ----------------------------------------
  new SlashCommandBuilder()
    .setName('scrim')
    .setDescription('Lance un scrim sur le serveur')
    .addIntegerOption(option =>
      option.setName('nombre-matchs')
        .setDescription('Nombre de matchs à jouer (1 match ≈ 40 min)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(10)
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
    )
    .addRoleOption(option =>
      option.setName('mon-equipe')
        .setDescription('Ton équipe (requis pour scrim)')
        .setRequired(true)
    )
    .addRoleOption(option =>
      option.setName('adversaire')
        .setDescription('Équipe que tu défies (requis pour scrim)')
        .setRequired(true)
    ),

  // ----------------------------------------
  // 🎯 /free — Lancer un free ouvert à tous
  // ----------------------------------------
  new SlashCommandBuilder()
    .setName('free')
    .setDescription('Lance un free ouvert à tous')
    .addIntegerOption(option =>
      option.setName('nombre-joueurs')
        .setDescription('Nombre de joueurs pour le free (2–10)')
        .setRequired(true)
        .setMinValue(2)
        .setMaxValue(10)
    )
    .addStringOption(option =>
      option.setName('date')
        .setDescription('Date du free (format : JJ/MM/AAAA — ex: 25/12/2025)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('heure')
        .setDescription('Heure du free (format : HH:MM — ex: 20:30)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('niveau-attendu')
        .setDescription('Niveau attendu pour un free')
        .setRequired(false)
        .addChoices(
          { name: 'Débutant', value: 'Débutant' },
          { name: 'Intermédiaire', value: 'Intermédiaire' },
          { name: 'Confirmé', value: 'Confirmé' },
        )
    ),

  // ----------------------------------------
  // 🛡️ /renfort — Ajouter un joueur invité à un salon privé
  // ----------------------------------------
  new SlashCommandBuilder()
    .setName('renfort')
    .setDescription('Invite un joueur ou plusieurs dans un salon privé')
    .addUserOption(option =>
      option.setName('joueur1')
        .setDescription('Premier joueur à inviter')
        .setRequired(true)
    )
    .addUserOption(option =>
      option.setName('joueur2')
        .setDescription('Deuxième joueur à inviter')
        .setRequired(false)
    )
    .addUserOption(option =>
      option.setName('joueur3')
        .setDescription('Troisième joueur à inviter')
        .setRequired(false)
    ),

  // ----------------------------------------
  // 📊 /resultat — Consulter son bilan wins/loses
  // ----------------------------------------
  new SlashCommandBuilder()
    .setName('resultat')
    .setDescription('Consulte ton bilan de victoires/défaites (hors tournoi)')
    .addUserOption(option =>
      option.setName('joueur')
        .setDescription('Consulter le bilan d\'un autre joueur (optionnel)')
        .setRequired(false)
    ),

  // ----------------------------------------
  // 🗓️ /planning — Liste les événements à venir (7 jours)
  // ----------------------------------------
  new SlashCommandBuilder()
    .setName('planning')
    .setDescription('Liste les matchs / événements à venir (7 jours)'),

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
];

commands.push(
  new SlashCommandBuilder()
    .setName('cleanup')
    .setDescription('Attention, supprime l\'intégralité des salons et des événements')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
);

module.exports = commands.map(cmd => cmd.toJSON());

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
