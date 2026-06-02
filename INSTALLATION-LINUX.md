# Installation Linux de JarlBot

Ce guide couvre l'installation Linux, la configuration Discord, les tests de recette et les pannes courantes.

## 1. Prerequis

- Une machine Linux avec acces internet.
- Node.js 24+ avec npm.
- Un serveur Discord ou tu peux ajouter un bot.
- Une categorie Discord pour les salons prives.
- Des roles Discord pour les equipes si tu utilises `/mix` et `/scrim`.

Verifie Node.js :

```bash
node -v
npm -v
```

`node -v` doit afficher `v24.x` ou plus.

## 2. Installer Node.js 24+

Debian / Ubuntu :

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

Fedora :

```bash
sudo dnf install -y nodejs npm
node -v
npm -v
```

Si ta distribution fournit une version trop ancienne, installe Node.js depuis <https://nodejs.org> ou via ton gestionnaire de versions habituel.

## 3. Creer et inviter le bot Discord

Dans <https://discord.com/developers/applications> :

1. Cree une application Discord.
2. Ajoute un bot.
3. Active `Server Members Intent`.
4. Active `Message Content Intent` si tu veux garder une configuration complete.
5. Copie le token du bot pour `DISCORD_TOKEN`.
6. Copie l'Application ID pour `CLIENT_ID`.

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
3. Ouvre l'URL generee et invite le bot.
4. Place le role du bot au-dessus des roles qu'il doit mentionner ou gerer.

## 4. Preparer le serveur Discord

1. Cree une categorie, par exemple `Matchs`.
2. Active le mode developpeur Discord.
3. Copie l'ID du serveur : `GUILD_ID`.
4. Copie l'ID de la categorie : `CATEGORIE_DEFIS_ID`.
5. Verifie que chaque joueur a le role de son equipe.

En production, les votes de `/mix` et `/scrim` sont filtres par role adverse.

## 5. Recuperer JarlBot

Depuis le depot :

```bash
git clone https://github.com/Gavr0che50/JarlBot.git
cd JarlBot
```

Depuis un export portable :

```bash
cd JarlBot-portable-...
```

## 6. Lancer avec le launcher

```bash
chmod +x launcher.sh
./launcher.sh
```

Le script arrete les anciennes instances JarlBot lancees en Node, verifie Node.js 24+, installe les dependances si `node_modules` est absent, puis demarre le launcher local.

Par defaut, le launcher ouvre `http://localhost:3050`. Sur un serveur sans interface graphique :

```bash
JARLBOT_LAUNCHER_NO_OPEN=1 ./launcher.sh
```

Puis ouvre l'URL depuis ton poste :

```text
http://IP_DU_SERVEUR:3050
```

Si le port 3050 est pris, le launcher essaie les ports suivants.

## 7. Lancer sans launcher

```bash
npm install
cp .env.example .env
npm run deploy-commands
npm start
```

## 8. Remplir `.env`

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

## 9. Mode test

`JARLBOT_MODE=test` simplifie la recette :

- un vote suffit pour accepter ou refuser un `/mix` ou `/scrim` ;
- un participant suffit pour lancer un `/free` ;
- une inscription suffit pour lancer une `/session` ;
- les rappels sont raccourcis ;
- le nettoyage automatique passe a 5 minutes apres l'horaire.

Repasse en `JARLBOT_MODE=prod` avant l'usage reel.

## 10. Verification apres installation

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

## 11. Cache EVA

Precharger ou rafraichir le cache :

```bash
npm run eva-refresh
```

Refresh complet :

```bash
npm run eva-refresh:full
```

Reset complet du cache EVA :

```bash
npm run eva-refresh:reset
```

`eva-cache.db` stocke les donnees EVA. Si le fichier existe au demarrage, JarlBot ne lance pas de refresh immediat et attend le cycle periodique.

## 12. Export portable

Depuis le poste source :

```bash
npm run export-portable
```

L'export cree un dossier dans `dist/` avec le code, les scripts, le launcher, la documentation, `eva-cache.db` et `bot-state.db` s'ils existent.

Le fichier `.env` n'est pas copie. C'est volontaire : il contient le token Discord.

## 13. Depannage Linux

| Symptome | Cause probable | Solution |
|---|---|---|
| `node: command not found` | Node.js absent du PATH | Installe Node.js 24+ puis rouvre le shell. |
| Version Node trop ancienne | Depot systeme trop vieux | Installe Node.js 24+ via NodeSource ou nodejs.org. |
| `npm: command not found` | npm absent | Reinstalle Node.js avec npm. |
| `Permission denied` sur `launcher.sh` | Script non executable | Lance `chmod +x launcher.sh`. |
| `Cannot find module 'discord.js'` | Dependances absentes | Lance `npm install`. |
| `TokenInvalid` ou `Invalid token` | Token Discord incorrect | Verifie `DISCORD_TOKEN` ou regenere le token. |
| `Used disallowed intents` | Intents non actives | Active `Server Members Intent` dans le portail Discord. |
| Slash commands absentes | Commandes non deployees ou cache Discord | Lance `npm run deploy-commands`, puis redemarre Discord. |
| `Missing Permissions` | Permissions ou role bot insuffisants | Verifie les permissions OAuth et remonte le role du bot. |
| Salon non cree | Mauvais `CATEGORIE_DEFIS_ID` | Recopie l'ID de la categorie, pas d'un salon texte. |
| Votes non comptes | Roles joueurs incomplets | Verifie que les votants ont le role adverse. |
| Launcher inaccessible | Port bloque ou mauvais host | Lis `logs/launcher.log`, change `JARLBOT_LAUNCHER_PORT`, verifie le firewall. |
| Commandes EVA indisponibles | Import ou refresh en cours | Attends la fin du refresh ou consulte `logs/eva-refresh.out.log`. |

Logs utiles :

- `logs/launcher.log`
- `logs/bot.out.log`
- `logs/bot.err.log`
- `logs/eva-refresh.out.log`
