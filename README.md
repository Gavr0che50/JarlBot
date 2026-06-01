# 🤖 JarlBot V1.4

Bot Discord open source pour gérer des **défis d'équipes**, des **sessions spéciales** et des **statistiques EVA**.

Création automatique de **salons privés**, **événements Discord**, **rappels programmés** (48h en MP, 24h et 1h dans le salon), validation par votes, et nettoyage automatique après les matchs.

---

## ✨ Fonctionnalités

### ⚔️ Défis d'équipes
- **`/mix`** — Match amical entre deux équipes
- **`/scrim`** — Match d'entraînement compétitif
- **`/free`** — Recherche libre de joueurs avec niveau attendu imposé
- Validation par votes ✅ de l'équipe adverse (seuil configurable)
- Refus possible par votes ❌ sur le message de validation, avec le même seuil que l'acceptation
- Création automatique d'un **salon privé** réservé aux participants
- Création automatique d'un **événement Discord** (visible dans la barre latérale)
- Bouton d'annulation dans le salon privé, avec confirmation en deux clics avant suppression
- **Rappels programmés** :
  - 48h avant → MP aux joueurs qui ont réagi ⏰
  - 24h avant → message dans le salon privé
  - 1h avant → message dans le salon privé
- Nettoyage automatique du salon 48h après le match

### 🎮 Sessions spéciales
- **`/session`** — Propose une session (Nocturne, Matinale, Événement) avec descriptif obligatoire
- Inscription via boutons **Je participe / Quitter**
- Lancement automatique quand le nombre de joueurs est atteint
- Salon privé + rappel MP 48h avant

### 🛠️ Outils
- **`/help`** — Afficher le guide simple des commandes et des bons usages
- **`/renfort`** — Inviter un renfort dans un salon privé, avec une équipe cible pour les scrims
- **`/stat`** — Afficher les stats EVA d'un joueur indexé: matchs, KDA, équipe, ligue locale, rang local et tendance vs saison précédente
- **`/stat-equipe`** — Afficher les stats d'une équipe EVA: salle, ligue, points saison, rang local, roster et tendance vs saison précédente
- **`/classement`** — Afficher les classements locaux d'une ville/salle EVA, par ranking et équipes triées par points
- **`/top`** — Afficher le top joueurs EVA basé sur la major league, avec KDA et tendance
- **`/top-equipe`** — Afficher le top équipes EVA basé sur la major league, avec points, bilan et différentiel
- **`/planning`** — Lister les événements Discord à venir
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

### Option simple avec interface graphique

Sur Windows, double-clique sur **`JarlBot Launcher.cmd`**.

Le launcher:
- installe les dependances si `node_modules` est absent;
- ouvre une interface locale sombre, pensée pour une prise en main rapide;
- sauvegarde les IDs Discord dans `.env`;
- genere le lien d'invitation du bot;
- lance le bot et enregistre les commandes slash en une seule action;
- reste volontairement minimal: pas de refresh EVA, pas de logs, pas d'export dans l'interface;
- garde une UX simple pour un administrateur non technique.

Tu peux aussi le lancer en terminal:

```bash
npm run launcher
```

### Installation depuis GitHub ou via npm

Le projet est préparé comme un paquet npm public et peut aussi être installé directement depuis GitHub:

```bash
npm install github:Gavr0che50/JarlBot
```

Ou, une fois publié sur npm:

```bash
npm install jarlbot
```

Le paquet contient le bot, le launcher et les scripts de refresh. Le fichier `.env` et les bases SQLite locales restent à créer sur la machine cible pour garder les secrets hors du package.

Pour générer une archive distributable locale:

```bash
npm run pack:dist
```

Cela produit un `.tgz` dans `dist/` que tu peux partager ou publier.

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
Le moteur EVA v2 stocke les donnees utiles dans `eva-cache.db`:
- rankings et equipes de `competitive.eva.gg/api`;
- rosters des equipes via `/teams/{teamId}/members`;
- joueurs major league et stats publiques via GraphQL `api.eva.gg/graphql`;
- resume local par equipe pour repondre vite aux commandes slash.

