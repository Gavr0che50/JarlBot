require('dotenv').config();

const config = require('../config');
const {
  ensureEvaV2Fresh,
  getEvaV2Status,
  refreshMajorPlayerStats,
  resetEvaV2Cache,
} = require('../utils/eva-v2');

const isDaemon = process.argv.includes('--daemon') || process.env.EVA_REFRESH_DAEMON === '1';
const isFull = process.argv.includes('--full') || process.env.EVA_REFRESH_FULL === '1';
const shouldReset = process.argv.includes('--reset') || process.env.EVA_REFRESH_RESET === '1';
const refreshMs = Number(
  process.env.EVA_V2_CACHE_TTL_MS ||
  config.EVA_V2_CACHE_TTL_MS ||
  24 * 60 * 60 * 1000
);

function log(message) {
  console.log(`[EVA-V2-WORKER] ${message}`);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runRefresh(cycle) {
  const startedAt = Date.now();
  log(`Cycle ${cycle} demarre${isFull ? ' en mode full' : ''}.`);

  const before = getEvaV2Status();
  log(
    `Avant: locations=${before.locations} rankings=${before.rankings} ` +
    `teams=${before.teams} players=${before.players} majorTeams=${before.majorTeams}`
  );

  let status = await ensureEvaV2Fresh({ force: true, full: isFull });
  const majorHydrated = await refreshMajorPlayerStats({ full: isFull });
  status = getEvaV2Status();
  const duration = Date.now() - startedAt;
  log(
    `Cycle ${cycle} termine en ${Math.round(duration / 1000)}s | ` +
    `locations=${status.locations} rankings=${status.rankings} teams=${status.teams} ` +
    `rankingItems=${status.rankingItems} players=${status.players} majorTeams=${status.majorTeams} ` +
    `majorPlayersHydrated=${majorHydrated}`
  );
  return status;
}

async function main() {
  log(`Mode ${isDaemon ? 'daemon' : 'one-shot'} | intervalle ${refreshMs} ms`);

  if (shouldReset) {
    log('Reset demande: tables EVA v2 et cache local vides.');
    resetEvaV2Cache({ clearLegacy: true });
  }

  let cycle = 1;
  await runRefresh(cycle++);
  if (!isDaemon) return;

  while (true) {
    log(`Pause ${refreshMs} ms avant le prochain cycle.`);
    await wait(refreshMs);
    try {
      await runRefresh(cycle++);
    } catch (err) {
      log(`Cycle ${cycle - 1} en erreur: ${err.message}`);
    }
  }
}

process.on('SIGINT', () => {
  log('Arret demande (SIGINT).');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Arret demande (SIGTERM).');
  process.exit(0);
});

main().catch(err => {
  console.error('[EVA-V2-WORKER] Arret fatal:', err);
  process.exit(1);
});
