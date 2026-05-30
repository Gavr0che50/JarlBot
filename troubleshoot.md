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
1. Supprime manuellement l'entrée obsolète dans `defis.json` ou `sessions.json`
2. Redémarre le bot pour reprogrammer les tâches restantes

---

### `DiscordAPIError[10008]: Unknown Message`
Le bot cherche un message supprimé.

**Solutions :**
1. Supprime manuellement l'entrée obsolète dans `defis.json` ou `sessions.json`
2. Pour repartir propre, vide `defis.json` et `sessions.json` → remplace leur contenu par `{}`

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
1. Tu as bien lancé `node deploy-commands.js` ?
2. Tu utilises les commandes sur le **bon serveur** (celui dans `GUILD_ID`) ?
3. Les intents sont bien activés sur le portail développeur ?
4. Redémarre Discord avec **Ctrl+R**

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
- **Vider les données de test** : vide `defis.json` et `sessions.json` avec `{}`
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
