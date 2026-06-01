require('dotenv').config();

const config = require('../config');
const { getPlayerDiscoveryQueueStats, refreshEvaDataCache } = require('../utils/eva');

const isDaemon = process.argv.includes('--daemon') || process.env.EVA_REFRESH_DAEMON === '1';
const refreshMs = Number(process.env.EVA_DATA_REFRESH_MS || config.EVA_DATA_REFRESH_MS || 12 * 60 * 60 * 1000);

function log(message) {
  console.log(`[EVA-WORKER] ${message}`);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runRefresh(cycle) {
  const startedAt = Date.now();
  log(`Cycle ${cycle} démarré.`);
  try {
    const before = getPlayerDiscoveryQueueStats();
    log(
      `Queue avant: total=${before.total} ready=${before.ready} ` +
      `pending=${before.pending} missing=${before.missing} resolved=${before.resolved} deferred=${before.deferred}`
    );
    const result = await refreshEvaDataCache({ force: true });
    const cache = result?.cache || result;
    const after = getPlayerDiscoveryQueueStats();
    const duration = Date.now() - startedAt;
    log(
      `Cycle ${cycle} terminé en ${duration} ms | ` +
      `joueurs ${cache.players?.length || 0} | équipes ${cache.teams?.length || 0} | ` +
      `buildComplete=${Boolean(cache.buildComplete)}`
    );
    log(
      `Queue après: total=${after.total} ready=${after.ready} ` +
      `pending=${after.pending} missing=${after.missing} resolved=${after.resolved} deferred=${after.deferred}`
    );
    if (result?.deferredUntil && result.deferredUntil > Date.now()) {
      log(`Cycle ${cycle} différé jusqu'à ${new Date(result.deferredUntil).toLocaleString('fr-FR')} (429).`);
    }
    return result;
  } catch (err) {
    log(`Cycle ${cycle} en erreur: ${err.message}`);
    throw err;
  }
}

async function main() {
  log(`Mode ${isDaemon ? 'daemon' : 'one-shot'} | intervalle ${refreshMs} ms`);
  let cycle = 1;

  let firstResult = await runRefresh(cycle++);
  if (firstResult?.deferredUntil && firstResult.deferredUntil > Date.now()) {
    const delayMs = Math.max(0, firstResult.deferredUntil - Date.now());
    log(`Pause ${delayMs} ms avant reprise après 429.`);
    await wait(delayMs);
  }
  if (!isDaemon) return;

  while (true) {
    const nextDelay = firstResult?.deferredUntil && firstResult.deferredUntil > Date.now()
      ? Math.max(0, firstResult.deferredUntil - Date.now())
      : refreshMs;
    log(`Pause ${nextDelay} ms avant le prochain cycle.`);
    await wait(nextDelay);
    try {
      firstResult = await runRefresh(cycle++);
      if (firstResult?.deferredUntil && firstResult.deferredUntil > Date.now()) {
        continue;
      }
    } catch (err) {
      log(`Cycle ${cycle - 1} interrompu, reprise dans ${refreshMs} ms.`);
    }
  }
}

process.on('SIGINT', () => {
  log('Arrêt demandé (SIGINT).');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Arrêt demandé (SIGTERM).');
  process.exit(0);
});

main().catch(err => {
  console.error('[EVA-WORKER] Arrêt fatal:', err);
  process.exit(1);
});
