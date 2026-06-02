# Installation Windows de JarlBot

Ce guide couvre l'installation Windows, la configuration Discord, les tests de recette et les pannes courantes.

## 1. Prerequis

- Windows 10 ou 11.
- Node.js 24+ avec npm.
- Un serveur Discord ou tu peux ajouter un bot.
- Une categorie Discord qui recevra les salons prives.
- Des roles Discord pour les equipes si tu utilises `/mix` et `/scrim`.

Verifie Node.js dans PowerShell :

```powershell
node -v
npm -v
```

`node -v` doit afficher `v24.x` ou plus.

## 2. Creer l'application Discord

1. Ouvre <https://discord.com/developers/applications>.
2. Clique sur `New Application`, nomme l'application, puis ouvre-la.
3. Dans `Bot`, cree le bot si besoin.
4. Dans `Bot > Privileged Gateway Intents`, active :
   - `Server Members Intent`, requis pour compter les votes par role ;
   - `Message Content Intent`, conseille pour une configuration complete.
5. Copie le token du bot. Il ira dans `.env` sous `DISCORD_TOKEN`.
6. Dans `General Information`, copie l'Application ID. Il ira dans `.env` sous `CLIENT_ID`.

Ne partage jamais le token. En cas de fuite, utilise `Reset Token` dans le portail Discord.

## 3. Inviter le bot

Dans `OAuth2 > URL Generator` :

1. Coche les scopes `bot` et `applications.commands`.
2. Coche les permissions :
   - `Manage Channels`
   - `Manage Events`
   - `Send Messages`
   - `Read Message History`
   - `Add Reactions`
   - `Mention Everyone`
   - `View Channels`
3. Ouvre l'URL generee et invite le bot sur ton serveur.
4. Dans les roles du serveur, place le role du bot au-dessus des roles qu'il doit mentionner ou gerer.

## 4. Preparer le serveur Discord

1. Cree une categorie, par exemple `Matchs`.
2. Active le mode developpeur Discord.
3. Copie l'ID du serveur : `GUILD_ID`.
4. Copie l'ID de la categorie : `CATEGORIE_DEFIS_ID`.
5. Verifie que les joueurs ont le role de leur equipe.

En production, les votes de validation/refus de `/mix` et `/scrim` sont filtres sur le role adverse.

## 5. Installer JarlBot

### Option release

1. Telecharge la derniere release depuis GitHub, par exemple `v1.7.5`, puis l'archive `Source code (zip)`.
2. Extrais l'archive ou tu le souhaites, par exemple `C:\JarlBot`.
3. Double-clique sur `JarlBot Launcher.cmd`.
4. Renseigne les champs Discord.
5. Choisis `prod` ou `test`.
6. Clique sur `Sauvegarder et lancer`.

Le launcher installe les dependances si `node_modules` est absent, ecrit `.env`, enregistre les slash commands et lance le bot.

### Option portable

1. Decompresse le dossier `JarlBot-portable-...`.
2. Double-clique sur `JarlBot Launcher.cmd`.
3. Renseigne les champs Discord.
4. Choisis `prod` ou `test`.
5. Clique sur `Sauvegarder et lancer`.

Le launcher installe les dependances si `node_modules` est absent, ecrit `.env`, enregistre les slash commands et lance le bot.

### Option depot

Depuis PowerShell, dans le dossier du projet :

```powershell
npm install
copy .env.example .env
npm run deploy-commands
npm start
```

Tu peux aussi lancer l'interface locale :

```powershell
npm run launcher
```

Par defaut, elle ouvre `http://localhost:3050`. Si le port est pris, le launcher essaie les ports suivants.

## 6. Remplir `.env`

Variables essentielles :

```env
DISCORD_TOKEN=ton-token-discord
CLIENT_ID=id-application-discord
GUILD_ID=id-serveur-discord
CATEGORIE_DEFIS_ID=id-categorie-salons
JARLBOT_MODE=prod
```

Variables utiles du launcher :

```env
JARLBOT_LAUNCHER_PORT=3050
JARLBOT_LAUNCHER_NO_OPEN=0
```

Variables EVA par defaut :

