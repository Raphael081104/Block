import { sendTx } from './sender.js';

/**
 * Schedule a sequence of timed transactions
 * @param {object} opts
 * @param {string} opts.chainKey
 * @param {string} opts.privateKey
 * @param {string} opts.to
 * @param {string} [opts.token] - ERC-20 address (omit for native)
 * @param {Array<{amount: string, delayMs: number}>} opts.steps
 * @returns {Promise<Array<{step: number, result?: object, error?: string}>>}
 */
export async function scheduleTxSequence({ chainKey, privateKey, to, token, steps }) {
  const results = [];
  const startTime = Date.now();

  for (let i = 0; i < steps.length; i++) {
    const { amount, delayMs } = steps[i];
    const elapsed = Date.now() - startTime;
    const waitMs = Math.max(0, delayMs - elapsed);

    if (waitMs > 0) {
      const waitSec = (waitMs / 1000).toFixed(0);
      console.log(`  [step ${i + 1}/${steps.length}] waiting ${waitSec}s...`);
      await sleep(waitMs);
    }

    console.log(`  [step ${i + 1}/${steps.length}] sending ${amount}...`);

    try {
      const result = await sendTx({ chainKey, privateKey, to, amount, token });
      console.log(`  [step ${i + 1}/${steps.length}] TX confirmed: ${result.hash}`);
      results.push({ step: i + 1, result });
    } catch (err) {
      console.error(`  [step ${i + 1}/${steps.length}] FAILED: ${err.message}`);
      results.push({ step: i + 1, error: err.message });
    }
  }

  return results;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
