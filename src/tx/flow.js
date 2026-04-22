import { generate as cpuGenerate } from '../vanity/generator-cpu.js';
import { deriveAddress, toChecksumAddress } from '../vanity/utils.js';
import { storeVanityKey, getVanityKey } from './vault.js';
import { sendTx } from './sender.js';
import { CHAINS } from '../config/chains.js';

/**
 * Full automated flow:
 * 1. Generate vanity address matching target (poto)
 * 2. Encrypt & store in Redis
 * 3. Send timed TX sequence from vanity address → whale
 *
 * @param {object} opts
 * @param {string} opts.targetAddress - poto's address to mimic
 * @param {number} [opts.prefixLen=4] - prefix chars to match
 * @param {number} [opts.suffixLen=4] - suffix chars to match
 * @param {string} opts.whaleAddress - where to send TX from vanity
 * @param {string|string[]} opts.chains - chain(s) to send on
 * @param {Array<{amount: string, delaySec: number}>} opts.sends - TX sequence
 * @param {string} [opts.token] - ERC-20 address (omit for native)
 */
export async function runFlow({ targetAddress, prefixLen = 4, suffixLen = 4, whaleAddress, chains, sends, token }) {
  const chainList = Array.isArray(chains) ? chains : [chains];
  const clean = targetAddress.replace(/^0x/i, '').toLowerCase();
  const prefix = clean.slice(0, prefixLen);
  const suffix = clean.slice(-suffixLen);

  // ── Step 1: Vanity Generation ─────────────────────
  console.log(`
┌─────────────────────────────────────────┐
│  STEP 1 — Vanity Generation            │
├─────────────────────────────────────────┤
│  Target (poto): 0x${clean}
│  Pattern:       ${prefix}...${suffix}
└─────────────────────────────────────────┘
`);

  const startGen = Date.now();
  const vanityResult = await cpuGenerate({
    prefix,
    suffix,
    onProgress: (attempts, speed) => {
      const elapsed = ((Date.now() - startGen) / 1000).toFixed(0);
      process.stdout.write(`\r  ${attempts.toLocaleString()} attempts | ${speed.toLocaleString()} keys/sec | ${elapsed}s`);
    },
  });

  // Verify key
  const derived = deriveAddress(vanityResult.privateKey);
  if (derived.toLowerCase() !== vanityResult.address.toLowerCase()) {
    throw new Error('Vanity key verification failed — aborting');
  }

  const checksumAddr = toChecksumAddress(vanityResult.address);
  const genTime = ((Date.now() - startGen) / 1000).toFixed(1);

  console.log(`\n
  ✓ Generated: ${checksumAddr}
  ✓ Time:      ${genTime}s
  ✓ Attempts:  ${vanityResult.attempts.toLocaleString()}
`);

  // ── Step 2: Store in Redis (encrypted) ────────────
  console.log(`┌─────────────────────────────────────────┐
│  STEP 2 — Store in Redis (encrypted)   │
└─────────────────────────────────────────┘
`);

  await storeVanityKey({
    targetAddress,
    vanityAddress: checksumAddr,
    privateKey: vanityResult.privateKey,
    prefix,
    suffix,
  });

  console.log(`  ✓ Key encrypted & stored (vault:vanity:${clean})\n`);

  // ── Step 3: TX Sequence ───────────────────────────
  console.log(`┌─────────────────────────────────────────┐
│  STEP 3 — TX Sequence                  │
├─────────────────────────────────────────┤
│  From:   ${checksumAddr}
│  To:     ${whaleAddress}
│  Chains: ${chainList.map((c) => CHAINS[c].name).join(' + ')}
│  Sends:  ${sends.length} transactions
└─────────────────────────────────────────┘
`);

  // Retrieve key from vault for sending
  const vault = await getVanityKey(targetAddress);
  if (!vault) throw new Error('Failed to retrieve key from vault');

  const allResults = [];

  for (const chainKey of chainList) {
    console.log(`\n  ── ${CHAINS[chainKey].name} ──`);

    for (let i = 0; i < sends.length; i++) {
      const { amount, delaySec } = sends[i];

      if (delaySec > 0) {
        console.log(`  [TX ${i + 1}] waiting ${delaySec}s...`);
        await sleep(delaySec * 1000);
      }

      console.log(`  [TX ${i + 1}] sending ${amount} ${token ? 'tokens' : CHAINS[chainKey].nativeSymbol}...`);

      try {
        const result = await sendTx({
          chainKey,
          privateKey: vault.privateKey,
          to: whaleAddress,
          amount,
          token,
        });
        console.log(`  [TX ${i + 1}] ✓ confirmed: ${result.hash} (gas: ${result.gasUsed})`);
        allResults.push({ chain: chainKey, step: i + 1, result });
      } catch (err) {
        console.error(`  [TX ${i + 1}] ✗ FAILED: ${err.message}`);
        allResults.push({ chain: chainKey, step: i + 1, error: err.message });
      }
    }
  }

  // ── Summary ───────────────────────────────────────
  console.log(`
┌─────────────────────────────────────────┐
│  SUMMARY                               │
├─────────────────────────────────────────┤
│  Vanity:  ${checksumAddr}
│  Target:  ${targetAddress}
│  TXs:     ${allResults.filter((r) => r.result).length}/${allResults.length} confirmed
└─────────────────────────────────────────┘
`);

  return { vanityAddress: checksumAddr, results: allResults };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
