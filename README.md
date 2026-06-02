# JarlBot

Bot Discord open source pour organiser des matchs EVA, ouvrir des sessions communautaires et consulter les données compétitives EVA depuis un cache local.

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D24-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![discord.js](https://img.shields.io/badge/discord.js-v14-5865F2?logo=discord&logoColor=white)](https://discord.js.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Aperçu

JarlBot aide une communauté EVA à gérer les rendez-vous directement depuis Discord :

- Organisation de matchs avec `/mix`, `/scrim` et `/free`.
- Sessions communautaires administrées avec `/session`.
- Salons privés créés automatiquement quand une proposition est validée.
- Événements Discord, rappels, annulation confirmée et nettoyage automatique.
- Statistiques EVA, classements, tops et tournois via un cache SQLite local.
- Launcher web local pour configurer, lancer, arrêter et surveiller le bot.

## Installation rapide

Choisis le guide adapté à ta machine :

- [Installation Windows](INSTALLATION-WINDOWS.md)
- [Installation Linux](INSTALLATION-LINUX.md)

Version courte :

```bash
git clone https://github.com/Gavr0che50/JarlBot.git
cd JarlBot
npm install
cp .env.example .env
npm run deploy-commands
npm start
```

Sous Windows, remplace `cp .env.example .env` par :

```powershell
copy .env.example .env
```

Le fichier `.env` doit au minimum contenir :

```env
DISCORD_TOKEN=ton-token-discord
CLIENT_ID=id-application-discord
GUILD_ID=id-serveur-discord
CATEGORIE_DEFIS_ID=id-categorie-salons
JARLBOT_MODE=prod
```

## Commandes Discord

Les commandes disponibles sont documentées ici : [COMMANDES.md](COMMANDES.md).

Résumé :

| Commande | Usage |
| --- | --- |
| `/help` | Affiche l'aide dans Discord. |
| `/ping` | Vérifie que le bot répond. |
| `/mix` | Propose un match mix entre deux équipes. |
| `/scrim` | Propose un scrim entre deux équipes. |
| `/free` | Propose une session ouverte à plusieurs joueurs. |
| `/renfort` | Invite un joueur dans un salon privé. |
| `/session` | Crée une session spéciale réservée aux administrateurs. |
| `/stat`, `/stat-equipe` | Affichent les statistiques EVA. |
| `/classement`, `/top`, `/top-equipe`, `/tournoi` | Consultent les données compétitives EVA. |
| `/planning` | Affiche les rencontres et sessions prévues. |

## Fonctionnement des matchs

Pour `/mix` et `/scrim`, le joueur doit posséder le rôle Discord indiqué dans `mon-equipe`. Le bot publie une proposition, puis attend les réactions de l'équipe adverse :

- réaction positive : acceptation ;
- réaction négative : refus ;
- en production, seuls les membres du rôle adverse sont comptés ;
- le seuil varie de 1 à 4 votes selon la taille du rôle adverse ;
- en mode test, un seul vote suffit.

Quand le match est validé, JarlBot crée :

- un salon texte privé dans la catégorie configurée ;
- un événement Discord externe ;
- un message de bienvenue ;
- une réaction de rappel privé ;
- un bouton d'annulation avec confirmation au second clic.

## Frees et sessions

`/free` crée une proposition ouverte. L'auteur est inscrit automatiquement, puis les joueurs rejoignent avec la réaction positive. Le salon privé est créé quand le quota est atteint.

`/session` est réservée aux administrateurs. Les types proposés sont `Nocturne`, `Matinale` et `Événement spécial`. Les joueurs utilisent les boutons `Je participe` et `Me retirer`; le salon privé apparaît quand la session est complète.

## Cache EVA

JarlBot utilise `node:sqlite`, l'API Competitive EVA et le GraphQL public d'app.eva.gg. Les données EVA sont stockées dans `eva-cache.db`, ignoré par Git.

Le cache contient notamment :

- villes et salles EVA ;
- équipes et rosters compétitifs ;
- statistiques joueurs et équipes ;
- classements locaux ;
- tournois EVA.

Commandes utiles :

```bash
npm run eva-refresh
npm run eva-refresh:full
npm run eva-refresh:reset
```

Au premier lancement sans `eva-cache.db`, l'import initial peut prendre du temps. Les commandes EVA indiquent qu'une mise à jour est en cours jusqu'à ce que le cache soit prêt.

## Launcher local

Le launcher démarre une interface web locale, par défaut sur `http://localhost:3050`.

```bash
npm run launcher
```

Il permet de :

- vérifier la configuration ;
- modifier `.env` depuis une interface locale ;
- lancer ou arrêter le bot ;
- déployer les slash commands ;
- suivre les logs ;
- déclencher un refresh EVA.

Sous Windows, tu peux aussi lancer `JarlBot Launcher.cmd`. Sous Linux, tu peux utiliser `./launcher.sh`.

## Scripts npm

| Script | Description |
| --- | --- |
| `npm start` | Lance le bot. |
| `npm run launcher` | Lance le launcher web local. |
| `npm run deploy-commands` | Enregistre les slash commands sur le serveur Discord configuré. |
| `npm run eva-refresh` | Met à jour le cache EVA. |
| `npm run eva-refresh:full` | Force un refresh EVA plus complet. |
| `npm run eva-refresh:reset` | Supprime puis reconstruit le cache EVA. |
| `npm run check` | Vérifie la syntaxe des fichiers JavaScript. |
| `npm test` | Lance la vérification de syntaxe. |

## Structure du projet

```text
JarlBot/
|-- README.md
|-- COMMANDES.md
|-- INSTALLATION-WINDOWS.md
|-- INSTALLATION-LINUX.md
|-- troubleshoot.md
|-- package.json
|-- config.js
|-- deploy-commands.js
|-- index.js
|-- JarlBot Launcher.cmd
|-- launcher.sh
|-- scripts/
|   |-- launcher.js
|   `-- eva-refresh.js
`-- utils/
    |-- eva-v2.js
    `-- storage.js
```

Fichiers locaux ignorés par Git :

- `.env` : secrets et configuration locale ;
- `bot-state.db` : défis et sessions programmés ;
- `eva-cache.db` : cache EVA ;
- `logs/` : logs du launcher, du bot et des refreshs ;
- `node_modules/` et `dist/`.

## Dépannage

Consulte [troubleshoot.md](troubleshoot.md) pour les erreurs courantes : token invalide, intents Discord, permissions, slash commands absentes, cache EVA, port du launcher, version Node.js.

## Licence

MIT. Voir [LICENSE](LICENSE).
