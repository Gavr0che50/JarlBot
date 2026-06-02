# Installation Windows de JarlBot

Ce guide décrit l'installation propre sur un poste Windows et l'ajout du bot sur un serveur Discord.

## 1. Créer l'application Discord

1. Va sur <https://discord.com/developers/applications>.
2. Clique sur **New Application**, nomme-la `JarlBot`, puis ouvre l'application.
3. Dans **Bot**, clique sur **Add Bot** si besoin.
4. Dans **Bot > Privileged Gateway Intents**, active :
   - **Server Members Intent** : requis pour compter les votes des rôles d'équipe.
   - **Message Content Intent** : conseillé pour garder une configuration Discord complète, même si les slash commands sont le chemin principal.
5. Dans **Bot**, copie le **Token**. Il ira dans `.env` sous `DISCORD_TOKEN`.
6. Dans **General Information**, copie l'**Application ID**. Il ira dans `.env` sous `CLIENT_ID`.

Ne partage jamais le token. Si le token fuite, utilise **Reset Token** dans le portail Discord.

## 2. Inviter le bot sur le serveur

Dans **OAuth2 > URL Generator** :

1. Coche les scopes :
   - `bot`
   - `applications.commands`
2. Coche les permissions bot :
   - **Manage Channels**
   - **Manage Events**
   - **Send Messages**
   - **Read Message History**
   - **Add Reactions**
   - **Mention Everyone**
   - **View Channels**
3. Ouvre l'URL générée, choisis le serveur, puis valide l'invitation.

Après l'invitation, monte le rôle du bot assez haut dans **Paramètres du serveur > Rôles**. Il doit être au-dessus des rôles qu'il doit mentionner ou gérer dans les salons privés.

## 3. Préparer le serveur Discord

1. Crée une catégorie dédiée, par exemple `Matchs`.
2. Active le mode développeur Discord, puis copie l'ID de cette catégorie. Il ira dans `.env` sous `CATEGORIE_DEFIS_ID`. Copie aussi l'ID de ton serveur. Il ira sous `GUILD_ID`.
3. Vérifie que les équipes ont chacune un rôle Discord clair, par exemple `ECYPS`, `TSA`, `Fury`.
4. Les joueurs doivent avoir le rôle de leur équipe. Le seuil de validation ne compte que les votes des membres du rôle adverse.

## 4. Installer sur le poste

### Depuis le dossier Release

1. Télécharge la dernière release (`v1.7.5` actuellement) -> Source-code.zip
2. Depuis ton dossier "Téléchargements", extrait l'archive ou tu le souhaites (`C:/Jarlbot` par exemple)
3. Double-clique sur `JarlBot Launcher.cmd`.
4. Renseigne :
   - `DISCORD_TOKEN`
   - `CLIENT_ID`
   - `GUILD_ID`
   - `CATEGORIE_DEFIS_ID`
5. Clique sur **Sauvegarder et lancer**. 

Le launcher installe les dépendances, écrit `.env`, enregistre les slash commands et lance le bot.

### Depuis une archive portable

1. Décompresse le dossier `JarlBot-portable-...`.
2. Installe Node.js 24+ depuis <https://nodejs.org>.
3. Double-clique sur `JarlBot Launcher.cmd`.
4. Renseigne :
   - `DISCORD_TOKEN`
   - `CLIENT_ID`
   - `GUILD_ID`
   - `CATEGORIE_DEFIS_ID`
5. Clique sur **Sauvegarder et lancer**.



### Depuis le dépôt

```bash
npm install
cp .env.example .env
npm run deploy-commands
npm start
```

Sous Windows, tu peux remplacer les commandes terminal par `JarlBot Launcher.cmd`.

## 5. Choisir le mode test ou production

Le réglage se fait dans le launcher avec **Mode de fonctionnement**, ou dans `.env` :

```env
JARLBOT_MODE=prod
```

- `prod` : mode normal. Les votes ✅ et ❌ sont comptés uniquement chez les membres du rôle adverse. Le seuil est automatique, de 1 à 4 votes selon le nombre de membres détectés dans ce rôle.
- `test` : mode installation/recette. Une seule personne peut valider/refuser un match, lancer un free, lancer une session, tester les salons, les événements, les suppressions et les rappels.

En mode test, les délais sont raccourcis : rappel MP 2 minutes avant l'horaire, rappels salon 90 secondes et 30 secondes avant, nettoyage 5 minutes après.

## 6. Exporter un package portable

Sur le poste source :

```bash
npm run export-portable
```

Le dossier exporté est créé dans `dist/`. Il contient le code, le launcher, les scripts, la documentation, `eva-cache.db` et `bot-state.db` si ces bases existent.

Le fichier `.env` n'est jamais copié dans l'export portable. C'est volontaire : il contient le token Discord.

## 7. Vérifier après installation

1. Lance `npm run deploy-commands` ou clique sur **Sauvegarder et lancer** dans le launcher.
2. Dans Discord, teste `/ping`.
3. Mets `JARLBOT_MODE=test`, relance le bot, puis crée un `/mix` prévu dans 3 à 5 minutes.
4. Réagis avec ✅. Vérifie que le salon privé et l'événement Discord sont créés.
5. Réagis avec ⏰ dans le salon privé pour tester le rappel MP.
6. Crée un second `/mix`, réagis avec ❌, puis vérifie que le défi est refusé.
7. Teste `/free` et `/session` : une seule inscription doit suffire en mode test.
8. Teste `/stat`, `/top`, `/classement` et `/tournoi site:`. Au premier lancement sans base EVA, attends la fin de l'import initial ou vérifie que le bot répond qu'une mise à jour est en cours et qu'il faut réessayer dans quelques minutes.
9. Repasse en `JARLBOT_MODE=prod` avant l'utilisation réelle.

Si le salon n'est pas créé, vérifie en priorité `CATEGORIE_DEFIS_ID`, la position du rôle du bot et les permissions **Manage Channels** / **View Channels**.

## 8. Fonctionnement du cache EVA

Au premier lancement sur un poste sans `eva-cache.db`, JarlBot crée la base EVA et la peuple. Pendant cette étape, les commandes `/stat`, `/stat-equipe`, `/classement`, `/top`, `/top-equipe` et `/tournoi` répondent immédiatement qu'une mise à jour est en cours.

Si `eva-cache.db` existe déjà, JarlBot ne lance aucun refresh au démarrage. Les commandes lisent le cache local pour rester rapides. Un refresh différentiel tourne ensuite toutes les 12h.
