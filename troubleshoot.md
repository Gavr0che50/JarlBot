# Depannage JarlBot

Cette page regroupe les pannes les plus frequentes apres installation.

## Verifications rapides

Lance d'abord :

```bash
node -v
npm -v
npm run check
```

Puis verifie que `.env` contient bien :

```env
DISCORD_TOKEN=...
CLIENT_ID=...
GUILD_ID=...
CATEGORIE_DEFIS_ID=...
JARLBOT_MODE=prod
```

## Erreurs courantes

| Symptome | Cause probable | Solution |
| --- | --- | --- |
| `node` n'est pas reconnu | Node.js absent du PATH | Installe Node.js 24+, ferme puis rouvre le terminal. |
| `Cannot find module 'discord.js'` | Dependances absentes | Lance `npm install`. |
| `TokenInvalid` ou `Invalid token` | Token Discord incorrect | Verifie `DISCORD_TOKEN` ou regenere le token. |
| `Used disallowed intents` | Intents Discord non actives | Active `Server Members Intent` et `Message Content Intent` dans le portail Discord Developer. |
| Les slash commands n'apparaissent pas | Commandes non deployees ou mauvais `GUILD_ID` | Lance `npm run deploy-commands`, puis verifie `CLIENT_ID` et `GUILD_ID`. |
| `Missing Permissions` | Permissions OAuth ou role bot insuffisants | Redonne au bot les permissions de gestion des salons, roles, evenements et messages. |
| Salon prive non cree | Mauvais `CATEGORIE_DEFIS_ID` ou permissions categorie | Recopie l'ID de la categorie et verifie `Manage Channels`. |
| Les commandes EVA repondent que le cache se met a jour | Import EVA en cours | Attends la fin du refresh. L'import initial prend environ 10 minutes, ou lance `npm run eva-refresh`. |
| `/stat` indique que le profil est prive | Le profil public EVA du joueur n'expose pas ses stats | Ce n'est pas une panne du bot. JarlBot affiche les infos competitives connues et le badge d'equipe si possible. |
| `/stat` indique `User not found` | L'identifiant competitif EVA ne correspond pas a un profil public exploitable | Attends un refresh si le joueur vient de changer de nom. Sinon la stats publique EVA n'est pas disponible pour ce joueur. |
| Badges EVA absents | EVA ne fournit pas de logo pour cette equipe, salle ou tournoi, ou le cache n'a pas encore ete rafraichi | Lance `npm run eva-refresh` ou `npm run eva-refresh:full`. |
| Port du launcher deja utilise | Un ancien launcher tourne encore | Ferme l'ancien process ou change le port du launcher. |

## Logs utiles

Depuis le launcher, consulte les logs integres. En local, les fichiers les plus utiles sont :

- `logs/bot.out.log` : sortie standard du bot ;
- `logs/bot.err.log` : erreurs du bot ;
- `logs/eva-refresh.out.log` : refresh du cache EVA ;
- `logs/eva-refresh.err.log` : erreurs de refresh EVA.

## Reinstaller les dependances

Sous Linux/macOS :

```bash
rm -rf node_modules
npm install
```

Sous Windows PowerShell :

```powershell
Remove-Item -Recurse -Force node_modules
npm install
```

## Reconstruire le cache EVA

Refresh simple :

```bash
npm run eva-refresh
```

Refresh complet :

```bash
npm run eva-refresh:full
```

Reset complet :

```bash
npm run eva-refresh:reset
```

Le reset supprime puis reconstruit les donnees EVA locales. Utilise-le seulement si le cache semble incoherent ou trop ancien.

## Repartir en mode test

Pour valider l'installation sans attendre les seuils de production :

```env
JARLBOT_MODE=test
```

Redemarre ensuite le bot, teste `/ping`, puis cree un `/mix`, un `/free` ou une `/session`. Repasse en `prod` avant l'usage reel.
