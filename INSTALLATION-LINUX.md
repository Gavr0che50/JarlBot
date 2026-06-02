# Installation Linux

Ce guide installe JarlBot sur Linux, configure le bot Discord et prépare un lancement manuel ou via le launcher web local.

## Prérequis

- Une machine Linux avec accès internet.
- Node.js 24 ou plus avec npm.
- Un serveur Discord où tu peux inviter un bot.
- Une catégorie Discord pour les salons privés.
- Des rôles Discord pour les équipes si tu utilises `/mix` et `/scrim`.

Vérifie Node.js :

```bash
node -v
npm -v
```

`node -v` doit afficher `v24.x` ou plus.

## 1. Installer Node.js 24+

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

Tu peux aussi installer Node.js depuis <https://nodejs.org>.

## 2. Créer l'application Discord

1. Ouvre <https://discord.com/developers/applications>.
2. Crée une application Discord.
3. Dans `Bot`, crée le bot si besoin.
4. Active `Server Members Intent`.
5. Active aussi `Message Content Intent` pour une configuration complète.
6. Copie le token du bot pour `DISCORD_TOKEN`.
7. Copie l'Application ID pour `CLIENT_ID`.

Ne partage jamais le token Discord. Si un token a été exposé, régénère-le dans le portail Discord.

## 3. Inviter le bot

Dans `OAuth2 > URL Generator` :

1. Coche les scopes `bot` et `applications.commands`.
2. Coche les permissions `Manage Channels`, `Manage Events`, `Send Messages`, `Read Message History`, `Add Reactions`, `Mention Everyone` et `View Channels`.
3. Ouvre l'URL générée et invite le bot.
4. Place le rôle du bot assez haut dans la hiérarchie Discord pour qu'il puisse gérer les salons et mentionner les rôles nécessaires.

## 4. Préparer Discord

1. Crée une catégorie, par exemple `Matchs`.
2. Active le mode développeur Discord.
3. Clique droit sur le serveur, puis copie l'ID : ce sera `GUILD_ID`.
4. Clique droit sur la catégorie, puis copie l'ID : ce sera `CATEGORIE_DEFIS_ID`.
5. Vérifie que les joueurs ont bien le rôle de leur équipe.

## 5. Installer JarlBot

```bash
git clone https://github.com/Gavr0che50/JarlBot.git
cd JarlBot
npm install
cp .env.example .env
```

## 6. Configurer `.env`

Ouvre `.env` et remplis au minimum :

```env
DISCORD_TOKEN=ton-token-discord
CLIENT_ID=id-application-discord
GUILD_ID=id-serveur-discord
CATEGORIE_DEFIS_ID=id-categorie-salons
JARLBOT_MODE=prod
```

Variables utiles du launcher :

```env
JARLBOT_LAUNCHER_PORT=4050
JARLBOT_LAUNCHER_HOST=127.0.0.1
JARLBOT_LAUNCHER_NO_OPEN=0
```

Les variables EVA présentes dans `.env.example` peuvent rester avec leurs valeurs par défaut sauf besoin spécifique.

## 7. Déployer les commandes Discord

```bash
npm run deploy-commands
```

Cette commande enregistre les slash commands sur le serveur indiqué par `GUILD_ID`.

## 8. Lancer le bot

Lancement direct :

```bash
npm start
```

Lancement avec interface locale :

```bash
npm run launcher
```

Avec le script Linux :

```bash
chmod +x launcher.sh
./launcher.sh
```

Sur un serveur sans interface graphique :

```bash
JARLBOT_LAUNCHER_NO_OPEN=1 ./launcher.sh
```

Puis ouvre l'URL depuis ton poste :

```text
http://IP_DU_SERVEUR:4050
```

Pour accéder au launcher depuis une autre machine, utilise `JARLBOT_LAUNCHER_HOST=0.0.0.0` et ouvre `http://IP_DU_SERVEUR:4050`.

Si le port est déjà utilisé, change `JARLBOT_LAUNCHER_PORT` dans `.env`.

## 9. Mode test

Pour tester sans attendre les seuils de production :

```env
JARLBOT_MODE=test
```

En mode test :

- un vote suffit pour accepter ou refuser un `/mix` ou `/scrim` ;
- un participant suffit pour lancer un `/free` ;
- une inscription suffit pour lancer une `/session` ;
- les rappels sont raccourcis ;
- le nettoyage automatique est plus rapide.

Repasse en `JARLBOT_MODE=prod` avant l'usage réel.

## 10. Vérification après installation

1. Lance `npm run check`.
2. Lance `npm run deploy-commands`.
3. Démarre le bot avec `npm start` ou `npm run launcher`.
4. Dans Discord, teste `/ping`.
5. Passe temporairement en `JARLBOT_MODE=test`.
6. Redémarre le bot.
7. Crée un `/mix` dans 3 à 5 minutes.
8. Réagis positivement pour vérifier la création du salon privé et de l'événement.
9. Teste la réaction de rappel privé dans le salon.
10. Teste `/free`, `/session`, `/planning` et une commande EVA comme `/stat`.
11. Repasse en `JARLBOT_MODE=prod`.

Au premier lancement sans `eva-cache.db`, l'import EVA initial peut prendre du temps.

## 11. Cache EVA

Mettre à jour le cache :

```bash
npm run eva-refresh
```

Refresh complet :

```bash
npm run eva-refresh:full
```

Reset complet :

```bash
npm run eva-refresh:reset
```

`eva-cache.db` est local et ignoré par Git.

## 12. Dépannage

Le dépannage centralisé est disponible ici : [troubleshoot.md](troubleshoot.md).
