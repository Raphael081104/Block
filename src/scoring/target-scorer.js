/**
 * Score 0-100 pour chaque wallet détecté
 * Pondération :
 *   - Native balance    : 20 pts max
 *   - Stablecoin balance: 25 pts max
 *   - TX count          : 20 pts max
 *   - DEX activity      : 15 pts max
 *   - Récurrence (multi-block): 10 pts max
 *   - Gas behavior      : 10 pts max
 */

const WEIGHTS = {
  native: 20,
  stables: 25,
  txCount: 20,
  dex: 15,
  recurrence: 10,
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
 * @param {number} data.blocksSeen - nombre de blocks où l'adresse apparaît
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

  // Récurrence: 1 block = 0pts, 5+ blocks = max
  breakdown.recurrence = clamp(((data.blocksSeen || 1) - 1) / 4, 0, 1) * WEIGHTS.recurrence;

  // Gas: willing to pay high gas = more active
  // 20 gwei = baseline, 100+ gwei = max
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
