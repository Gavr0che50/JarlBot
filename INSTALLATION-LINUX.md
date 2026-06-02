# Installation Linux de JarlBot

Ce guide installe JarlBot sur Linux avec le launcher local.

## 1. Prerequis

- Une machine Linux avec acces internet.
- Node.js 24+ avec npm.
- Un bot Discord cree dans le portail developpeur.
- Une categorie Discord dediee aux salons de match.

## 2. Installer Node.js 24+

Sur Debian/Ubuntu, le plus simple est NodeSource :

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

Sur Fedora :

```bash
sudo dnf install -y nodejs npm
node -v
npm -v
```

Verifie que `node -v` affiche `v24.x` ou plus.

## 3. Recuperer JarlBot

Depuis le depot :

```bash
git clone https://github.com/Gavr0che50/JarlBot.git
cd JarlBot
```

Depuis un export portable, decompresse l'archive puis entre dans le dossier :

```bash
cd JarlBot-portable-...
```

## 4. Lancer le launcher Linux

Rends le script executable, puis lance-le :

```bash
chmod +x launcher.sh
./launcher.sh
```

Le script :
- arrete les anciennes instances JarlBot lancees en Node;
- verifie Node.js 24+ et npm;
- installe les dependances si `node_modules` est absent;
- demarre l'interface locale du launcher.

Par defaut, le launcher essaie d'ouvrir le navigateur sur `http://localhost:3050`. Si la machine est un serveur sans interface graphique :

```bash
JARLBOT_LAUNCHER_NO_OPEN=1 ./launcher.sh
```

Puis ouvre depuis ton poste :

```text
http://IP_DU_SERVEUR:3050
```

Si le port 3050 est deja pris, le launcher essaie les ports suivants.

## 5. Configurer Discord

Dans le launcher, renseigne :

- `DISCORD_TOKEN`
- `CLIENT_ID`
- `GUILD_ID`
- `CATEGORIE_DEFIS_ID`
- le mode `prod` ou `test`

Le mode `test` permet de valider/refuser/lancer les salons avec une seule personne et des rappels raccourcis. Repasse en `prod` avant l'utilisation reelle.

## 6. Installer le bot dans Discord

Suis les memes permissions que sous Windows :

- scopes OAuth2 : `bot` et `applications.commands`;
- permissions : `Manage Channels`, `Manage Events`, `Send Messages`, `Read Message History`, `Add Reactions`, `Mention Everyone`, `View Channels`;
- intents : `Server Members Intent`, `Message Content Intent` conseille;
- role du bot place au-dessus des roles d'equipes.

Les details sont dans [INSTALLATION-WINDOWS.md](INSTALLATION-WINDOWS.md), section portail Discord. Les etapes Discord sont identiques sur Linux.

## 7. Test rapide

1. Mets le launcher en mode `test`.
2. Clique sur **Sauvegarder et lancer**.
3. Dans Discord, teste `/ping`.
4. Cree un `/mix` dans 3 a 5 minutes, puis reagis avec ✅.
5. Verifie le salon prive, l'evenement Discord, les rappels et le bouton d'annulation.
6. Teste `/stat`, `/top`, `/classement` et `/tournoi site:`.
7. Repasse en mode `prod`.

Au premier lancement sans `eva-cache.db`, JarlBot cree et peuple la base EVA. Pendant cet import, les commandes EVA indiquent qu'une mise a jour est en cours. Si `eva-cache.db` existe deja, aucun refresh n'est lance au demarrage; le refresh differentiel tourne ensuite toutes les 12h.

## 8. Commandes utiles

Lancer sans interface graphique :

```bash
JARLBOT_LAUNCHER_NO_OPEN=1 ./launcher.sh
```

Lancer directement le bot sans launcher :

```bash
npm install
npm run deploy-commands
npm start
```

Precharger le cache EVA :

```bash
npm run eva-refresh
```

Repartir d'un cache EVA propre :

```bash
npm run eva-refresh:reset
```
