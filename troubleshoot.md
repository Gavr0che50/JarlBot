# 🛠️ JarlBot — Guide d'installation & Troubleshooting

> Ce document te guide pas à pas pour installer JarlBot sur un nouveau PC, et recense toutes les erreurs connues avec leurs solutions.

---

## 📦 ÉTAPE 1 — Installer Node.js

1. Va sur [https://nodejs.org](https://nodejs.org)
2. Télécharge la version **LTS** (Long Term Support)
3. Lance l'installateur, laisse tout par défaut, coche bien **"Add to PATH"**
4. Redémarre ton PC après l'installation

### ✅ Vérifier l'installation
Ouvre un terminal (CMD ou PowerShell) et tape :
```bash
node -v
npm -v
```
Tu dois voir des numéros de version (ex: `v20.11.0` et `10.2.4`).

> ⚠️ Si la commande n'est pas reconnue après installation → redémarre le terminal, ou redémarre le PC.

---

## 📁 ÉTAPE 2 — Récupérer les fichiers du bot

### Option A — Depuis Git
```bash
git clone <url-de-ton-repo>
cd JarlBot
```

### Option B — Copie manuelle
- Copie le dossier `JarlBot` sur le nouveau PC
- Assure-toi que ces fichiers sont bien présents :
  - `index.js`
  - `config.js`
  - `deploy-commands.js`
  - `package.json`
  - `utils/storage.js`

> ⚠️ Le dossier `node_modules` **ne se copie pas**. Tu le recréeras à l'étape suivante.
> ⚠️ Le fichier `.env` **ne se copie pas non plus** si tu utilises Git (il est ignoré). Recrée-le manuellement.

---

## 📥 ÉTAPE 3 — Installer les dépendances

Dans le dossier du bot, ouvre un terminal et tape :
```bash
npm install
```

Tu dois voir des packages s'installer. À la fin, le dossier `node_modules` apparaît.

### Option launcher pour non-expert

Sous Windows, double-clique sur `JarlBot Launcher.cmd`.
Le fichier vérifie Node.js, installe les dépendances si besoin, puis ouvre l'interface locale.

Depuis cette interface, tu peux:
- renseigner le token Discord, `CLIENT_ID`, `GUILD_ID` et `CATEGORIE_DEFIS_ID`;
- copier le lien d'invitation du bot;
- enregistrer les commandes slash;
- lancer ou arrêter le bot;
- lancer un refresh EVA;
- lire les logs.

### ❌ Erreurs courantes à cette étape

| Erreur | Solution |
|---|---|
| `npm : command not found` | Node.js mal installé ou PATH non configuré → réinstalle Node.js |
| `EACCES: permission denied` | Lance le terminal **en administrateur** |
| `npm ERR! code ENOENT` | Tu n'es pas dans le bon dossier → fais `cd JarlBot` d'abord |
| `gyp ERR!` sur Windows | Ignore si discord.js s'installe quand même, sinon installe `windows-build-tools` |

---

## 🔐 ÉTAPE 4 — Créer le fichier .env

Crée un fichier nommé exactement **`.env`** (pas `.env.txt`) à la racine du projet.

```env
DISCORD_TOKEN=ton_token_secret_ici
CLIENT_ID=id_de_ton_application
GUILD_ID=id_de_ton_serveur_discord
CATEGORIE_DEFIS_ID=id_de_la_categorie_pour_les_salons
EVA_GRAPHQL_URL=https://api.eva.gg/graphql
EVA_ACCESS_TOKEN=token_de_session_eva_optionnel
EVA_MAJOR_TOURNAMENT_IDS=2385727403616917503
EVA_V2_CACHE_TTL_MS=86400000
EVA_V2_MIN_INTERVAL_MS=120
EVA_V2_HTTP_TIMEOUT_MS=10000
EVA_V2_TEAM_MEMBER_REFRESH_LIMIT=250
EVA_V2_TEAM_MEMBER_FULL_REFRESH_LIMIT=2000
```

### Comment récupérer ces valeurs ?

| Variable | Où la trouver |
|---|---|
| `DISCORD_TOKEN` | [discord.com/developers](https://discord.com/developers/applications) → ton app → **Bot** → **Reset Token** |
| `CLIENT_ID` | Même page → **General Information** → **Application ID** |
| `GUILD_ID` | Discord → clic droit sur ton serveur → **Copier l'identifiant du serveur** |
| `CATEGORIE_DEFIS_ID` | Discord → clic droit sur la catégorie → **Copier l'identifiant** |

> ⚠️ Pour voir les IDs dans Discord : **Paramètres utilisateur** → **Avancé** → active **Mode développeur**

> 🔴 **IMPORTANT : Ne partage JAMAIS ton token.** Si tu penses qu'il a fuité → va sur le portail développeur → **Reset Token** immédiatement.

### ❌ Erreurs courantes à cette étape

| Erreur | Solution |
|---|---|
| Le fichier s'appelle `.env.txt` | Active l'affichage des extensions dans l'explorateur Windows et renomme-le |
| `TokenInvalid` au lancement | Token mal copié, espace en trop, ou token révoqué → régénère-le |
| `CATEGORIE_DEFIS_ID` vide | Le bot ne pourra pas créer de salons privés → obligatoire |
| `EVA_ACCESS_TOKEN` refusé | Le token EVA a expiré ou le compte n'a pas les droits nécessaires |

---

## 🚀 ÉTAPE 5 — Enregistrer les commandes slash

```bash
node deploy-commands.js
```

Tu dois voir :
```
✅ Commandes enregistrées avec succès !
```

> ⚠️ À faire **une seule fois**, ou si tu modifies les commandes slash.
> ⚠️ Les commandes peuvent mettre **jusqu'à 1h** à apparaître sur Discord (rare, souvent instantané).

### ❌ Erreurs courantes à cette étape

| Erreur | Solution |
|---|---|
| `Invalid token` | Vérifie `.env` → `DISCORD_TOKEN` |
| `Missing Access` | Le `CLIENT_ID` ou `GUILD_ID` est mauvais |
| Les commandes n'apparaissent pas | Redémarre le client Discord (Ctrl+R) |

---

## ▶️ ÉTAPE 6 — Lancer le bot

```bash
node index.js
```

Tu dois voir :
```
✅ Bot connecté en tant que JarlBot#xxxx !
```

### ❌ Erreurs courantes au lancement

| Erreur | Solution |
|---|---|
| `Cannot find module 'discord.js'` | Tu n'as pas fait `npm install` → fais-le |
| `Cannot find module './config'` | Le fichier `config.js` est manquant |
| `Cannot find module './utils/storage'` | Le dossier `utils/` ou `storage.js` est manquant |
| `TokenInvalid` | Token invalide dans `.env` |
| `Used disallowed intents` | Active les intents sur le portail développeur (voir ci-dessous) |

---

## 🔧 Intents à activer sur le portail développeur

Sur [discord.com/developers](https://discord.com/developers/applications) → ton app → **Bot** → **Privileged Gateway Intents** :

- ✅ **PRESENCE INTENT**
- ✅ **SERVER MEMBERS INTENT**
- ✅ **MESSAGE CONTENT INTENT**

> Sans ça, le bot se connecte mais ne peut pas lire les messages ni voir les membres.

---

## 🛡️ Permissions du bot sur le serveur

### Permissions globales (rôle du bot)
Va dans **Paramètres du serveur** → **Rôles** → rôle **JarlBot** :

- ✅ Gérer les salons
- ✅ Gérer les rôles
- ✅ Voir les salons
- ✅ Envoyer des messages
- ✅ Lire l'historique des messages
- ✅ Ajouter des réactions
- ✅ Gérer les événements
- ✅ Mentionner les rôles

> ⚠️ **IMPORTANT : Monte le rôle du bot le plus haut possible** dans la liste des rôles (juste en dessous de "Admin" si tu en as un). Sans ça, le bot ne peut pas modifier les permissions des salons.

### Permissions sur la catégorie des matchs
Clic droit sur la catégorie → **Modifier la catégorie** → **Permissions** → ajoute le rôle **JarlBot** :

- ✅ Voir le salon
- ✅ Gérer le salon
- ✅ Gérer les permissions
- ✅ Envoyer des messages
- ✅ Lire l'historique des messages

---

## 🐛 Erreurs connues & solutions

### `DiscordAPIError[50013]: Missing Permissions`
Le bot essaie de modifier un salon/permission mais n'a pas les droits.

**Solutions :**
1. Monte le rôle du bot **plus haut** dans la liste des rôles du serveur
2. Vérifie que le bot a **Gérer les salons** et **Gérer les rôles**
3. Vérifie les permissions sur la **catégorie** des salons privés

---

### `DiscordAPIError[50001]: Missing Access`
Le bot ne peut pas accéder à un salon ou une ressource.

**Solutions :**
1. Vérifie que le bot peut **Voir le salon** concerné
2. Vérifie les permissions de la catégorie parente

---

### `DiscordAPIError[10003]: Unknown Channel`
Le bot essaie d'accéder à un salon qui n'existe plus.

**Solutions :**
1. Supprime l'entrée dans `bot-state.db` via le bot ou recrée la base si nécessaire
2. Redémarre le bot pour reprogrammer les tâches restantes

---

### `DiscordAPIError[10008]: Unknown Message`
Le bot cherche un message supprimé.

**Solutions :**
1. Supprime l'entrée dans `bot-state.db` via le bot ou recrée la base si nécessaire
2. Pour repartir propre, supprime `bot-state.db` puis relance le bot pour reconstruire la base

### `EVA GraphQL error 429`
Le worker EVA ou une commande live a trop sollicité l'API.

**Solutions :**
1. Attends la fin du backoff automatique
2. Augmente `EVA_V2_MIN_INTERVAL_MS`
3. Baisse `EVA_V2_TEAM_MEMBER_REFRESH_LIMIT`
4. Laisse le cache local servir les commandes si les données ont moins de 24h

---

### `EVA range 416`
L'API Competitive refuse un `Range` trop large ou au-dela du nombre total de resultats.

**Solutions :**
1. Verifie que tu utilises bien le moteur EVA v2 actuel
2. Garde des pages de 50 elements maximum
3. Relance `npm run eva-refresh`
4. Si le probleme revient apres modification du code, verifier `fetchRange()` dans `utils/eva-v2.js`

---

### `database is locked`
Deux processus ecrivent dans `eva-cache.db` en meme temps.

**Solutions :**
1. Coupe les anciens processus `node index.js` ou `node scripts/eva-refresh.js --daemon`
2. Lance un seul worker de refresh a la fois
3. Relance `npm run eva-refresh:reset` si le cache est incoherent
4. Le moteur v2 utilise WAL + `busy_timeout`, mais il ne faut pas multiplier les workers

---

### `Impossible de récupérer les stats EVA`
La commande `/stat` n'a pas trouvé de correspondance assez proche pour le pseudo saisi.

**Solutions :**
1. Essaie le pseudo exact si tu le connais
2. Vérifie que le joueur existe bien côté EVA public
3. Attends que `npm run eva-refresh:reset` ou le daemon ait indexe le roster de son equipe
4. Si plusieurs joueurs sont proches du même pseudo, le bot garde le meilleur match local/public
5. Si le profil n'est dans aucun roster local/public, l'annuaire EVA global peut rester inaccessible avec le token actuel

---

### `/top` est lent au premier appel
La commande hydrate quelques joueurs major league si le cache manque de stats publiques.

**Solutions :**
1. Lance `npm run eva-refresh:reset` pour prehydrater les joueurs major
2. Augmente `EVA_V2_MAJOR_PLAYER_FULL_REFRESH_LIMIT` si le top manque de joueurs
3. Baisse `EVA_V2_COMMAND_PLAYER_HYDRATE_LIMIT` si tu veux zero attente en commande

---

### `Unhandled 'error' event` + crash complet
Une erreur non gérée fait planter Node.js.

**Solutions :**
1. Lis le message d'erreur juste au-dessus dans le terminal
2. Identifie la ligne indiquée (ex: `index.js:668`)
3. Signale l'erreur pour qu'elle soit entourée d'un `try/catch`

---

### Le bot se connecte mais ne répond pas aux commandes
**Vérifications :**
1. Tu as bien lancé `node deploy-commands.js` ou `npm run deploy-commands` ?
2. Tu utilises les commandes sur le **bon serveur** (celui dans `GUILD_ID`) ?
3. Les intents sont bien activés sur le portail développeur ?
4. Essaie `/help` pour vérifier que le bot voit bien les slash commands
5. Redémarre Discord avec **Ctrl+R**

---

### Le nom du salon privé n'est pas celui attendu
Les salons de match utilisent le format `type-date-heure`.

Exemples:
- `free-01-06-2026-18-00`
- `mix-01-06-2026-20-30`
- `scrim-01-06-2026-21-00`

Si tu vois encore un ancien format, le salon a probablement été créé avant la mise à jour ou le bot n'a pas été redémarré.

---

### Le launcher ne s'ouvre pas
**Vérifications :**
1. Installe Node.js 24+ depuis `https://nodejs.org`
2. Lance `npm install` si le dossier `node_modules` est absent
3. Lance `npm run launcher` pour voir l'erreur dans le terminal
4. Si le port est deja pris, le launcher essaie automatiquement le port suivant; si besoin, change quand même `JARLBOT_LAUNCHER_PORT=3051` dans `.env`

---

### L'export portable ne contient pas mon token
C'est volontaire. L'export ne copie pas `.env` pour eviter une fuite du token Discord.

**Solution :**
1. Ouvre le dossier exporte
2. Double-clique `JarlBot Launcher.cmd`
3. Renseigne les IDs et tokens depuis l'interface

---

### Les rappels (48h, 24h, 1h) ne se déclenchent pas
**Vérifications :**
1. Le bot était-il allumé au moment prévu ?
2. Les tâches sont reprogrammées au démarrage → redémarre le bot
3. Vérifie que la date du défi est bien dans le **futur**

---

## 💡 Astuces & bonnes pratiques

- **Ne jamais copier `node_modules`** d'un PC à l'autre → toujours faire `npm install`
- **Toujours redémarrer le terminal** après avoir installé Node.js
- **Mode développeur Discord** : active-le pour copier les IDs facilement (**Paramètres** → **Avancé** → **Mode développeur**)
- **Tester rapidement** : mets `SEUIL_VALIDATION: 1` dans `config.js` pour valider un défi avec un seul vote
- **Vider les données de test** : supprime `bot-state.db` ou enlève les entrées de test via le bot
- **Le bot plante ?** Lis toujours la **première ligne** du message d'erreur, pas la dernière
- **Token révoqué ?** Va sur le portail → Reset Token → mets à jour `.env`

---

## 📋 Checklist installation rapide

```
[ ] Node.js installé et vérifié (node -v)
[ ] Fichiers du bot copiés (sans node_modules)
[ ] npm install lancé
[ ] Fichier .env créé avec les 4 variables
[ ] Intents activés sur le portail développeur
[ ] Bot invité sur le serveur avec les bonnes permissions
[ ] Rôle du bot monté haut dans la liste des rôles
[ ] Permissions vérifiées sur la catégorie des salons
[ ] node deploy-commands.js lancé avec succès
[ ] node index.js lancé → bot connecté ✅
```

---

*JarlBot V1.1 — Document mis à jour le 30/05/2025*
