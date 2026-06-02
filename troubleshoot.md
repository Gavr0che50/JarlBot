# Dépannage JarlBot

Cette page regroupe les pannes les plus fréquentes après installation.

## Vérifications rapides

Lance d'abord :

```bash
node -v
npm -v
npm run check
```

Puis vérifie que `.env` contient bien :

```env
DISCORD_TOKEN=...
CLIENT_ID=...
GUILD_ID=...
CATEGORIE_DEFIS_ID=...
JARLBOT_MODE=prod
```

## Erreurs courantes

| Symptôme | Cause probable | Solution |
| --- | --- | --- |
| `node` n'est pas reconnu | Node.js absent du PATH | Installe Node.js 24+, ferme puis rouvre le terminal. |
| `Cannot find module 'discord.js'` | Dépendances absentes | Lance `npm install`. |
| `TokenInvalid` ou `Invalid token` | Token Discord incorrect | Vérifie `DISCORD_TOKEN` ou régénère le token. |
| `Used disallowed intents` | Intents Discord désactivés | Active `Server Members Intent` dans le portail Discord. |
| Les slash commands n'apparaissent pas | Commandes non déployées ou cache Discord | Lance `npm run deploy-commands`, puis redémarre Discord si besoin. |
| `Missing Permissions` | Permissions OAuth ou rôle bot insuffisants | Vérifie les permissions, puis remonte le rôle du bot dans Discord. |
| Salon privé non créé | Mauvais `CATEGORIE_DEFIS_ID` ou permissions catégorie | Recopie l'ID de la catégorie et vérifie `Manage Channels`. |
| Les votes ne comptent pas | Rôles d'équipe absents ou mauvais rôle sélectionné | Vérifie que les joueurs possèdent les rôles attendus. |
| Le launcher ne s'ouvre pas | Port occupé ou ouverture navigateur désactivée | Change `JARLBOT_LAUNCHER_PORT` ou ouvre l'URL manuellement. |
| Les commandes EVA répondent que le cache se met à jour | Import EVA en cours | Attends la fin du refresh. L'import initial prend environ 10 minutes, ou lance `npm run eva-refresh`. |

## Logs

Le launcher écrit les logs dans `logs/` :

- `logs/launcher.log` : événements du launcher ;
- `logs/bot.out.log` : sortie standard du bot ;
- `logs/bot.err.log` : erreurs du bot ;
- `logs/eva-refresh.out.log` : refresh du cache EVA.

Ces fichiers sont ignorés par Git.

## Réinstaller proprement les dépendances

Si les dépendances semblent incohérentes :

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

## Repartir en mode test

Pour valider l'installation sans attendre les seuils de production :

```env
JARLBOT_MODE=test
```

Redémarre ensuite le bot, teste `/ping`, puis crée un `/mix`, un `/free` ou une `/session`. Repasse en `prod` avant l'usage réel.
