# JarlBot

Bot Discord de gestion de défis d'équipes avec création de salons privés, rappels et événements.

## Prérequis

- Node.js 18+ installé
- Un bot Discord avec token, application client ID et guild ID
- Un canal de catégorie Discord pour créer les salons privés

## Installation

```bash
npm install
```

## Configuration

Dupliquez `.env.example` en `.env` et remplissez les variables :

```env
DISCORD_TOKEN=...
CLIENT_ID=...
GUILD_ID=...
CATEGORIE_DEFIS_ID=...
```

## Commandes disponibles

- `npm run deploy-commands` — enregistre les commandes slash sur le serveur
- `npm start` — démarre le bot

## Commandes slash

- `/ping` — vérifie que le bot répond
- `/defi` — lance un défi entre deux rôles d'équipe

## Notes

- `.env` est ignoré par Git par défaut
- Les défis sont sauvegardés localement dans `defis.json`
- Le bot crée un salon privé et un événement Discord après validation du défi
