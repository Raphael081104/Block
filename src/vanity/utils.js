import { keccak256 } from 'ethereum-cryptography/keccak.js';
import { secp256k1 } from 'ethereum-cryptography/secp256k1.js';
import { bytesToHex, hexToBytes } from 'ethereum-cryptography/utils.js';

/**
 * Derive ETH address from private key hex string
 * @param {string} privateKeyHex - 0x-prefixed private key
 * @returns {string} lowercase address with 0x prefix
 */
export function deriveAddress(privateKeyHex) {
  const privBytes = hexToBytes(privateKeyHex.replace(/^0x/, ''));
  const pubKey = secp256k1.getPublicKey(privBytes, false).slice(1);
  const hash = keccak256(pubKey);
  return '0x' + bytesToHex(hash.slice(12));
}

/**
 * EIP-55 checksum encoding for an Ethereum address
 * @param {string} address - lowercase address with 0x prefix
 * @returns {string} checksummed address
 */
export function toChecksumAddress(address) {
  const addr = address.replace(/^0x/, '').toLowerCase();
  const hash = bytesToHex(keccak256(new TextEncoder().encode(addr)));
  let result = '0x';
  for (let i = 0; i < 40; i++) {
    result += parseInt(hash[i], 16) >= 8
      ? addr[i].toUpperCase()
      : addr[i];
  }
  return result;
}

/**
 * Validate hex address string
 * @param {string} input
 * @returns {{ valid: boolean, clean: string, error?: string }}
 */
export function validateAddress(input) {
  const clean = input.replace(/^0x/i, '').toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(clean)) {
    return { valid: false, clean: '', error: 'Invalid address: must be 40 hex characters (with or without 0x prefix)' };
  }
  return { valid: true, clean };
}
