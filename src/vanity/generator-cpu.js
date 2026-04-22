import { Worker } from 'node:worker_threads';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = join(__dirname, 'worker.js');

/**
 * Generate vanity address on CPU using worker_threads
 * @param {object} opts
 * @param {string} opts.prefix - hex chars to match at start (without 0x)
 * @param {string} opts.suffix - hex chars to match at end
 * @param {function} [opts.onProgress] - callback(totalAttempts, speed)
 * @param {AbortSignal} [opts.signal] - abort signal
 * @returns {Promise<{privateKey: string, address: string, attempts: number, timeMs: number}>}
 */
export function generate({ prefix = '', suffix = '', onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const numWorkers = Math.max(1, cpus().length - 1);
    const workers = [];
    const workerAttempts = new Array(numWorkers).fill(0);
    let found = false;
    const startTime = Date.now();

    let progressInterval;
    if (onProgress) {
      progressInterval = setInterval(() => {
        const total = workerAttempts.reduce((a, b) => a + b, 0);
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = Math.round(total / elapsed);
        onProgress(total, speed);
      }, 2000);
    }

    function cleanup() {
      found = true;
      if (progressInterval) clearInterval(progressInterval);
      for (const w of workers) {
        w.terminate();
      }
    }

    if (signal) {
      signal.addEventListener('abort', () => {
        cleanup();
        reject(new Error('Generation aborted'));
      });
    }

    for (let i = 0; i < numWorkers; i++) {
      const worker = new Worker(WORKER_PATH, {
        workerData: { prefix: prefix.toLowerCase(), suffix: suffix.toLowerCase() },
      });

      worker.on('message', (msg) => {
        if (found) return;

        if (msg.type === 'progress') {
          workerAttempts[i] = msg.attempts;
        }

        if (msg.type === 'found') {
          workerAttempts[i] = msg.attempts;
          const totalAttempts = workerAttempts.reduce((a, b) => a + b, 0);
          cleanup();
          resolve({
            privateKey: msg.privateKey,
            address: msg.address,
            attempts: totalAttempts,
            timeMs: Date.now() - startTime,
          });
        }
      });

      worker.on('error', (err) => {
        if (!found) {
          cleanup();
          reject(err);
        }
      });

      workers.push(worker);
    }

    console.log(`  ${numWorkers} workers started\n`);
  });
}
