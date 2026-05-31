# 🤖 JarlBot V1.4

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
- **`/renfort`** — Inviter un renfort dans un salon privé, avec une équipe cible pour les scrims
- **`/stat`** — Afficher le KDA EVA d'un joueur public avec 5+ matchs all-time
- **`/stat-equipe`** — Afficher les stats d'une équipe EVA depuis le cache local, avec son classement local quand disponible
- **`/classement`** — Afficher le classement local EVA par division, via un site sélectionné
- **`/top`** — Afficher le top 10 des joueurs EVA publics sur la saison en cours
- **`/planning`** — Lister les matchs/événements Discord à venir sur 7 jours
- **`/ping`** — Vérifier que le bot répond

---

## 📋 Prérequis

- **Node.js 24+** installé ([télécharger ici](https://nodejs.org)) - `node:sqlite` est utilisé pour le cache local
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

Le bot utilise la base SQLite integree a Node.js, donc il n'y a pas de package SQLite natif a compiler.

### 3. Configurer les variables d'environnement

Crée un fichier `.env` à la racine du projet :

```env
DISCORD_TOKEN=ton_token_secret
CLIENT_ID=id_de_ton_application
GUILD_ID=id_de_ton_serveur
CATEGORIE_DEFIS_ID=id_de_la_categorie_pour_les_salons
EVA_COMPETITIVE_API_BASE_URL=https://competitive.eva.gg/api
EVA_GRAPHQL_URL=https://api.eva.gg/graphql
EVA_LOCAL_LEAGUES_CIRCUIT_ID=2395738311350114303
EVA_CAEN_REGION_ID=2395741613538603007
EVA_CAEN_RANKING_IDS=2489142894001680383,2441507312469446655
EVA_CAEN_MIN_MATCHES=5
EVA_PLAYER_MIN_MATCHES=5
EVA_PUBLIC_PLAYER_BATCH_SIZE=8
EVA_DATA_REFRESH_MS=43200000
EVA_PLAYERS_CACHE_MS=1800000
EVA_REQUEST_CACHE_MS=600000
EVA_API_MIN_INTERVAL_MS=117
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
| `EVA_COMPETITIVE_API_BASE_URL` | URL de base de l'API EVA Competitive |
| `EVA_GRAPHQL_URL` | Endpoint GraphQL public utilisé par app.eva.gg |
| `EVA_LOCAL_LEAGUES_CIRCUIT_ID` | Circuit Local Leagues EVA utilisé pour découvrir les tournois JARL |
| `EVA_CAEN_REGION_ID` | Région Competitive EVA de Caen |
| `EVA_CAEN_RANKING_IDS` | IDs de rankings JARL Caen, séparés par des virgules |
| `EVA_CAEN_TOURNAMENT_IDS` | Optionnel : IDs de tournois JARL Caen à utiliser au lieu de l'auto-détection |
| `EVA_CAEN_MIN_MATCHES` | Ancienne garde de matches pour l'autocomplete `/stat` (compatibilité) |
| `EVA_PLAYER_SUGGESTIONS` | Fallback manuel de pseudos `Pseudo#123456`, séparés par des virgules |
| `EVA_PLAYER_MIN_MATCHES` | Ancienne garde du cache joueurs, conservée pour compatibilité |
| `EVA_PUBLIC_PLAYER_BATCH_SIZE` | Nombre de profils publics récupérés par requête GraphQL groupée |
| `EVA_DATA_REFRESH_MS` | Fréquence de mise à jour du snapshot local EVA (12h par défaut) |
| `EVA_PLAYERS_CACHE_MS` | Durée des caches mémoire EVA intermédiaires |
| `EVA_REQUEST_CACHE_MS` | Durée du cache des appels EVA unitaires |
| `EVA_API_MIN_INTERVAL_MS` | Délai minimum entre deux appels EVA pour éviter les 429 |
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
├── eva-cache.db            ← Base locale SQLite du cache EVA
└── utils/
    └── eva.js              ← API EVA + lecture/écriture du cache local
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
- Le cache EVA persistant est dans `eva-cache.db` ; si tu déplaces le bot sur un autre PC, copie aussi ce fichier pour garder l'historique local
- Les tâches programmées (rappels, nettoyage) sont **persistantes** : si le bot redémarre, elles sont reprogrammées au boot
- `.env` ne doit **jamais** être commit sur Git
