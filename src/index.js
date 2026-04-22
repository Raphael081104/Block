import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { CHAINS } from "./config/chains.js";
import { initTelegram } from "./lib/telegram.js";
import { redis } from "./lib/redis.js";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workers = new Map();
const stats = {};

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}][MAIN] ${msg}`);
}

function spawnWorker(chain, chainConfig) {
  const worker = new Worker(join(__dirname, "worker.js"), {
    workerData: { chain, chainConfig },
  });

  stats[chain] = { blocks: 0, matches: 0, connected: false };

  worker.on("message", (msg) => {
    if (msg.type === "connected") {
      stats[chain].connected = true;
      log(`${chain.toUpperCase()} connected`);
    }
    if (msg.type === "block_processed") {
      stats[chain].blocks++;
      stats[chain].matches += msg.matches;
    }
  });

  worker.on("error", (err) => {
    log(`${chain.toUpperCase()} worker error: ${err.message}`);
  });

  worker.on("exit", (code) => {
    log(`${chain.toUpperCase()} worker exited (code ${code}) — restarting in 5s`);
    stats[chain].connected = false;
    workers.delete(chain);
    setTimeout(() => spawnWorker(chain, chainConfig), 5000);
  });

  workers.set(chain, worker);
}

function printStats() {
  const lines = Object.entries(stats).map(([chain, s]) => {
    const status = s.connected ? "✅" : "❌";
    return `  ${status} ${chain.toUpperCase().padEnd(10)} | blocks: ${String(s.blocks).padStart(5)} | matches: ${s.matches}`;
  });
  log(`\n--- STATS ---\n${lines.join("\n")}\n-------------`);
}

async function main() {
  log("Block Scanner v2 — Node.js Multi-Chain");
  log(`Chains: ${Object.keys(CHAINS).length} EVM`);

  initTelegram();

  // Spawn 1 worker thread per chain
  const chainFilter = process.env.CHAINS?.split(",").map((c) => c.trim().toLowerCase());

  for (const [chain, config] of Object.entries(CHAINS)) {
    if (chainFilter && !chainFilter.includes(chain)) continue;
    log(`Spawning worker: ${chain.toUpperCase()} (${config.name})`);
    spawnWorker(chain, config);
  }

  // Stats toutes les 60s
  setInterval(printStats, 60_000);

  // Graceful shutdown
  for (const sig of ["SIGINT", "SIGTERM"]) {
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