Les commandes lisent SQLite d'abord. Si une donnee manque ou depasse 24h, le bot peut rafraichir le minimum utile; le refresh complet reste reserve au worker.

### 3. Configurer les variables d'environnement

Crée un fichier `.env` à la racine du projet :

```env
DISCORD_TOKEN=ton_token_secret
CLIENT_ID=id_de_ton_application
GUILD_ID=id_de_ton_serveur
CATEGORIE_DEFIS_ID=id_de_la_categorie_pour_les_salons
EVA_COMPETITIVE_API_BASE_URL=https://competitive.eva.gg/api
EVA_GRAPHQL_URL=https://api.eva.gg/graphql
EVA_ACCESS_TOKEN=ton_token_de_session_eva_optionnel
EVA_EMAIL=ton_email_eva_optionnel
EVA_PASSWORD=ton_mot_de_passe_eva_optionnel
EVA_LOCAL_LEAGUES_CIRCUIT_ID=2395738311350114303
EVA_PLAYER_MIN_MATCHES=5
EVA_PUBLIC_PLAYER_BATCH_SIZE=8
EVA_PUBLIC_USER_PAGE_LIMIT=0
EVA_PUBLIC_SEED_USER_IDS=
EVA_PUBLIC_STAT_LIMIT=0
EVA_PUBLIC_STAT_BATCH_SIZE=10
EVA_PUBLIC_MIN_INTERVAL_MS=250
EVA_PUBLIC_MAX_RETRIES=4
EVA_DATA_REFRESH_MS=43200000
EVA_PLAYERS_CACHE_MS=1800000
EVA_REQUEST_CACHE_MS=600000
EVA_API_MIN_INTERVAL_MS=117
EVA_MAJOR_TOURNAMENT_IDS=2385727403616917503
EVA_V2_CACHE_TTL_MS=86400000
EVA_V2_MIN_INTERVAL_MS=120
EVA_V2_HTTP_TIMEOUT_MS=10000
EVA_V2_TEAM_MEMBER_REFRESH_LIMIT=250
EVA_V2_TEAM_MEMBER_FULL_REFRESH_LIMIT=2000
EVA_V2_MAJOR_PLAYER_REFRESH_LIMIT=20
EVA_V2_MAJOR_PLAYER_FULL_REFRESH_LIMIT=100
EVA_V2_COMMAND_PLAYER_HYDRATE_LIMIT=3
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

### Peupler la base sans lancer le bot
```bash
npm run eva-refresh:daemon
```

Ce worker remplit automatiquement `eva-cache.db` sans démarrer Discord.
Le cycle normal est de 24h (`EVA_V2_CACHE_TTL_MS`). Pour repartir d'une base EVA propre:

```bash
npm run eva-refresh:reset
```

Cette commande vide les tables EVA v2 et le cache local, puis reconstruit les rankings, equipes, rosters et joueurs major league.

### Exporter une version portable

```bash
npm run export-portable
```

L'export cree un dossier `dist/JarlBot-portable-...` avec:
- le code du bot;
- le launcher graphique;
- `package.json` et `package-lock.json`;
- la licence MIT;
- `eva-cache.db` si elle existe;
- `bot-state.db` si elle existe;
- un `README-PORTABLE.txt`.

L'export ne copie pas ton `.env` pour eviter de fuiter le token Discord. L'utilisateur final le remplit depuis le launcher.

Le moteur EVA v2 respecte les contraintes observees de l'API Competitive: ranges de 50 elements maximum, derniere page bornee au total exact, cadence configurable et timeout par appel.

### Worker public EVA
```bash
npm run eva-public-refresh
```

Le worker `npm run eva-public-refresh` reste disponible si tu veux enrichir le cache public, mais le chemin principal pour le bot est `npm run eva-refresh` / `npm run eva-refresh:reset`.

---

## ⚙️ Configuration

Toute la configuration éditable se trouve dans **`config.js`** :

### Sources EVA utilisees

- API Competitive: `https://competitive.eva.gg/api`
- GraphQL public app EVA: `https://api.eva.gg/graphql`
`config.js` est le fichier de réglage manuel principal. On y met les constantes métier et les durées du bot.  
Le fichier `.env` reste pour les secrets, les IDs propres à un environnement, et les surcharges locales si besoin.

