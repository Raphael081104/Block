import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { redis } from '../lib/redis.js';

const ALGO = 'aes-256-gcm';
const VAULT_PREFIX = 'vault:vanity:';

/**
 * Derive encryption key from password
 */
function deriveKey(password) {
  const salt = process.env.VAULT_SALT || 'vanity-gen-default-salt';
  return scryptSync(password, salt, 32);
}

/**
 * Encrypt a private key
 */
function encrypt(privateKey, password) {
  const key = deriveKey(password);
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGO, key, iv);
  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return { encrypted, iv: iv.toString('hex'), authTag };
}

/**
 * Decrypt a private key
 */
function decrypt(encryptedData, password) {
  const key = deriveKey(password);
  const iv = Buffer.from(encryptedData.iv, 'hex');
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
  let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Store vanity keypair in Redis (encrypted)
 * Keyed by VANITY address (not target) to support same whale multiple times
 */
export async function storeVanityKey({ targetAddress, vanityAddress, privateKey, prefix, suffix, password }) {
  const pwd = password || process.env.VAULT_PASSWORD;
  if (!pwd) throw new Error('VAULT_PASSWORD env required to encrypt keys');

  const { encrypted, iv, authTag } = encrypt(privateKey, pwd);
  const vanityLower = vanityAddress.toLowerCase();
  const key = VAULT_PREFIX + vanityLower;

  await redis.hset(key, {
    vanityAddress: vanityLower,
    targetAddress: targetAddress.toLowerCase(),
    prefix,
    suffix,
    encrypted,
    iv,
    authTag,
    createdAt: new Date().toISOString(),
  });

  // Index: vanity address set + reverse lookup
  await redis.sadd('vault:vanity:all', vanityLower);
  await redis.set(`vault:reverse:${vanityLower}`, vanityLower);

  // Expire after 7 days
  await redis.expire(key, 7 * 24 * 60 * 60);

  return { vanityAddress, stored: true };
}

/**
 * Retrieve and decrypt a vanity key by vanity address
 */
export async function getVanityKey(vanityAddress, password) {
  const pwd = password || process.env.VAULT_PASSWORD;
  if (!pwd) throw new Error('VAULT_PASSWORD env required to decrypt keys');

  const key = VAULT_PREFIX + vanityAddress.toLowerCase();
  const data = await redis.hgetall(key);
  if (!data || !data.encrypted) return null;

  const privateKey = decrypt(data, pwd);

  return {
    targetAddress: data.targetAddress,
    vanityAddress: data.vanityAddress,
    privateKey,
    prefix: data.prefix,
    suffix: data.suffix,
    createdAt: data.createdAt,
  };
}

/**
 * List all stored vanity addresses (without keys)
 */
export async function listVanityAddresses() {
  const vanities = await redis.smembers('vault:vanity:all');
  const results = [];
  for (const vanity of vanities) {
    const data = await redis.hgetall(VAULT_PREFIX + vanity);
    if (data && data.vanityAddress) {
      results.push({
        targetAddress: data.targetAddress,
        vanityAddress: data.vanityAddress,
        prefix: data.prefix,
        suffix: data.suffix,
        createdAt: data.createdAt,
      });
    }
  }
  return results;
}
