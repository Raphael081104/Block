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
 * @param {object} opts
 * @param {string} opts.targetAddress - the original "poto" address
 * @param {string} opts.vanityAddress - the generated lookalike address
 * @param {string} opts.privateKey - private key to encrypt & store
 * @param {string} opts.prefix - matched prefix
 * @param {string} opts.suffix - matched suffix
 * @param {string} [opts.password] - encryption password (default: VAULT_PASSWORD env)
 */
export async function storeVanityKey({ targetAddress, vanityAddress, privateKey, prefix, suffix, password }) {
  const pwd = password || process.env.VAULT_PASSWORD;
  if (!pwd) throw new Error('VAULT_PASSWORD env required to encrypt keys');

  const { encrypted, iv, authTag } = encrypt(privateKey, pwd);
  const key = VAULT_PREFIX + targetAddress.toLowerCase();

  await redis.hset(key, {
    vanityAddress,
    targetAddress: targetAddress.toLowerCase(),
    prefix,
    suffix,
    encrypted,
    iv,
    authTag,
    createdAt: new Date().toISOString(),
  });

  // Index for lookup
  await redis.sadd('vault:vanity:all', targetAddress.toLowerCase());

  return { vanityAddress, stored: true };
}

/**
 * Retrieve and decrypt a vanity key from Redis
 */
export async function getVanityKey(targetAddress, password) {
  const pwd = password || process.env.VAULT_PASSWORD;
  if (!pwd) throw new Error('VAULT_PASSWORD env required to decrypt keys');

  const key = VAULT_PREFIX + targetAddress.toLowerCase();
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
  const targets = await redis.smembers('vault:vanity:all');
  const results = [];
  for (const target of targets) {
    const data = await redis.hgetall(VAULT_PREFIX + target);
    if (data) {
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
