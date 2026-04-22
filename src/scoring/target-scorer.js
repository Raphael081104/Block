/**
 * Score 0-100 pour chaque wallet détecté
 * Pondération :
 *   - Native balance    : 15 pts max
 *   - Stablecoin balance: 20 pts max
 *   - TX count          : 15 pts max
 *   - DEX activity      : 10 pts max
 *   - Test TX pattern   : 15 pts (small send + rich + new dest)
 *   - Récurrence        : 15 pts (same dest 2+ times in 30d)
 *   - Gas behavior      : 10 pts max
 */

const WEIGHTS = {
  native: 15,
  stables: 20,
  txCount: 15,
  dex: 10,
  testTx: 15,
  recurrence: 15,
  gas: 10,
};

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * @param {object} data
 * @param {number} data.nativeBalance
 * @param {number} data.stableTotal
 * @param {number} data.txCount
 * @param {boolean} data.isDex
 * @param {boolean} data.hasTestTx - filtre 2: test TX pattern détecté
 * @param {number} data.recurrence - filtre 3: max sends to same address in 30d
 * @param {number} data.blocksSeen
 * @param {number} data.avgGasPrice - gas price moyen en gwei
 * @returns {{ score: number, breakdown: object }}
 */
export function scoreWallet(data) {
  const breakdown = {};

  // Native balance: 0.05 = 0pts, 1+ = max
  breakdown.native = clamp((data.nativeBalance - 0.05) / 0.95, 0, 1) * WEIGHTS.native;

  // Stablecoins: $500 = 0pts, $50k+ = max
  breakdown.stables = clamp((data.stableTotal - 500) / 49500, 0, 1) * WEIGHTS.stables;

  // TX count: 20 = 0pts, 500+ = max
  breakdown.txCount = clamp((data.txCount - 20) / 480, 0, 1) * WEIGHTS.txCount;

  // DEX: binary
  breakdown.dex = data.isDex ? WEIGHTS.dex : 0;

  // Test TX pattern: binary — rich wallet sending small amount to new address
  breakdown.testTx = data.hasTestTx ? WEIGHTS.testTx : 0;

  // Récurrence: 1 = 0pts, 2 = half, 4+ = max
  const rec = data.recurrence || 0;
  breakdown.recurrence = clamp((rec - 1) / 3, 0, 1) * WEIGHTS.recurrence;

  // Gas: willing to pay high gas = more active
  const gwei = data.avgGasPrice || 20;
  breakdown.gas = clamp((gwei - 20) / 80, 0, 1) * WEIGHTS.gas;

  const score = Math.round(
    Object.values(breakdown).reduce((a, b) => a + b, 0)
  );

  return {
    score: clamp(score, 0, 100),
    breakdown: Object.fromEntries(
      Object.entries(breakdown).map(([k, v]) => [k, Math.round(v * 10) / 10])
    ),
  };
}

export function scoreLabel(score) {
  if (score >= 80) return "🔴 HIGH";
  if (score >= 50) return "🟡 MEDIUM";
  return "🟢 LOW";
}
