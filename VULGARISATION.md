# Vulgarisation JarlBot

Ce fichier explique le projet avec des mots simples.

## Vue Globale

JarlBot est un bot Discord Node.js. Il ecoute les commandes slash comme `/stat`, `/stat-equipe`, `/classement`, `/top` et `/top-equipe`, puis il repond avec des donnees EVA.

La regle importante: une commande Discord doit repondre vite. On ne veut donc pas reconstruire toute la base EVA pendant qu'un utilisateur attend.

## Interface Graphique Locale

Le fichier `scripts/launcher.js` demarre une petite interface web locale.

Elle sert a administrer le bot sans terminal:
- remplir les IDs Discord;
- sauvegarder `.env`;
- generer le lien d'invitation;
- deployer les commandes slash;
- lancer ou arreter le bot;
- lancer un refresh EVA;
- lire les logs;
- exporter un dossier portable.

Sous Windows, le fichier `JarlBot Launcher.cmd` permet de lancer cette interface en double-clic.

Le launcher ne copie jamais automatiquement le `.env` dans un export portable, parce que ce fichier peut contenir le token Discord.

## Moteur EVA V2

Le nouveau moteur est dans `utils/eva-v2.js`.

Il utilise deux sources principales:
- `https://competitive.eva.gg/api` pour les rankings, equipes, rosters, participants et matches.
- `https://api.eva.gg/graphql` pour les statistiques publiques des joueurs quand un identifiant complet `Pseudo#123456` est connu.

Les donnees utiles sont stockees dans `eva-cache.db`, une base SQLite locale.

## Ce Que Contient Le Cache

`eva-cache.db` contient notamment:
- les salles EVA visibles;
- les rankings local leagues;
- les equipes EVA;
- les lignes de classement par equipe;
- les rosters d'equipes;
- les joueurs trouves dans les rosters et en major league;
- les stats publiques des joueurs hydratables;
- les stats calculees des equipes major league.

## Pourquoi SQLite

SQLite est un bon compromis ici:
- lecture tres rapide pour les commandes Discord;
- un seul fichier facile a sauvegarder;
- moins fragile qu'un gros JSON;
- requetes efficaces pour chercher un joueur, une equipe ou une ville;
- refresh differentiel possible sans tout recalculer.

## Refresh

Le refresh principal est:

```bash
npm run eva-refresh
```

Le refresh complet avec reset est:

```bash
npm run eva-refresh:reset
```

Le bot lance aussi ce refresh au demarrage puis periodiquement. En cycle normal, le moteur rafraichit les donnees vieilles de plus de 24h. En mode `--full`, il peut parcourir tous les rosters connus.

## Commandes EVA

### `/stat`

Affiche les stats d'un joueur:
- pseudo public si resolu;
- equipe;
- ligue locale;
- rang local de son equipe;
- KDA;
- matchs joues;
- kills, deaths, assists;
- tendance vs saison precedente.

Si le discriminant n'est pas donne, le bot cherche le meilleur match local dans SQLite.

### `/stat-equipe`

Affiche les stats d'une equipe:
- salle / ville;
- ligue locale;
- rang local;
- points saison;
- bilan W/D/L;
- roster;
- tendance vs saison precedente.

### `/classement`

Affiche les rankings d'une ville ou salle EVA. Les equipes sont triees par points.

### `/top`

Affiche les meilleurs joueurs issus de la major league. Le classement utilise les stats publiques hydratees dans SQLite, puis trie par KDA.

### `/top-equipe`

Affiche les meilleures equipes major league. Le classement est calcule localement depuis les matches: points, victoires, nuls, defaites et difference de score.

## Limites Connues

L'API GraphQL publique peut lire un profil public si on connait son `username#discriminant`.

En revanche, l'annuaire global des utilisateurs n'est pas lisible avec le token actuel. C'est pour ca que le bot indexe les joueurs via:
- rosters competitive;
- participants major league;
- anciens joueurs deja connus.

Si un joueur n'apparait dans aucun roster connu et que son discriminant est inconnu, il peut rester introuvable.

## Variables Utiles

- `EVA_V2_CACHE_TTL_MS`: fraicheur du cache, 24h par defaut.
- `EVA_V2_MIN_INTERVAL_MS`: pause entre deux appels EVA.
- `EVA_V2_HTTP_TIMEOUT_MS`: timeout d'un appel EVA.
- `EVA_V2_TEAM_MEMBER_REFRESH_LIMIT`: rosters rafraichis en cycle normal.
- `EVA_V2_TEAM_MEMBER_FULL_REFRESH_LIMIT`: rosters rafraichis en cycle full.
- `EVA_V2_MAJOR_PLAYER_REFRESH_LIMIT`: joueurs major hydrates en cycle normal.
- `EVA_V2_MAJOR_PLAYER_FULL_REFRESH_LIMIT`: joueurs major hydrates en cycle full.
- `EVA_V2_COMMAND_PLAYER_HYDRATE_LIMIT`: petite marge d'hydratation en direct si `/top` manque de donnees.

## Reflexe De Debug

1. Si une commande ne trouve pas un joueur, verifier d'abord si le joueur est dans `eva_v2_players`.
2. Si une equipe est absente, verifier `eva_v2_teams`.
3. Si une ville ne sort rien, verifier `eva_v2_rankings`.
4. Si le cache semble sale, lancer `npm run eva-refresh:reset`.
5. Si Discord ne voit pas une nouvelle commande, lancer `npm run deploy-commands`.
