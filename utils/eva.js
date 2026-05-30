const config = require('../config');

function getBaseUrl() {
  const base = config.EVA_API_BASE_URL || process.env.EVA_API_BASE_URL || '';
  if (!base) {
    throw new Error('EVA_API_BASE_URL non configurée. Ajoute-la dans .env ou config.js.');
  }
  return base.replace(/\/+$/, '');
}

function getHeaders() {
  const headers = { Accept: 'application/json' };
  const token = config.EVA_API_TOKEN || process.env.EVA_API_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function callEva(endpoint) {
  const url = `${getBaseUrl()}${endpoint}`;
  const response = await fetch(url, { headers: getHeaders() });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`EVA API error ${response.status}: ${text}`);
  }

  return response.json();
}

async function getPlayerStats(player, season = 'current') {
  const encodedPlayer = encodeURIComponent(player);
  return callEva(`/players/${encodedPlayer}?season=${season}`);
}

async function getTeamStats(team, season = 'current') {
  const encodedTeam = encodeURIComponent(team);
  return callEva(`/teams/${encodedTeam}?season=${season}`);
}

module.exports = {
  getPlayerStats,
  getTeamStats,
};