```env
EVA_COMPETITIVE_API_BASE_URL=https://competitive.eva.gg/api
EVA_GRAPHQL_URL=https://api.eva.gg/graphql
EVA_LOCAL_LEAGUES_CIRCUIT_ID=2395738311350114303
EVA_MAJOR_TOURNAMENT_IDS=2385727403616917503
EVA_V2_CACHE_TTL_MS=43200000
EVA_V2_MIN_INTERVAL_MS=120
EVA_V2_HTTP_TIMEOUT_MS=10000
EVA_V2_TEAM_MEMBER_REFRESH_LIMIT=250
EVA_V2_TEAM_MEMBER_FULL_REFRESH_LIMIT=2000
EVA_V2_MAJOR_PLAYER_REFRESH_LIMIT=20
EVA_V2_MAJOR_PLAYER_FULL_REFRESH_LIMIT=100
EVA_V2_TOURNAMENT_MATCH_REFRESH_LIMIT=40
```

## 7. Mode test

`JARLBOT_MODE=test` simplifie la recette :

- un vote suffit pour accepter ou refuser un `/mix` ou `/scrim` ;
- un participant suffit pour lancer un `/free` ;
- une inscription suffit pour lancer une `/session` ;
- les rappels sont raccourcis ;
- le nettoyage automatique passe a 5 minutes apres l'horaire.

Repasse en `JARLBOT_MODE=prod` avant l'usage reel.

## 8. Verification apres installation

1. Lance le bot depuis le launcher ou avec `npm start`.
2. Lance `npm run deploy-commands` si tu n'utilises pas le launcher.
3. Dans Discord, teste `/ping`.
4. Mets le mode `test`, redemarre le bot, puis cree un `/mix` dans 3 a 5 minutes.
5. Reagis avec la coche pour verifier salon prive, evenement Discord et bouton d'annulation.
6. Reagis avec l'horloge dans le salon prive pour tester le rappel MP.
7. Cree un autre `/mix` et reagis avec la croix pour verifier le refus.
8. Teste `/free` et `/session`.
9. Teste `/stat`, `/stat-equipe`, `/classement`, `/top`, `/top-equipe` et `/tournoi`.
10. Repasse en mode `prod`.

Au premier lancement sans `eva-cache.db`, l'import EVA initial peut prendre du temps. Les commandes EVA indiquent qu'une mise a jour est en cours jusqu'a ce que la base soit prete.

## 9. Cache EVA

Precharger ou rafraichir le cache :

```powershell
npm run eva-refresh
```

Refresh complet :

```powershell
npm run eva-refresh:full
```

Reset complet du cache EVA :

```powershell
npm run eva-refresh:reset
```

`eva-cache.db` stocke les donnees EVA. Si le fichier existe au demarrage, JarlBot ne lance pas de refresh immediat et attend le cycle periodique.

## 10. Export portable

Depuis le poste source :

```powershell
npm run export-portable
```

L'export cree un dossier dans `dist/` avec le code, les scripts, le launcher, la documentation, `eva-cache.db` et `bot-state.db` s'ils existent.

Le fichier `.env` n'est pas copie. C'est volontaire : il contient le token Discord.

## 11. Depannage Windows

| Symptome | Cause probable | Solution |
|---|---|---|
| `node` n'est pas reconnu | Node.js absent du PATH | Reinstalle Node.js 24+ puis rouvre PowerShell. |
| `Cannot find module 'discord.js'` | Dependances absentes | Lance `npm install`. |
| `TokenInvalid` ou `Invalid token` | Token Discord incorrect | Verifie `DISCORD_TOKEN` ou regenere le token. |
| `Used disallowed intents` | Intents non actives | Active `Server Members Intent` dans le portail Discord. |
| Slash commands absentes | Commandes non deployees ou cache Discord | Lance `npm run deploy-commands`, puis redemarre Discord. |
| `Missing Permissions` | Permissions ou role bot insuffisants | Verifie les permissions OAuth et remonte le role du bot. |
| Salon non cree | Mauvais `CATEGORIE_DEFIS_ID` | Recopie l'ID de la categorie, pas d'un salon texte. |
| Votes non comptes | Roles joueurs incomplets | Verifie que les votants ont le role adverse. |
| Launcher ne s'ouvre pas | Port occupe ou navigateur bloque | Lance `npm run launcher`, lis `logs/launcher.log`, ou change `JARLBOT_LAUNCHER_PORT`. |
| Commandes EVA indisponibles | Import ou refresh en cours | Attends la fin du refresh ou consulte `logs/eva-refresh.out.log`. |

Logs utiles :

- `logs/launcher.log`
- `logs/bot.out.log`
- `logs/bot.err.log`
- `logs/eva-refresh.out.log`