| Paramètre | Description |
|---|---|
| `SEUIL_VALIDATION` | Nombre de votes ✅ requis pour valider un défi (1 en test, 3+ en prod) |
| `PREFIXE_SALON_PRIVE` | Ancien préfixe historique. Les nouveaux salons de match utilisent `type-date-heure`, ex: `mix-01-06-2026-20-30` |
| `RAPPEL_MP_AVANT_MATCH` | Délai du rappel MP (par défaut 48h) |
| `RAPPEL_24H_AVANT_MATCH` | Rappel dans le salon (24h avant) |
| `RAPPEL_1H_AVANT_MATCH` | Rappel dans le salon (1h avant) |
| `DELAI_SUPPRESSION_SALON` | Délai avant suppression du salon (48h après) |
| `EVA_DEFAULT_LOCAL_LEAGUES_CIRCUIT_ID` | Valeur de secours pour le circuit local leagues |
| `EVA_RATE_LIMIT_MAX_DELAY_MS` | Plafond de ralentissement automatique après un 429 |
| `EVA_GRAPHQL_TIMEOUT_MS` | Timeout des appels GraphQL EVA |
| `EVA_CACHE_BEST_SCORE_BONUS` | Bonus de score appliqué à un cache marqué complet |
| `EVA_TEAM_LINEUP_DISPLAY_LIMIT` | Nombre max de joueurs affichés dans une lineup équipe |
| `EVA_TOP_PLAYERS_LIMIT` | Nombre max de joueurs affichés par `/top` |
| `EVA_PLANNING_WINDOW_DAYS` | Fenêtre temporelle affichée par `/planning` |
| `EVA_COMPETITIVE_API_BASE_URL` | URL de base de l'API EVA Competitive |
| `EVA_GRAPHQL_URL` | Endpoint GraphQL public utilisé par app.eva.gg |
| `EVA_LOCAL_LEAGUES_CIRCUIT_ID` | Circuit Local Leagues EVA utilisé pour découvrir les tournois JARL |
| `EVA_PLAYER_SUGGESTIONS` | Fallback manuel de pseudos `Pseudo#123456`, séparés par des virgules |
| `EVA_PLAYER_MIN_MATCHES` | Seuil minimal de matches utilisé pour filtrer les profils trop maigres |
| `EVA_PUBLIC_PLAYER_BATCH_SIZE` | Nombre de profils publics récupérés par requête GraphQL groupée |
| `EVA_PUBLIC_USER_PAGE_LIMIT` | Limite optionnelle de pages pour le crawl public EVA |
| `EVA_PUBLIC_SEED_USER_IDS` | Liste de `userId` EVA à injecter comme seeds |
| `EVA_PUBLIC_STAT_LIMIT` | Limite de joueurs traités par le worker public |
| `EVA_PUBLIC_STAT_BATCH_SIZE` | Taille des lots pour les stats publiques |
| `EVA_PUBLIC_MIN_INTERVAL_MS` | Pause minimale entre deux appels EVA publics |
| `EVA_PUBLIC_MAX_RETRIES` | Nombre de retries du worker public |
| `EVA_ACCESS_TOKEN` | Token de session EVA optionnel pour GraphQL public |
| `EVA_EMAIL` / `EVA_PASSWORD` | Alternative au token pour s'authentifier sur EVA |
| `EVA_PLAYER_RESOLUTION_INTERVAL_MS` | Cadence de base entre deux résolutions de joueur |
| `EVA_PLAYER_RESOLUTION_JITTER_MS` | Jitter ajouté à la cadence de résolution pour lisser le flux |
| `EVA_DATA_REFRESH_MS` | Fréquence de mise à jour du snapshot local EVA (12h par défaut) |
| `EVA_PLAYERS_CACHE_MS` | Durée des caches mémoire EVA intermédiaires |
| `EVA_REQUEST_CACHE_MS` | Durée du cache des appels EVA unitaires |
| `EVA_API_MIN_INTERVAL_MS` | Délai minimum entre deux appels EVA pour éviter les 429 |
| `JARLBOT_LAUNCHER_PORT` | Port HTTP local de l'interface graphique, `3050` par défaut |
| `JARLBOT_LAUNCHER_NO_OPEN` | Mettre `1` pour ne pas ouvrir automatiquement le navigateur |
| `EVA_MAJOR_TOURNAMENT_IDS` | IDs des tournois major league utilisés par `/top` et `/top-equipe` |
| `EVA_V2_CACHE_TTL_MS` | Durée de fraîcheur du cache EVA v2, 24h par défaut |
| `EVA_V2_MIN_INTERVAL_MS` | Pause minimale entre deux appels EVA v2 |
| `EVA_V2_HTTP_TIMEOUT_MS` | Timeout d'un appel EVA v2 |
| `EVA_V2_TEAM_MEMBER_REFRESH_LIMIT` | Nombre de rosters rafraîchis par cycle standard |
| `EVA_V2_TEAM_MEMBER_FULL_REFRESH_LIMIT` | Nombre de rosters rafraîchis par cycle `--full` |
| `EVA_V2_MAJOR_PLAYER_REFRESH_LIMIT` | Nombre de joueurs major hydratés par cycle standard |
| `EVA_V2_MAJOR_PLAYER_FULL_REFRESH_LIMIT` | Nombre de joueurs major hydratés par cycle `--full` |
| `EVA_V2_COMMAND_PLAYER_HYDRATE_LIMIT` | Nombre max de joueurs hydratés en direct si `/top` manque de données |
| `MESSAGES.*` | Tous les textes du bot (personnalisables) |

