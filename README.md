# JarlBot

Bot Discord open source pour organiser des matchs EVA, ouvrir des sessions communautaires et consulter les donnees competitives EVA depuis un cache local.

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D24-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![discord.js](https://img.shields.io/badge/discord.js-v14-5865F2?logo=discord&logoColor=white)](https://discord.js.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Apercu

JarlBot aide une communaute EVA Discord a gerer :

- les propositions de matchs avec `/mix`, `/scrim` et `/free` ;
- les sessions communautaires avec `/session` ;
- les salons prives, evenements Discord, rappels, annulations et nettoyages automatiques ;
- les statistiques EVA, classements, tops et tournois via un cache SQLite local ;
- les badges/logos EVA dans les embeds de statistiques, equipes, classements et tournois ;
- un launcher web local pour configurer, lancer et surveiller le bot.

## Installation

Guides complets :

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

## Commandes

La reference complete est dans [COMMANDES.md](COMMANDES.md).

| Commande | Usage |
| --- | --- |
| `/help` | Affiche l'aide dans Discord. |
| `/ping` | Verifie que le bot repond. |
| `/mix` | Propose un match mix entre deux equipes. |
| `/scrim` | Propose un scrim entre deux equipes. |
| `/free` | Propose une session ouverte a plusieurs joueurs. |
| `/renfort` | Invite un joueur dans un salon prive. |
| `/session` | Cree une session communautaire reservee aux administrateurs. |
| `/stat` | Affiche les stats EVA d'un joueur public, avec badge d'equipe si disponible. |
| `/stat-equipe` | Affiche les stats d'une equipe EVA avec son badge. |
| `/classement` | Affiche un classement local avec badge de salle/league si disponible. |
| `/top` | Affiche le top joueurs major league. |
| `/top-equipe` | Affiche le top equipes major league avec badge. |
| `/tournoi` | Affiche les prochains tournois locaux pour un site ou une ville. |
| `/planning` | Affiche les rencontres et sessions prevues. |

## Fonctionnement des matchs

Pour `/mix` et `/scrim`, l'auteur doit posseder le role Discord indique dans `mon-equipe`. Le bot publie une proposition, puis l'equipe adverse vote avec les reactions :

- reaction positive : accepte le match ;
- reaction negative : refuse le match.

En production, seuls les membres du role adverse sont comptes. Le seuil depend de la taille du role adverse, de 1 a 4 votes.

Quand le match est valide, le bot cree :

- un salon prive dans la categorie `CATEGORIE_DEFIS_ID` ;
- un evenement Discord ;
- un message de bienvenue ;
- des rappels automatiques ;
- un bouton d'annulation.

`/free` fonctionne avec un quota de joueurs. Les participants rejoignent avec reaction, et le salon prive est cree quand le quota est atteint.

## Sessions

`/session` est reservee aux administrateurs. Les types proposes sont `Nocturne`, `Matinale` et `Evenement special`.

Les joueurs utilisent les boutons `Je participe` et `Me retirer`. Quand la session est complete, JarlBot cree le salon prive, poste le message de bienvenue et planifie les rappels.

## Cache EVA

JarlBot utilise `node:sqlite`, l'API Competitive EVA et le GraphQL EVA public.

Le cache `eva-cache.db` contient notamment :

- villes et salles EVA ;
- equipes, rosters et badges competitifs ;
- statistiques joueurs et equipes ;
- classements locaux et badges de salles/leagues ;
- tournois EVA et badges associes quand EVA les expose.

Commandes utiles :

```bash
npm run eva-refresh
npm run eva-refresh:full
npm run eva-refresh:reset
```

Au premier lancement sans `eva-cache.db`, l'import initial peut prendre plusieurs minutes. Les commandes EVA indiquent qu'une mise a jour est en cours jusqu'a ce que le cache soit pret.

### Stats joueurs

`/stat` utilise les profils publics EVA. Le KDA affiche est celui de la saison en cours. Le total all-time est recupere aussi, mais sert surtout au nombre de matchs total affiche en complement.

La petite phrase de performance compare le joueur aux coequipiers dont les stats publiques sont disponibles. JarlBot hydrate les stats manquantes du roster avant de comparer, privilegie le KDA, puis compare les volumes au rythme par match pour eviter de recompenser ou tacler un joueur uniquement parce qu'il a plus ou moins joue.

Si un profil est prive ou introuvable cote API publique EVA, JarlBot affiche tout de meme une carte propre avec les informations competitives connues et le badge d'equipe quand il est disponible.

## Launcher local

Le launcher demarre une interface web locale, par defaut sur `http://127.0.0.1:4050`.

```bash
npm run launcher
```

Il permet de :

- verifier la configuration ;
- modifier `.env` depuis une interface locale ;
- lancer le bot ;
- deployer les slash commands ;
- suivre les logs ;
- declencher un refresh EVA.

Sous Windows, tu peux aussi lancer `JarlBot Launcher.cmd`. Sous Linux, tu peux utiliser `./launcher.sh`.

## Scripts npm

| Script | Description |
| --- | --- |
| `npm start` | Lance le bot. |
| `npm run launcher` | Lance le launcher local. |
| `npm run deploy-commands` | Deploie les slash commands Discord. |
| `npm run eva-refresh` | Met a jour le cache EVA. |
| `npm run eva-refresh:full` | Force un refresh EVA plus complet. |
| `npm run eva-refresh:reset` | Reconstruit le cache EVA. |
| `npm run check` | Verifie la syntaxe des fichiers JavaScript. |
| `npm test` | Lance les checks du projet. |

## Structure

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
|   |-- eva-refresh.js
|   `-- export-portable.js
`-- utils/
    |-- eva-v2.js
    `-- storage.js
```

Fichiers locaux ignores par Git :

- `.env` : secrets et configuration locale ;
- `bot-state.db` : defis et sessions programmes ;
- `eva-cache.db` : cache EVA ;
- `logs/` : logs du launcher, du bot et des refreshs ;
- `node_modules/` et `dist/`.

## Depannage

Consulte [troubleshoot.md](troubleshoot.md) pour les erreurs courantes : token invalide, intents Discord, permissions, slash commands absentes, cache EVA, profils EVA prives, port du launcher, version Node.js.

## Licence

MIT. Voir [LICENSE](LICENSE).
