import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { bytesToHex } from 'ethereum-cryptography/utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN_PATH = join(__dirname, '..', 'bin', 'profanity2');

export function isAvailable() {
  return existsSync(BIN_PATH);
}

/**
 * Generate vanity address using Profanity2 (CUDA)
 * @param {string} prefix - hex prefix to match (without 0x)
 * @param {string} suffix - hex suffix to match
 * @returns {Promise<{privateKey: string, address: string}>}
 */
export function generate(prefix, suffix) {
  return new Promise((resolve, reject) => {
    if (!isAvailable()) {
      return reject(new Error(`Profanity2 binary not found at ${BIN_PATH}. Download from https://github.com/1inch/profanity2`));
    }

    // Generate random passphrase seed (prevents Profanity vulnerability)
    const seed = bytesToHex(randomBytes(32));

    const args = ['--passphrase', seed];

    if (prefix && suffix) {
      // Build full 40-char pattern: prefix + wildcards + suffix
      const wildcards = '?'.repeat(40 - prefix.length - suffix.length);
      args.push('--matching', prefix + wildcards + suffix);
    } else if (prefix) {
      args.push('--leading', prefix);
    } else if (suffix) {
      const wildcards = '?'.repeat(40 - suffix.length);
      args.push('--matching', wildcards + suffix);
    }

    const proc = spawn(BIN_PATH, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Profanity2 exited with code ${code}: ${stderr}`));
      }
      const keyMatch = stdout.match(/Private\s*Key\s*:\s*(0x[0-9a-fA-F]{64})/i);
      const addrMatch = stdout.match(/Address\s*:\s*(0x[0-9a-fA-F]{40})/i);

      if (keyMatch && addrMatch) {
        resolve({ privateKey: keyMatch[1], address: addrMatch[1] });
      } else {
        reject(new Error(`Could not parse Profanity2 output:\n${stdout}`));
      }
    });

    proc.on('error', (err) => reject(err));

    // Kill child on SIGINT
    const onSigint = () => { proc.kill('SIGTERM'); };
    process.once('SIGINT', onSigint);
    proc.on('close', () => process.removeListener('SIGINT', onSigint));
  });
}
