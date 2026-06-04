# Installation Windows

Ce guide installe JarlBot, configure le bot Discord et vérifie que les commandes fonctionnent.

## Prérequis

- Windows 10 ou 11.
- Node.js 24 ou plus avec npm. <https://nodejs.org/dist/v24.16.0/node-v24.16.0-x64.msi> (L'installation est standard, il faut faire suivant, suivant et attendre la fin de l'installation).
- Un serveur Discord où tu peux inviter un bot.
- Une catégorie Discord pour les salons privés.
- Des rôles Discord pour les équipes.
- Un bloc note temporaire, pour copier les différents ID

Vérifie Node.js dans PowerShell :

```powershell
node -v
npm -v
```

`node -v` doit afficher `v24.x` ou plus.

## 1. Créer l'application Discord

1. Ouvre <https://discord.com/developers/applications>.
2. Clique sur `New Application`, nomme l'application, puis ouvre-la.
3. Dans `Bot`, crée le bot si besoin.
4. Dans `Bot > Privileged Gateway Intents`, active `Server Members Intent` et `Message Content Intent`.
5. Copie le token du bot dans le bloc note. Il ira dans `.env` sous `DISCORD_TOKEN`.
6. Dans `General Information`, copie l'Application ID dans le bloc note. Il ira dans `.env` sous `CLIENT_ID`.

Ne partage jamais le token Discord. Si un token a été exposé, utilise `Reset Token` dans le portail Discord.

## 2. Inviter le bot

Dans `OAuth2 > URL Generator` :

1. Coche `bot` et `applications.commands`.
2. Coche les permissions `Manage Channels`, `Manage Events`, `Send Messages`, `Read Message History`, `Add Reactions`, `Mention Everyone` et `View Channels`.
3. Ouvre l'URL générée dans ton navigateur internet.
4. Invite le bot sur ton serveur.
5. Place le rôle du bot assez haut dans la hiérarchie Discord pour qu'il puisse gérer les salons et mentionner les rôles nécessaires. (Dans Serveur -> Rôle. Place le en dessous des rôles admins).

## 3. Préparer Discord

1. Crée une catégorie, par exemple `Matchs`.
2. Active le mode développeur Discord.
3. Clique droit sur le serveur, puis copie l'ID dans ton blocn note : ce sera `GUILD_ID`.
4. Clique droit sur la catégorie, puis copie l'ID dans ton bloc note : ce sera `CATEGORIE_DEFIS_ID`.
5. Vérifie que les joueurs ont bien le rôle de leur équipe.

En production, `/mix` et `/scrim` vérifient les rôles pour compter les votes correctement.

## 4. Installer JarlBot

Depuis Windows (recommandé) :
1. Decompresser `Jarlbot.zip` (dans `C/:Jarlbot` par exemple)
2. Se rendre ou `Jarlbot.zip` a été  décompressé. Puis lancer `JarlBot Launcher.cmd`. 
3. Sur la page web, entrer les informations précédemment copié dans le bloc-note, selectionner le mode (`Test` ou `Prod`) puis selectionner `Sauvegarder et lancer`. 
4. Attendre la fin de l'import de la base de donnée (visible dans les logs. Environ 10 minutes) et le bot sera accessible sur Discord. 

Les étapes suivantes peuvent être ignorées et le bloc note fermé sans sauvegarder.

ATTENTION : La terminal doit rester ouvert, c'est lui qui pilote le bot.

Depuis PowerShell :

```powershell
git clone https://github.com/Gavr0che50/JarlBot.git
cd JarlBot
npm install
copy .env.example .env
```

```powershell
npm install
copy .env.example .env
```

## 5. Configurer `.env` 

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

## 6. Déployer les commandes Discord

```powershell
npm run deploy-commands
```

Cette commande enregistre les slash commands sur le serveur indiqué par `GUILD_ID`.

## 7. Lancer le bot

Lancement direct :

```powershell
npm start
```

Lancement avec interface locale :

```powershell
npm run launcher
```

Par défaut, le launcher ouvre `http://127.0.0.1:4050`. Si le port est déjà utilisé, change `JARLBOT_LAUNCHER_PORT` dans `.env`.

Tu peux aussi utiliser le fichier `JarlBot Launcher.cmd`.

## 8. Mode test

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

## 9. Vérification après installation

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

Au premier lancement sans `eva-cache.db`, l'import EVA initial prend environ 10 minutes.

## 10. Cache EVA

Mettre à jour le cache :

```powershell
npm run eva-refresh
```

Refresh complet :

```powershell
npm run eva-refresh:full
```

Reset complet :

```powershell
npm run eva-refresh:reset
```

`eva-cache.db` est local et ignoré par Git.

## 11. Dépannage

Le dépannage centralisé est disponible ici : [troubleshoot.md](troubleshoot.md).
