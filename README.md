# JarlBot V1.7.5 - Finale

JarlBot est un bot Discord open source pour organiser des matchs EVA, ouvrir des sessions communautaires et consulter des donnees EVA mises en cache localement.

Le README donne la vue d'ensemble du projet. Pour installer, configurer Discord, tester le bot ou regler une panne, utilise les guides dedies :

- [Installation Windows](INSTALLATION-WINDOWS.md)
- [Installation Linux](INSTALLATION-LINUX.md)

## Ce que fait le bot

JarlBot gere trois familles d'usage :

- Organisation de matchs : `/mix`, `/scrim` et `/free`.
- Sessions communautaires : `/session`, inscriptions par boutons et creation de salon quand le quota est atteint.
- Donnees EVA : stats joueurs, stats equipes, classements locaux, top major league et tournois locaux.

Les fonctionnalites ci-dessous ont ete reverifiees dans `deploy-commands.js`, `index.js`, `config.js`, `utils/eva-v2.js`, `utils/storage.js` et les scripts du dossier `scripts/`.

## Commandes Discord

| Commande | Role |
|---|---|
| `/help` | Affiche le guide rapide integre au bot. |
| `/ping` | Verifie que le bot repond. |
| `/mix` | Cree une proposition de match mix entre deux roles d'equipe. |
| `/scrim` | Cree une proposition de scrim entre deux roles d'equipe. |
| `/free` | Ouvre une session libre avec nombre de joueurs et niveau attendu. |
| `/renfort` | Donne acces a un joueur dans un salon prive de match ou de session. |
| `/session` | Propose une session speciale. Commande reservee aux administrateurs Discord. |
| `/planning` | Liste les evenements Discord a venir dans la fenetre configuree. |
| `/stat` | Affiche les stats EVA d'un joueur competitif public indexe. |
| `/stat-equipe` | Affiche salle, ligue, points, classement et roster d'une equipe EVA. |
| `/classement` | Affiche les classements locaux d'une ville ou salle EVA. |
| `/top` | Affiche le top joueurs de la major league avec KDA et tendance. |
| `/top-equipe` | Affiche le top equipes de la major league avec points, bilan et differentiel. |
| `/tournoi` | Affiche les prochains tournois locaux EVA d'un site et les rencontres publiees. |

Les commandes `/stat`, `/stat-equipe`, `/classement` et `/tournoi` utilisent l'autocompletion quand le cache EVA contient deja les donnees.

## Matchs et salons prives

Pour `/mix` et `/scrim`, l'utilisateur doit posseder le role indique dans `mon-equipe`. Le bot publie une proposition et attend les reactions de l'equipe adverse :

- reaction positive pour accepter ;
- reaction negative pour refuser ;
- en production, les votes sont comptes uniquement chez les membres du role adverse ;
- le seuil est de 1 a 4 votes selon le nombre de membres du role adverse ;
- en mode test, un seul vote suffit.

Une fois le match valide, JarlBot cree :

- un salon texte prive dans la categorie configuree ;
- un evenement Discord externe ;
- un message de bienvenue avec reaction horloge pour demander un rappel MP ;
- un bouton d'annulation qui demande une confirmation au second clic.

Les salons de match suivent le format `type-equipe1-vs-equipe2-date`. Les frees et sessions suivent le format `type-date-heure`.

## Frees et sessions

`/free` cree une proposition ouverte a plusieurs joueurs. L'auteur est ajoute automatiquement aux participants, puis les autres joueurs rejoignent par reaction positive. En production, le salon est cree quand le nombre demande est atteint. En mode test, un participant suffit.

`/session` est reservee aux administrateurs. Les types disponibles dans les slash commands sont `Nocturne`, `Matinale` et `Evenement special`. Les joueurs utilisent les boutons `Je participe` et `Me retirer`; le bot cree le salon prive quand le quota est atteint.

## Rappels et nettoyage

Les taches sont programmees avec `node-schedule` et les donnees de matchs/sessions sont conservees dans `bot-state.db`, ce qui permet de reprogrammer les taches au redemarrage.

Pour les matchs :

- rappel MP opt-in 48h avant via la reaction horloge ;
- rappel dans le salon 24h avant ;
- rappel dans le salon 1h avant ;
- suppression automatique du salon et de l'evenement 48h apres l'horaire.

Pour les sessions :

- rappel MP opt-in 48h avant via la reaction horloge ;
- duree d'evenement de 3h en production.

En mode test, ces delais sont raccourcis dans `config.js`.

## Cache EVA

Le moteur EVA utilise `node:sqlite`, l'API Competitive EVA et le GraphQL public d'app.eva.gg. Les donnees sont stockees dans `eva-cache.db`.

Le cache contient notamment :

- villes et salles EVA ;
- classements locaux ;
- equipes et rosters ;
- joueurs competitifs indexes ;
- stats publiques des joueurs major league ;
- stats d'equipes major league ;
- tournois locaux EVA et rencontres publiees.

Au demarrage, si `eva-cache.db` existe deja, JarlBot ne lance pas de refresh EVA immediat. Si la base n'existe pas, il lance un import initial complet. Ensuite, un refresh periodique tourne selon `EVA_V2_CACHE_TTL_MS`, 12h par defaut.

Pendant un import ou un refresh, les commandes EVA repondent rapidement qu'une mise a jour est en cours.

## Scripts npm

| Script | Role |
|---|---|
| `npm start` | Lance le bot Discord. |
| `npm run launcher` | Lance l'interface locale du launcher. |
| `npm run deploy-commands` | Enregistre les slash commands sur le serveur configure. |
| `npm run eva-refresh` | Force un refresh EVA manuel. |
| `npm run eva-refresh:full` | Force un refresh EVA complet. |
| `npm run eva-refresh:reset` | Vide les tables EVA puis reconstruit le cache. |
| `npm run export-portable` | Genere un dossier portable dans `dist/`. |
| `npm run pack:dist` | Genere un paquet npm `.tgz` dans `dist/`. |
| `npm test` | Execute les controles syntaxiques declares dans `npm run check`. |

## Configuration

`config.js` contient les constantes metier et les valeurs par defaut non sensibles : delais, limites d'affichage, couleurs, messages, endpoints EVA et mode de fonctionnement.

`.env` contient les secrets et les IDs propres a l'environnement : token Discord, application, serveur, categorie de salons, mode local et surcharges EVA. `.env` ne doit jamais etre partage ni commite.

## Structure

```text
JarlBot/
|-- README.md
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

Bases locales ignorees par Git :

- `bot-state.db` : defis et sessions programmes ;
- `eva-cache.db` : cache EVA ;
- `logs/` : logs du launcher, du bot et des refreshs.

## Licence

MIT. Voir [LICENSE](LICENSE).
