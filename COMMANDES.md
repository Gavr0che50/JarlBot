# Commandes Discord

Cette page décrit les slash commands exposées par JarlBot.

## Utilitaires

| Commande | Description |
| --- | --- |
| `/help` | Affiche le guide des commandes dans Discord. |
| `/ping` | Vérifie que le bot répond. |
| `/planning` | Affiche les matchs et sessions planifiés. |

## Matchs EVA

### `/mix`

Crée une proposition de match mix entre deux équipes.

Options principales :

- `nombre-matchs` : nombre de matchs à jouer, de 1 à 10.
- `date` : date au format `JJ/MM/AAAA`.
- `heure` : heure au format `HH:MM`.
- `mon-equipe` : rôle Discord de l'équipe qui propose.
- `adversaire` : rôle Discord de l'équipe défiée.

Le joueur qui lance la commande doit posséder le rôle indiqué dans `mon-equipe`.

### `/scrim`

Crée une proposition de scrim entre deux équipes.

Options principales :

- `nombre-matchs` : nombre de matchs à jouer, de 1 à 10.
- `date` : date au format `JJ/MM/AAAA`.
- `heure` : heure au format `HH:MM`.
- `mon-equipe` : rôle Discord de l'équipe qui propose.
- `adversaire` : rôle Discord de l'équipe défiée.

Le fonctionnement de validation est identique à `/mix`.

### `/free`

Crée une proposition ouverte à plusieurs joueurs.

Options principales :

- `nombre-joueurs` : nombre de joueurs attendus, de 2 à 10.
- `date` : date au format `JJ/MM/AAAA`.
- `heure` : heure au format `HH:MM`.
- `niveau-attendu` : `Débutant`, `Intermédiaire` ou `Confirmé`.

L'auteur est inscrit automatiquement. Le salon privé est créé quand le quota est atteint.

### `/renfort`

Invite un joueur dans un salon privé.

Options principales :

- `joueur` : joueur à inviter.
- `equipe` : rôle de l'équipe qui demande le renfort.

## Sessions communautaires

### `/session`

Crée une session spéciale. La commande est réservée aux administrateurs Discord.

Options principales :

- `type` : `Nocturne`, `Matinale` ou `Événement spécial`.
- `joueurs` : nombre de joueurs requis, de 1 à 50.
- `date` : date au format `JJ/MM/AAAA`.
- `heure` : heure au format `HH:MM`.
- `description` : informations complémentaires affichées aux joueurs.

Les joueurs rejoignent ou quittent la session avec les boutons Discord. Le salon privé est créé quand le quota est atteint.

## Données EVA

| Commande | Description |
| --- | --- |
| `/stat` | Affiche les statistiques EVA d'un joueur compétitif public. |
| `/stat-equipe` | Affiche les statistiques EVA d'une équipe. |
| `/classement` | Affiche un classement EVA local. |
| `/top` | Affiche le top des joueurs EVA. |
| `/top-equipe` | Affiche le top des équipes EVA. |
| `/tournoi` | Affiche les prochains tournois EVA pour un site ou une ville. |

Les commandes EVA s'appuient sur `eva-cache.db`. Si le cache est vide ou en refresh, le bot prévient que les données sont en cours de mise à jour.

## Mode test

Avec `JARLBOT_MODE=test`, les validations sont volontairement raccourcies :

- un vote suffit pour accepter ou refuser un `/mix` ou `/scrim` ;
- un participant suffit pour déclencher un `/free` ;
- une inscription suffit pour déclencher une `/session` ;
- les rappels et le nettoyage sont accélérés.

Ce mode est pratique pour vérifier une installation. Il ne doit pas rester actif en production.
