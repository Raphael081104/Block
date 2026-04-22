import { ethers } from 'ethers';
import { CHAINS } from './config/chains.js';

/**
 * COUCHE 5 — Timing Engine
 *
 * Score > 90 (test tx whale):  30s - 2min
 * Score 70-90 (whale récurrent): 2min - 5min
 * Market crash/pump (volatilité >5%): reduce to 15-30s
 */

/**
 * Get timing config based on score + market conditions
 * @param {number} score - wallet score 0-100
 * @param {string} chainKey - chain to check volatility on
 * @returns {Promise<{delaySec1: number, delaySec2: number, reason: string}>}
 */
export async function getTiming(score, chainKey) {
  const volatile = await isVolatile(chainKey);

  if (volatile) {
    return {
      delaySec1: 15,
      delaySec2: 30,
      reason: 'VOLATILE MARKET — fast timing',
    };
  }

  if (score > 90) {
    // Test TX whale — appear just after the test tx
    const delay1 = randomBetween(30, 120);
    return {
      delaySec1: delay1,
      delaySec2: delay1 + randomBetween(60, 180),
      reason: `HIGH SCORE (${score}) — fast timing`,
    };
  }

  // Score 70-90 — natural spacing
  const delay1 = randomBetween(120, 300);
  return {
    delaySec1: delay1,
    delaySec2: delay1 + randomBetween(120, 300),
    reason: `MEDIUM SCORE (${score}) — normal timing`,
  };
}

/**
 * Detect high volatility (>5% price move in recent blocks)
 * Checks native token price via latest block gas/fee patterns
 */
async function isVolatile(chainKey) {
  const chain = CHAINS[chainKey];
  if (!chain) return false;

  try {
    const provider = new ethers.JsonRpcProvider(chain.rpcs[0]);
    const latest = await provider.getBlock('latest');
    const older = await provider.getBlock(latest.number - 50);

    if (!latest?.baseFeePerGas || !older?.baseFeePerGas) return false;

    const latestFee = Number(latest.baseFeePerGas);
    const olderFee = Number(older.baseFeePerGas);

    if (olderFee === 0) return false;

    // Gas fee spike >100% = market is volatile (people rushing to trade)
    const change = Math.abs(latestFee - olderFee) / olderFee;
    return change > 1.0;
  } catch {
    return false;
  }
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
