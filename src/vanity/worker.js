import { parentPort, workerData } from 'node:worker_threads';
import { secp256k1 } from 'ethereum-cryptography/secp256k1.js';
import { keccak256 } from 'ethereum-cryptography/keccak.js';
import { bytesToHex } from 'ethereum-cryptography/utils.js';
import { randomBytes } from 'node:crypto';

const { prefix, suffix } = workerData;

let attempts = 0;
const BATCH = 5_000;
const REPORT_INTERVAL = 10_000;
let lastReport = 0;

function mine() {
  for (let i = 0; i < BATCH; i++) {
    const privKeyBytes = randomBytes(32);

    let pubKey;
    try {
      pubKey = secp256k1.getPublicKey(privKeyBytes, false).slice(1);
    } catch {
      continue;
    }

    const hash = keccak256(pubKey);
    const address = bytesToHex(hash.slice(12));
    attempts++;

    const prefixMatch = !prefix || address.startsWith(prefix);
    const suffixMatch = !suffix || address.endsWith(suffix);

    if (prefixMatch && suffixMatch) {
      const privateKeyHex = '0x' + bytesToHex(privKeyBytes);
      privKeyBytes.fill(0); // zero key material

      parentPort.postMessage({
        type: 'found',
        privateKey: privateKeyHex,
        address: '0x' + address,
        attempts,
      });
      return;
    }

    privKeyBytes.fill(0); // zero key material
  }

  if (attempts - lastReport >= REPORT_INTERVAL) {
    parentPort.postMessage({ type: 'progress', attempts });
    lastReport = attempts;
  }

  setImmediate(mine);
}

mine();
