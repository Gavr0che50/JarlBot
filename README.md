# 🤖 JarlBot V1.7.3

Bot Discord open source pour gérer des **défis d'équipes**, des **sessions spéciales** et des **statistiques EVA**.

Création automatique de **salons privés**, **événements Discord**, **rappels programmés** (48h en MP, 24h et 1h dans le salon), validation par votes, et nettoyage automatique après les matchs.

> **Avant toute installation sur un autre serveur, crée ton propre bot Discord dans le Portail Développeurs.**
> Guides complets : [installation Windows](INSTALLATION-WINDOWS.md) et [installation Linux](INSTALLATION-LINUX.md). Ils couvrent la création de l'application, les intents, les permissions, le rôle du bot, les rôles d'équipes et l'export portable.
>
> IMPORTANT — utilise un bot que tu contrôles : ne partage pas le `DISCORD_TOKEN`, et ne tente pas d'utiliser un token tiers. Le launcher ne génère plus de lien d'invitation côté interface : crée et invite ton application depuis le portail développeur.

---

## ✨ Fonctionnalités

### ⚔️ Défis d'équipes
- **`/mix`** — Match amical entre deux équipes
- **`/scrim`** — Match d'entraînement compétitif
- **`/free`** — Recherche libre de joueurs avec niveau attendu imposé
- Validation par votes ✅ de l'équipe adverse (seuil configurable)
- Refus possible par votes ❌ sur le message de validation, avec le même seuil que l'acceptation
- Création automatique d'un **salon privé** réservé aux participants
- Nommage des salons privés: `type-equipe1-vs-equipe2-date` pour les matchs, `free-date-heure` et `typedesession-date-heure` pour les frees/sessions
- Création automatique d'un **événement Discord** (visible dans la barre latérale)
- Bouton d'annulation dans le salon privé, avec confirmation en deux clics avant suppression
- **Rappels programmés** :
  - 48h avant → MP aux joueurs qui ont réagi ⏰
  - 24h avant → message dans le salon privé
  - 1h avant → message dans le salon privé
- Nettoyage automatique du salon 48h après le match

**TOUT LES TIMINGS SONT MODIFIABLES DANS LE CONFIG.JS**

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
  - `MESSAGE CONTENT INTENT` conseillé
- Une **catégorie Discord** où le bot créera les salons privés

---

## 🚀 Installation

### Option simple avec interface graphique

Sur Windows, double-clique sur **`JarlBot Launcher.cmd`**.

Sur Linux, lance :

```bash
chmod +x launcher.sh
./launcher.sh
```

Le launcher:
- installe les dependances si `node_modules` est absent;
- ouvre une interface locale sombre, pensée pour une prise en main rapide;
- sauvegarde les IDs Discord dans `.env`;
- lance le bot et enregistre les commandes slash en une seule action;
- affiche les logs utiles du bot et du launcher;
- garde une UX simple pour un administrateur non technique.

La création et l'invitation du bot se font depuis le portail Discord. Suis [INSTALLATION-WINDOWS.md](INSTALLATION-WINDOWS.md) ou [INSTALLATION-LINUX.md](INSTALLATION-LINUX.md) pour ne pas oublier les scopes, permissions et intents.

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

Les commandes lisent SQLite d'abord. Si une donnee manque ou depasse 24h, le moteur EVA v2 rafraichit les donnees utiles depuis le bot. Le script `npm run eva-refresh` reste disponible pour precharger ou reconstruire la base manuellement, mais il n'y a plus de worker public separe.

### 3. Configurer les variables d'environnement

Crée un fichier `.env` à la racine du projet :

