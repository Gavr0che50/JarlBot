# Commandes JarlBot

Cette page resume les commandes slash disponibles dans Discord. Les commandes EVA utilisent l'autocompletion quand le cache local connait des joueurs, equipes, villes ou sites.

## Utilitaires

| Commande | Description |
| --- | --- |
| `/help` | Affiche le guide des commandes dans Discord. |
| `/ping` | Verifie que le bot repond. |
| `/planning` | Affiche les matchs, sessions et evenements Discord prevus. |

## Matchs EVA

### `/mix`

Cree une proposition de match mix entre deux equipes.

Options principales :

- `nombre-matchs` : nombre de matchs a jouer, de 1 a 10 ;
- `date` : format `JJ/MM/AAAA` ;
- `heure` : format `HH:MM` ;
- `mon-equipe` : role Discord de ton equipe ;
- `adversaire` : role Discord de l'equipe defiee.

L'auteur doit posseder le role `mon-equipe`. L'equipe adverse valide ou refuse avec les reactions Discord. Une fois valide, JarlBot cree le salon prive, l'evenement Discord, les rappels et le bouton d'annulation.

### `/scrim`

Cree une proposition de scrim entre deux equipes.

Les options sont les memes que `/mix`, avec en plus un niveau attendu quand la commande le propose.

### `/free`

Propose une session ouverte a plusieurs joueurs.

Options principales :

- `nombre-joueurs` : quota attendu, de 1 a 10 ;
- `date` : format `JJ/MM/AAAA` ;
- `heure` : format `HH:MM` ;
- `niveau-attendu` : `Debutant`, `Intermediaire` ou `Confirme`.

Les joueurs rejoignent avec reaction. Le salon prive est cree quand le quota est atteint.

### `/renfort`

Invite un joueur dans un salon prive existant.

Options :

- `joueur` : membre Discord a inviter ;
- `equipe` : role Discord de l'equipe qui demande le renfort.

La commande doit etre lancee par un administrateur ou par une personne autorisee dans le contexte du defi ou de la session.

## Sessions communautaires

### `/session`

Cree une session communautaire reservee aux administrateurs.

Options :

- `type` : `Nocturne`, `Matinale` ou `Evenement special` ;
- `joueurs` : nombre de joueurs requis ;
- `date` : format `JJ/MM/AAAA` ;
- `heure` : format `HH:MM` ;
- `description` : informations complementaires facultatives.

Les joueurs rejoignent ou quittent la session avec les boutons `Je participe` et `Me retirer`. Le salon prive est cree quand le quota est atteint.

## Donnees EVA

Les commandes suivantes s'appuient sur `eva-cache.db`. Si le cache est vide ou en refresh, JarlBot repond immediatement que les donnees sont en cours de mise a jour.

| Commande | Description |
| --- | --- |
| `/stat` | Affiche les statistiques EVA d'un joueur competitif public. |
| `/stat-equipe` | Affiche les statistiques EVA d'une equipe. |
| `/classement` | Affiche un classement EVA local pour une salle ou une ville. |
| `/top` | Affiche le top joueurs EVA depuis la major league. |
| `/top-equipe` | Affiche le top equipes EVA depuis la major league. |
| `/tournoi` | Affiche les prochains tournois EVA pour un site ou une ville. |

### Badges EVA

JarlBot recupere les badges exposes par EVA et les affiche dans les embeds quand ils sont disponibles :

- badge d'equipe pour `/stat`, `/stat-equipe`, `/top` et `/top-equipe` ;
- badge de salle, region ou league pour `/classement` ;
- badge de tournoi ou de circuit pour `/tournoi`.

Discord ne permet pas d'afficher facilement un badge different devant chaque ligne d'un message texte sans emojis serveur. JarlBot affiche donc le badge le plus pertinent dans l'auteur/thumbnail de l'embed.

### `/stat`

`/stat` cherche le joueur dans l'index competitif local, puis lit ses stats via le profil public EVA.

Details importants :

- le KDA affiche est celui de la saison en cours ;
- les statistiques all-time sont aussi recuperees, mais servent surtout au total de matchs affiche ;
- si les stats ne sont pas encore en cache, JarlBot tente une recuperation a la demande ;
- la phrase de performance compare le joueur aux coequipiers publics disponibles, apres hydratation des stats manquantes du roster ;
- les comparaisons de kills, assists, degats, morts et victoires sont faites au rythme par match quand c'est pertinent ;
- si le profil EVA est prive ou introuvable cote API publique, JarlBot affiche une carte avec les infos competitives connues et le badge d'equipe si possible.

### `/stat-equipe`

Affiche la salle/ville, la league, les points de saison, le bilan victoires/nuls/defaites, la tendance et le roster connu.

### `/classement`

Affiche les classements locaux connus pour une ville ou une salle EVA. Les equipes sont triees par ranking, rang et points.

### `/top`

Affiche les meilleurs joueurs major league selon le KDA de saison en cours parmi les joueurs dont le profil public EVA est exploitable.

### `/top-equipe`

Affiche le top des equipes major league avec points, bilan, difference de score et tendance.

### `/tournoi`

Affiche les prochains tournois locaux d'un site ou d'une ville, avec dates, niveau, statut et prochaines rencontres quand elles sont connues.

## Mode test

Avec `JARLBOT_MODE=test`, les validations sont volontairement raccourcies :

- un vote suffit pour accepter ou refuser un `/mix` ou `/scrim` ;
- un participant suffit pour declencher un `/free` ;
- une inscription suffit pour declencher une `/session` ;
- les rappels et le nettoyage sont acceleres.

Ce mode est pratique pour verifier une installation. Il ne doit pas rester actif en production.
