import { ethers } from 'ethers';
import { getGasParams } from './gas.js';
import { CHAINS } from '../config/chains.js';

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

/**
 * Build and send a transaction (native or ERC-20)
 * @param {object} opts
 * @param {string} opts.chainKey - chain key from CHAINS
 * @param {string} opts.privateKey - sender private key
 * @param {string} opts.to - recipient address
 * @param {string} opts.amount - human-readable amount (e.g. "0.001")
 * @param {string} [opts.token] - ERC-20 contract address (omit for native)
 * @returns {Promise<{hash: string, from: string, to: string, amount: string, chain: string}>}
 */
export async function sendTx({ chainKey, privateKey, to, amount, token }) {
  const chain = CHAINS[chainKey];
  if (!chain) throw new Error(`Unknown chain: ${chainKey}`);

  const provider = new ethers.JsonRpcProvider(chain.rpcs[0]);
  const wallet = new ethers.Wallet(privateKey, provider);
  const gasParams = await getGasParams(provider, chainKey);

  if (token) {
    // ERC-20 transfer
    const contract = new ethers.Contract(token, ERC20_ABI, wallet);
    const decimals = await contract.decimals();
    const symbol = await contract.symbol();
    const value = ethers.parseUnits(amount, decimals);

    const tx = await contract.transfer(to, value, gasParams);
    const receipt = await tx.wait();

    return {
      hash: receipt.hash,
      from: wallet.address,
      to,
      amount: `${amount} ${symbol}`,
      chain: chain.name,
      gasUsed: receipt.gasUsed.toString(),
    };
  }

  // Native transfer
  const value = ethers.parseUnits(amount, chain.nativeDecimals);
  const tx = await wallet.sendTransaction({
    to,
    value,
    ...gasParams,
  });
  const receipt = await tx.wait();

  return {
    hash: receipt.hash,
    from: wallet.address,
    to,
    amount: `${amount} ${chain.nativeSymbol}`,
    chain: chain.name,
    gasUsed: receipt.gasUsed.toString(),
  };
}
