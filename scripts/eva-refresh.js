require('dotenv').config();
const {
  ensureEvaV2Fresh,
  getEvaV2Status,
  resetEvaV2Cache,
} = require('../utils/eva-v2');

const isFull = process.argv.includes('--full') || process.env.EVA_REFRESH_FULL === '1';
const shouldReset = process.argv.includes('--reset') || process.env.EVA_REFRESH_RESET === '1';

function log(message) {
  console.log(`[EVA-V2-WORKER] ${message}`);
}

async function runRefresh(cycle) {
  const startedAt = Date.now();
  log(`Cycle ${cycle} demarre${isFull ? ' en mode full' : ''}.`);

  const before = getEvaV2Status();
  log(
    `Avant: locations=${before.locations} rankings=${before.rankings} ` +
    `teams=${before.teams} players=${before.players} majorTeams=${before.majorTeams}`
  );

  await ensureEvaV2Fresh({ force: true, full: isFull, kind: 'manual' });
  const status = getEvaV2Status();
  const duration = Date.now() - startedAt;
  log(
    `Cycle ${cycle} termine en ${Math.round(duration / 1000)}s | ` +
    `locations=${status.locations} rankings=${status.rankings} teams=${status.teams} ` +
    `rankingItems=${status.rankingItems} players=${status.players} majorTeams=${status.majorTeams}`
  );
  return status;
}

async function main() {
  log(`Mode one-shot${isFull ? ' full' : ''}`);

  if (shouldReset) {
    log('Reset demande: tables EVA v2 et cache local vides.');
    resetEvaV2Cache({ clearLegacy: true });
  }

  let cycle = 1;
  await runRefresh(cycle++);
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