---

## 📁 Structure du projet

```
JarlBot/
├── .env                    ← Secrets (ignoré par Git)
├── .gitignore
├── package.json
├── JarlBot Launcher.cmd    ← Double-clic Windows pour ouvrir l'interface locale
├── launcher.sh             ← Lanceur Linux/macOS
├── LICENSE                 ← Licence MIT open source
├── config.js               ← Configuration éditable
├── deploy-commands.js      ← Enregistrement des commandes slash
├── index.js                ← Code principal du bot
├── bot-state.db             ← Données des défis et sessions (SQLite)
├── eva-cache.db            ← Base locale SQLite du cache EVA
├── scripts/
│   ├── launcher.js         ← Interface graphique locale d'administration
│   ├── export-portable.js  ← Génère un dossier portable avec la DB
│   └── eva-refresh.js      ← Worker EVA v2 24h / reset / full refresh
└── utils/
    └── eva-v2.js           ← Moteur EVA v2 rapide et différentiel
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
4. Réagis avec ❌ → le défi peut être refusé si le seuil de votes est atteint

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

MIT — logiciel open source, libre d'utilisation, modification et redistribution. Voir [LICENSE](LICENSE).

---

## 💡 Notes

- Les données de défis et sessions sont stockées dans `bot-state.db`
- Le cache EVA persistant est dans `eva-cache.db` ; si tu déplaces le bot sur un autre PC, copie aussi ce fichier pour garder l'historique local
- Les commandes EVA utilisent un mode hybride: lecture locale d'abord, refresh si la donnée est absente ou plus vieille que 24h
- Le worker `npm run eva-public-refresh` peut tourner à part du bot Discord
- Le cache joueurs ne contient pas tous les comptes EVA, mais les joueurs compétitifs dont le profil public a pu être résolu
- Les constantes que tu veux ajuster à la main doivent rester dans `config.js`, pas éparpillées dans le code
- Les tâches programmées (rappels, nettoyage) sont **persistantes** : si le bot redémarre, elles sont reprogrammées au boot
- `.env` ne doit **jamais** être commit sur Git
