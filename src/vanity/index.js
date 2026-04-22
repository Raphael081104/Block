import { detectGpu } from './gpu-detect.js';
import * as gpuGen from './generator-gpu.js';
import { generate as cpuGenerate } from './generator-cpu.js';
import { deriveAddress, toChecksumAddress, validateAddress } from './utils.js';
import { writeFileSync, chmodSync } from 'node:fs';

// ── Config ──────────────────────────────────────────
const TARGET_ADDRESS = process.argv[2] || '';
const PREFIX_LEN = parseInt(process.argv[3] || '4', 10);
const SUFFIX_LEN = parseInt(process.argv[4] || '4', 10);
const OUTPUT_FILE = process.argv.includes('--output')
  ? process.argv[process.argv.indexOf('--output') + 1]
  : null;

if (!TARGET_ADDRESS) {
  console.log(`
  Vanity ETH Address Generator
  ─────────────────────────────
  Usage:  node src/index.js <target_address> [prefix_len] [suffix_len] [--output file]

  Examples:
    node src/index.js 0xABCDef1234567890abcdef1234567890ABCD1234 4 4
    node src/index.js 0xABCDef1234567890abcdef1234567890ABCD1234 8 4 --output key.txt

  prefix_len  = number of hex chars to match at start (default: 4)
  suffix_len  = number of hex chars to match at end   (default: 4)
  --output    = write private key to file (recommended) instead of stdout
  `);
  process.exit(1);
}

// ── Validate input ──────────────────────────────────
const { valid, clean, error } = validateAddress(TARGET_ADDRESS);
if (!valid) {
  console.error(`Error: ${error}`);
  process.exit(1);
}

if (PREFIX_LEN < 1 || PREFIX_LEN > 10) {
  console.error('Error: prefix_len must be between 1 and 10');
  process.exit(1);
}
if (SUFFIX_LEN < 1 || SUFFIX_LEN > 10) {
  console.error('Error: suffix_len must be between 1 and 10');
  process.exit(1);
}
if (PREFIX_LEN + SUFFIX_LEN > 20) {
  console.error('Error: prefix_len + suffix_len must be <= 20');
  process.exit(1);
}

const prefix = clean.slice(0, PREFIX_LEN);
const suffix = clean.slice(-SUFFIX_LEN);

console.log(`
┌─────────────────────────────────────────┐
│  Vanity Generator                       │
├─────────────────────────────────────────┤
│  Target:  0x${clean}
│  Match:   ${prefix}...${suffix}
│  Prefix:  ${PREFIX_LEN} chars
│  Suffix:  ${SUFFIX_LEN} chars
└─────────────────────────────────────────┘
`);

// ── Detect GPU ──────────────────────────────────────
const gpu = detectGpu();
console.log(`GPU: ${gpu.available ? `${gpu.name} (CUDA)` : 'Not found — CPU mode'}\n`);

// ── Difficulty estimate ─────────────────────────────
const totalChars = PREFIX_LEN + SUFFIX_LEN;
const combinations = 16 ** totalChars;
const cpuSpeed = 15_000;    // ~15K keys/sec JS CPU (measured)
const gpuSpeed = 1_500_000; // ~1.5M keys/sec RTX 4090

const speed = gpu.available && gpuGen.isAvailable() ? gpuSpeed : cpuSpeed;
const etaSeconds = Math.round(combinations / speed / 2);
const etaStr = etaSeconds < 60
  ? `${etaSeconds}s`
  : etaSeconds < 3600
    ? `${Math.round(etaSeconds / 60)}min`
    : `${(etaSeconds / 3600).toFixed(1)}h`;

console.log(`Difficulty: ${totalChars} hex chars = ${combinations.toLocaleString()} combinations`);
console.log(`Est. time:  ~${etaStr} @ ${speed.toLocaleString()} keys/sec`);

if (totalChars > 10) {
  console.log(`\n  WARNING: ${totalChars} hex chars is extremely difficult on CPU. Use a GPU.\n`);
}

// ── Generate ────────────────────────────────────────
async function run() {
  const startTime = Date.now();

  // Try GPU first
  if (gpu.available && gpuGen.isAvailable()) {
    console.log('\nUsing Profanity2 (CUDA)...\n');
    try {
      const result = await gpuGen.generate(prefix, suffix);
      if (!verifyResult(result)) return;
      printResult(result, startTime);
      return;
    } catch (err) {
      console.log(`GPU generation failed: ${err.message}`);
      console.log('Falling back to CPU...\n');
    }
  }

  // CPU fallback
  console.log('\nUsing CPU brute force...\n');
  const controller = new AbortController();

  process.on('SIGINT', () => {
    console.log('\n\nAborted by user.');
    controller.abort();
    process.exit(0);
  });

  const result = await cpuGenerate({
    prefix,
    suffix,
    signal: controller.signal,
    onProgress: (attempts, speed) => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      process.stdout.write(`\r  ${attempts.toLocaleString()} attempts | ${speed.toLocaleString()} keys/sec | ${elapsed}s elapsed`);
    },
  });

  console.log('\n');

  if (!verifyResult(result)) return;
  printResult(result, startTime);
}

/**
 * Verify the private key actually produces the claimed address
 */
function verifyResult(result) {
  const derived = deriveAddress(result.privateKey);
  if (derived.toLowerCase() !== result.address.toLowerCase()) {
    console.error(`\n  VERIFICATION FAILED!`);
    console.error(`  Claimed:  ${result.address}`);
    console.error(`  Derived:  ${derived}`);
    console.error(`  Key discarded for safety.\n`);
    return false;
  }
  return true;
}

function printResult(result, startTime) {
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const checksumAddr = toChecksumAddress(result.address);

  if (OUTPUT_FILE) {
    // Write key to file with restricted permissions
    writeFileSync(OUTPUT_FILE, `${result.privateKey}\n`, { mode: 0o600 });
    try { chmodSync(OUTPUT_FILE, 0o600); } catch {}

    console.log(`
┌─────────────────────────────────────────┐
│  MATCH FOUND                            │
├─────────────────────────────────────────┤
│  Address:     ${checksumAddr}
│  Private Key: saved to ${OUTPUT_FILE}
│  Attempts:    ${(result.attempts || 0).toLocaleString()}
│  Time:        ${totalTime}s
└─────────────────────────────────────────┘
`);
  } else {
    console.log(`
┌─────────────────────────────────────────┐
│  MATCH FOUND                            │
├─────────────────────────────────────────┤
│  Address:     ${checksumAddr}
│  Private Key: ${result.privateKey}
│  Attempts:    ${(result.attempts || 0).toLocaleString()}
│  Time:        ${totalTime}s
└─────────────────────────────────────────┘

  ⚠  SAVE YOUR PRIVATE KEY SECURELY
  ⚠  NEVER SHARE IT WITH ANYONE
  ⚠  Use --output file.txt to save to a file instead
`);
  }
}

run().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
