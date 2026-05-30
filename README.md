# 🤖 JarlBot V1.3

Bot Discord de gestion de **défis d'équipes** et de **sessions spéciales** pour communautés EVA.

Création automatique de **salons privés**, **événements Discord**, **rappels programmés** (48h en MP, 24h et 1h dans le salon), validation par votes, et nettoyage automatique après les matchs.

---

## ✨ Fonctionnalités

### ⚔️ Défis d'équipes
- **`/mix`** — Match amical entre deux équipes
- **`/scrim`** — Match d'entraînement compétitif
- **`/free`** — Recherche libre de joueurs (sans équipe imposée)
- Validation par votes ✅ de l'équipe adverse (seuil configurable)
- Création automatique d'un **salon privé** réservé aux participants
- Création automatique d'un **événement Discord** (visible dans la barre latérale)
- **Rappels programmés** :
  - 48h avant → MP aux joueurs qui ont réagi ⏰
  - 24h avant → message dans le salon privé
  - 1h avant → message dans le salon privé
- Nettoyage automatique du salon 48h après le match

### 🎮 Sessions spéciales
- **`/session`** — Propose une session (Nocturne, Matinale, Événement)
- Inscription via boutons **Je participe / Quitter**
- Lancement automatique quand le nombre de joueurs est atteint
- Salon privé + rappel MP 48h avant

### 🛠️ Outils admin
- **`/renfort`** — Inviter des renforts dans un salon privé
- **`/cleanup`** — Supprimer tous les salons, événements et données du bot
- **`/ping`** — Vérifier que le bot répond

---

## 📋 Prérequis

- **Node.js 18+** installé ([télécharger ici](https://nodejs.org))
- Un **bot Discord** créé sur le [Portail Développeurs Discord](https://discord.com/developers/applications)
- Les **intents privilégiés** activés sur le bot :
  - `SERVER MEMBERS INTENT`
  - `MESSAGE CONTENT INTENT`
- Une **catégorie Discord** où le bot créera les salons privés

---

## 🚀 Installation

### 1. Cloner / récupérer le projet
```bash
git clone <ton-repo>
cd JarlBot
```

### 2. Installer les dépendances
```bash
npm install
```

### 3. Configurer les variables d'environnement

Crée un fichier `.env` à la racine du projet :

```env
DISCORD_TOKEN=ton_token_secret
CLIENT_ID=id_de_ton_application
GUILD_ID=id_de_ton_serveur
CATEGORIE_DEFIS_ID=id_de_la_categorie_pour_les_salons
```

> ⚠️ **Ne partage JAMAIS ton token Discord.** S'il fuite, va dans le portail développeur et clique sur **Reset Token**.

### 4. Enregistrer les commandes slash
```bash
npm run deploy-commands
```

Tu devrais voir :
```
✅ X commande(s) enregistrée(s) avec succès !
```

### 5. Lancer le bot
```bash
npm start
```

---

## ⚙️ Configuration

Toute la configuration éditable se trouve dans **`config.js`** :

| Paramètre | Description |
|---|---|
| `SEUIL_VALIDATION` | Nombre de votes ✅ requis pour valider un défi (1 en test, 3+ en prod) |
| `PREFIXE_SALON_PRIVE` | Préfixe des salons créés (ex: `match-mix-25-12-2025`) |
| `RAPPEL_MP_AVANT_MATCH` | Délai du rappel MP (par défaut 48h) |
| `RAPPEL_24H_AVANT_MATCH` | Rappel dans le salon (24h avant) |
| `RAPPEL_1H_AVANT_MATCH` | Rappel dans le salon (1h avant) |
| `DELAI_SUPPRESSION_SALON` | Délai avant suppression du salon (48h après) |
| `MESSAGES.*` | Tous les textes du bot (personnalisables) |

---

## 📁 Structure du projet

```
JarlBot/
├── .env                    ← Secrets (ignoré par Git)
├── .gitignore
├── package.json
├── config.js               ← Configuration éditable
├── deploy-commands.js      ← Enregistrement des commandes slash
├── index.js                ← Code principal du bot
├── defis.json              ← Données des défis (auto-généré)
├── sessions.json           ← Données des sessions (auto-généré)
└── utils/
    └── storage.js          ← Lecture/écriture des fichiers JSON
```

---

## 🔐 Permissions Discord requises

Le bot doit avoir ces permissions sur ton serveur :

- ✅ Gérer les salons (créer/supprimer)
- ✅ Gérer les événements
- ✅ Envoyer des messages
- ✅ Lire l'historique des messages
- ✅ Ajouter des réactions
- ✅ Mentionner @everyone, here et les rôles
- ✅ Voir les salons

---

## 🧪 Mode test rapide

Pour tester sans attendre les votes :
1. Dans `config.js`, mets `SEUIL_VALIDATION: 1`
2. Lance un défi avec `/mix` ou `/scrim`
3. Réagis avec ✅ → le défi est validé immédiatement

---

## 🐛 Problèmes courants

| Erreur | Solution |
|---|---|
| `TokenInvalid` | Vérifie ton `DISCORD_TOKEN` dans `.env` |
| `Cannot find module 'discord.js'` | Lance `npm install` |
| Les commandes slash n'apparaissent pas | Lance `npm run deploy-commands` et redémarre Discord |
| `Missing Permissions` | Vérifie les permissions du bot sur le serveur |
| Le salon n'est pas créé | Vérifie `CATEGORIE_DEFIS_ID` dans `.env` |

---

## 📜 Licence

ISC — Usage personnel et communautaire libre.

---

## 💡 Notes

- Les fichiers `defis.json` et `sessions.json` sont créés automatiquement
- Les tâches programmées (rappels, nettoyage) sont **persistantes** : si le bot redémarre, elles sont reprogrammées au boot
- `.env` ne doit **jamais** être commit sur Git
