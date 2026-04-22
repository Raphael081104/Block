import { scheduleTxSequence } from './scheduler.js';
import { runFlow } from './flow.js';
import { CHAINS } from '../config/chains.js';

// ── Mode detection ──────────────────────────────────
const MODE = process.argv[2] || '';

// Full flow mode: node src/tx/index.js flow <poto_address> <whale_address> <chains> [prefix] [suffix]
if (MODE === 'flow') {
  const POTO    = process.argv[3] || '';
  const WHALE   = process.argv[4] || '';
  const CHAIN_A = process.argv[5] || 'eth';
  const PLEN    = parseInt(process.argv[6] || '4', 10);
  const SLEN    = parseInt(process.argv[7] || '4', 10);

  if (!POTO || !WHALE) {
    console.log(`
  Full Flow: Vanity Gen → Redis → TX Send
  ─────────────────────────────────────────
  Usage:  node src/tx/index.js flow <poto_address> <whale_address> [chains] [prefix_len] [suffix_len]

  Examples:
    node src/tx/index.js flow 0xAMI 0xWHALE eth 4 4
    node src/tx/index.js flow 0xAMI 0xWHALE eth,arbitrum,base 6 6

  Env: VAULT_PASSWORD (required for key encryption)
    `);
    process.exit(1);
  }

  runFlow({
    targetAddress: POTO,
    whaleAddress: WHALE,
    chains: CHAIN_A.split(','),
    prefixLen: PLEN,
    suffixLen: SLEN,
    sends: [
      { amount: '0.001', delaySec: 30 },
      { amount: '0.001', delaySec: 60 },
    ],
  }).catch((err) => { console.error('Fatal:', err.message); process.exit(1); });

} else {

// ── Direct TX mode ──────────────────────────────────
const CHAIN_ARG = MODE;
const PRIVKEY   = process.argv[3] || process.env.TX_PRIVATE_KEY || '';
const TO        = process.argv[4] || '';
const TOKEN     = process.argv[5] || '';  // optional ERC-20 address

if (!CHAIN_ARG || !PRIVKEY || !TO) {
  console.log(`
  TX Builder & Sender
  ────────────────────
  Usage:  node src/tx/index.js <chain(s)> <private_key> <to_address> [token_address]

  Multi-chain: comma-separated (e.g. "eth,arbitrum,base")
  Chains: ${Object.keys(CHAINS).join(', ')}

  Examples:
    # Single chain — Native ETH
    node src/tx/index.js eth 0xPRIVKEY 0xDEST

    # Multi-chain — same wallet on ETH + Arb + Base in parallel
    node src/tx/index.js eth,arbitrum,base 0xPRIVKEY 0xDEST

    # ERC-20 USDC on Base
    node src/tx/index.js base 0xPRIVKEY 0xDEST 0xUSDC_ADDRESS

  Env:
    TX_PRIVATE_KEY  — alternative to CLI arg
  `);
  process.exit(1);
}

const chains = CHAIN_ARG.split(',').map((c) => c.trim());
for (const c of chains) {
  if (!CHAINS[c]) {
    console.error(`Error: unknown chain "${c}". Available: ${Object.keys(CHAINS).join(', ')}`);
    process.exit(1);
  }
}

if (!/^0x[0-9a-fA-F]{64}$/.test(PRIVKEY)) {
  console.error('Error: invalid private key format');
  process.exit(1);
}

if (!/^0x[0-9a-fA-F]{40}$/.test(TO)) {
  console.error('Error: invalid destination address');
  process.exit(1);
}

// ── TX Sequence ─────────────────────────────────────
// Envoi 1: 0.001 at t+30s
// Envoi 2: 0.001 at t+3min
const steps = [
  { amount: '0.001', delayMs: 30_000 },    // t+30s
  { amount: '0.001', delayMs: 180_000 },   // t+3min
];

const chainNames = chains.map((c) => CHAINS[c].name).join(' + ');

console.log(`
┌─────────────────────────────────────────┐
│  TX Builder & Sender                    │
├─────────────────────────────────────────┤
│  Chains: ${chainNames}
│  To:     ${TO}
│  Token:  ${TOKEN || 'native'}
│  Steps:  ${steps.length} sends per chain
│  Plan:   0.001 @ t+30s, 0.001 @ t+3min
└─────────────────────────────────────────┘
`);

async function run() {
  // Launch all chains in parallel
  const promises = chains.map(async (chainKey) => {
    console.log(`\n── ${CHAINS[chainKey].name} ──`);
    const results = await scheduleTxSequence({
      chainKey,
      privateKey: PRIVKEY,
      to: TO,
      token: TOKEN || undefined,
      steps,
    });
    return { chain: CHAINS[chainKey].name, results };
  });

  const allResults = await Promise.all(promises);

  console.log('\n── Summary ──────────────────────────────');
  for (const { chain, results } of allResults) {
    console.log(`\n  ${chain}:`);
    for (const r of results) {
      if (r.result) {
        console.log(`    Step ${r.step}: ${r.result.amount} → ${r.result.hash}`);
      } else {
        console.log(`    Step ${r.step}: FAILED — ${r.error}`);
      }
    }
  }
  console.log('');
}

run().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});

} // end else (direct TX mode)
