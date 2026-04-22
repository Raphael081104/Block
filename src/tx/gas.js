import { ethers } from 'ethers';

/**
 * Gas strategy per chain type
 * ETH: priority fee to land in next block
 * BSC/Base/L2s: minimal gas suffices
 * Congestion: boost multiplier
 */

const CHAIN_GAS_CONFIG = {
  eth:       { type: 'eip1559', priorityBoost: 1.2, maxBoost: 1.5, congestionMultiplier: 2.0 },
  arbitrum:  { type: 'eip1559', priorityBoost: 1.0, maxBoost: 1.2, congestionMultiplier: 1.5 },
  optimism:  { type: 'eip1559', priorityBoost: 1.0, maxBoost: 1.2, congestionMultiplier: 1.5 },
  base:      { type: 'eip1559', priorityBoost: 1.0, maxBoost: 1.1, congestionMultiplier: 1.3 },
  polygon:   { type: 'eip1559', priorityBoost: 1.3, maxBoost: 1.5, congestionMultiplier: 2.0 },
  linea:     { type: 'eip1559', priorityBoost: 1.0, maxBoost: 1.2, congestionMultiplier: 1.5 },
  scroll:    { type: 'eip1559', priorityBoost: 1.0, maxBoost: 1.2, congestionMultiplier: 1.5 },
  zksync:    { type: 'eip1559', priorityBoost: 1.0, maxBoost: 1.2, congestionMultiplier: 1.5 },
  bsc:       { type: 'legacy',  gasMultiplier: 1.0, congestionMultiplier: 1.5 },
  avalanche: { type: 'eip1559', priorityBoost: 1.1, maxBoost: 1.3, congestionMultiplier: 1.5 },
  fantom:    { type: 'legacy',  gasMultiplier: 1.0, congestionMultiplier: 1.5 },
  cronos:    { type: 'legacy',  gasMultiplier: 1.0, congestionMultiplier: 1.5 },
};

/**
 * Detect congestion by comparing pending vs latest block gas
 */
async function isCongested(provider) {
  try {
    const block = await provider.getBlock('latest');
    if (!block || !block.gasUsed || !block.gasLimit) return false;
    const usage = Number(block.gasUsed) / Number(block.gasLimit);
    return usage > 0.85; // >85% = congested
  } catch {
    return false;
  }
}

/**
 * Get optimal gas params for a chain
 * @param {ethers.Provider} provider
 * @param {string} chainKey - key from CHAINS config
 * @returns {Promise<object>} gas params for tx
 */
export async function getGasParams(provider, chainKey) {
  const config = CHAIN_GAS_CONFIG[chainKey] || CHAIN_GAS_CONFIG.eth;
  const congested = await isCongested(provider);

  if (config.type === 'legacy') {
    const feeData = await provider.getFeeData();
    let gasPrice = feeData.gasPrice || 5_000_000_000n;

    if (congested) {
      gasPrice = gasPrice * BigInt(Math.round(config.congestionMultiplier * 100)) / 100n;
    }

    return { gasPrice };
  }

  // EIP-1559
  const feeData = await provider.getFeeData();
  let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || 1_500_000_000n;
  let maxFeePerGas = feeData.maxFeePerGas || 30_000_000_000n;

  const boostPriority = congested ? config.congestionMultiplier : config.priorityBoost;
  const boostMax = congested ? config.congestionMultiplier : config.maxBoost;

  maxPriorityFeePerGas = maxPriorityFeePerGas * BigInt(Math.round(boostPriority * 100)) / 100n;
  maxFeePerGas = maxFeePerGas * BigInt(Math.round(boostMax * 100)) / 100n;

  return { maxFeePerGas, maxPriorityFeePerGas };
}

export { isCongested };
