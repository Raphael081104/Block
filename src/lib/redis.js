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
