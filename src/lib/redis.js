import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 200, 5000),
});

redis.on("error", (err) => console.error("[Redis]", err.message));

export async function isScanned(address, chain) {
  return (await redis.exists(`scanned:${chain}:${address.toLowerCase()}`)) === 1;
}

export async function markScanned(address, chain) {
  await redis.set(`scanned:${chain}:${address.toLowerCase()}`, 1, "EX", 86400 * 7);
}

export async function saveMatch(address, chain, data) {
  await redis.hset(`match:${chain}:${address.toLowerCase()}`, {
    ...data,
    timestamp: new Date().toISOString(),
  });
  await redis.sadd("matches:all", `${chain}:${address.toLowerCase()}`);
}

/**
 * Filtre 2 — Test TX Pattern: track small sends from rich wallets to new addresses
 * Enregistre chaque tx: sender → receiver avec montant
 */
export async function trackTx(chain, from, to, valueNative) {
  const key = `tx:${chain}:${from.toLowerCase()}:${to.toLowerCase()}`;
  await redis.rpush(key, JSON.stringify({ value: valueNative, ts: Date.now() }));
  await redis.expire(key, 86400 * 30); // 30 jours
}

/**
 * Filtre 2 — Détecte test TX pattern:
 * montant < 0.05 ETH + balance sender > 50 ETH + adresse destinataire nouvelle
 */
export async function isTestTxPattern(chain, from, to, valueNative, senderBalance) {
  if (valueNative >= 0.05) return false;
  if (senderBalance < 50) return false;
  // Adresse destinataire nouvelle = jamais vue avant dans nos scans
  const seen = await redis.exists(`scanned:${chain}:${to.toLowerCase()}`);
  return seen === 0;
}

/**
 * Filtre 3 — Récurrence: sender envoie à la même adresse 2+ fois en 30 jours
 */
export async function getRecurrence(chain, from, to) {
  const key = `tx:${chain}:${from.toLowerCase()}:${to.toLowerCase()}`;
  const count = await redis.llen(key);
  return count;
}

export async function getAllMatches() {
  const keys = await redis.smembers("matches:all");
  const results = [];
  for (const key of keys) {
    const [chain, address] = key.split(":");
    const data = await redis.hgetall(`match:${chain}:${address}`);
    if (data && data.timestamp) results.push({ chain, address, ...data });
  }
  return results;
}

export { redis };