```env
DISCORD_TOKEN=ton_token_secret
CLIENT_ID=id_de_ton_application
GUILD_ID=id_de_ton_serveur
CATEGORIE_DEFIS_ID=id_de_la_categorie_pour_les_salons
JARLBOT_MODE=prod
EVA_COMPETITIVE_API_BASE_URL=https://competitive.eva.gg/api
EVA_GRAPHQL_URL=https://api.eva.gg/graphql
EVA_LOCAL_LEAGUES_CIRCUIT_ID=2395738311350114303
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

### Precharger la base sans lancer le bot
```bash
npm run eva-refresh
```

Cette commande appelle le moteur EVA v2 et remplit `eva-cache.db` sans démarrer Discord. Le bot fait aussi ce refresh au démarrage puis périodiquement. Pour repartir d'une base EVA propre:

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
- `INSTALLATION-WINDOWS.md`, `INSTALLATION-LINUX.md`, `README.md` et `troubleshoot.md`;
- la licence MIT;
- `eva-cache.db` si elle existe;
- `bot-state.db` si elle existe;
- un `README-PORTABLE.txt`.

L'export ne copie pas ton `.env` pour eviter de fuiter le token Discord. L'utilisateur final le remplit depuis le launcher.

Le moteur EVA v2 respecte les contraintes observees de l'API Competitive: ranges de 50 elements maximum, derniere page bornee au total exact, cadence configurable et timeout par appel.

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
| `JARLBOT_MODE` | `prod` par défaut, ou `test` pour valider/refuser/lancer les salons avec une seule personne et des rappels raccourcis |
| `RAPPEL_MP_AVANT_MATCH` | Délai du rappel MP (par défaut 48h) |
| `RAPPEL_24H_AVANT_MATCH` | Rappel dans le salon (24h avant) |
| `RAPPEL_1H_AVANT_MATCH` | Rappel dans le salon (1h avant) |
| `DELAI_SUPPRESSION_SALON` | Délai avant suppression du salon (48h après) |
| `EVA_TEAM_LINEUP_DISPLAY_LIMIT` | Nombre max de joueurs affichés dans une lineup équipe |
| `EVA_TOP_PLAYERS_LIMIT` | Nombre max de joueurs affichés par `/top` |
| `EVA_PLANNING_WINDOW_DAYS` | Fenêtre temporelle affichée par `/planning` |
| `EVA_COMPETITIVE_API_BASE_URL` | URL de base de l'API EVA Competitive |
| `EVA_GRAPHQL_URL` | Endpoint GraphQL public utilisé par app.eva.gg |
| `EVA_LOCAL_LEAGUES_CIRCUIT_ID` | Circuit Local Leagues EVA utilisé pour découvrir les tournois locaux |
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
├── launcher.sh             ← Lanceur Linux
├── LICENSE                 ← Licence MIT open source
├── config.js               ← Configuration éditable
├── deploy-commands.js      ← Enregistrement des commandes slash
├── index.js                ← Code principal du bot
├── bot-state.db             ← Données des défis et sessions (SQLite)
├── eva-cache.db            ← Base locale SQLite du cache EVA
├── scripts/
│   ├── launcher.js         ← Interface graphique locale d'administration
│   ├── export-portable.js  ← Génère un dossier portable avec la DB
│   └── eva-refresh.js      ← Préchargement / reset manuel du moteur EVA v2
└── utils/
    └── eva-v2.js           ← Moteur EVA v2 rapide et différentiel
```

---

## 🔐 Permissions Discord requises

Le bot doit avoir ces permissions sur ton serveur :

- `Manage Channels` : créer/supprimer les salons privés
- `Manage Events` : créer/supprimer les événements Discord
- `Send Messages` et `Read Message History`
- `Add Reactions`
- `Mention Everyone` : mentionner les rôles d'équipes
- `View Channels`

Le rôle du bot doit être placé au-dessus des rôles qu'il doit mentionner ou gérer. Les rôles d'équipes doivent être attribués aux joueurs, car les votes de validation sont filtrés par rôle adverse.

---

## 🧪 Mode Test

Le mode test se règle dans le launcher avec **Mode de fonctionnement > Test**, ou dans `.env` :

```env
JARLBOT_MODE=test
```

En mode test :
- un seul vote ✅ valide un `/mix` ou `/scrim`, sans filtrage par rôle adverse;
- un seul vote ❌ refuse un `/mix` ou `/scrim`;
- un `/free` se lance dès qu'une personne participe;
- une `/session` se lance dès qu'une personne clique sur **Je participe**;
- les rappels sont raccourcis pour être testables: MP à 2 minutes, salon à 90 secondes et 30 secondes avant l'horaire, nettoyage 5 minutes après.

Procédure de test conseillée :
1. Mets `JARLBOT_MODE=test`, puis relance le bot.
2. Crée un `/mix` prévu dans 3 à 5 minutes, puis réagis avec ✅. Vérifie le salon privé, l'événement Discord et le bouton d'annulation.
3. Crée un autre `/mix`, puis réagis avec ❌. Vérifie que le défi est refusé.
4. Crée un `/free`, réagis avec ✅. Vérifie le salon privé et le rappel MP avec ⏰.
5. Crée une `/session` avec `joueurs: 2`, clique seul sur **Je participe**. En mode test, elle doit quand même créer le salon.
6. Clique sur **Annuler le match** dans un salon privé, puis reclique pour confirmer la suppression.

Repasse ensuite en `JARLBOT_MODE=prod`. En prod, la validation redevient stricte: seuls les membres du rôle adverse sont comptés, avec un seuil automatique de 1 à 4 votes selon le nombre de membres du rôle.

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
- Les commandes EVA utilisent un mode hybride: lecture locale d'abord, refresh intégré au moteur si la donnée est absente ou plus vieille que 24h
- Le cache joueurs ne contient pas tous les comptes EVA, mais les joueurs compétitifs dont le profil public a pu être résolu
- Les constantes que tu veux ajuster à la main doivent rester dans `config.js`, pas éparpillées dans le code
- Les tâches programmées (rappels, nettoyage) sont **persistantes** : si le bot redémarre, elles sont reprogrammées au boot
- `.env` ne doit **jamais** être commit sur Git
