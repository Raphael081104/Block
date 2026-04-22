import { NULL_ADDRESS } from "../config/chains.js";

/**
 * Couche 2 — Décodeur unifié
 * Normalise les transactions EVM en format standard :
 * { from, to, value, token, gas, block, hash, isDex }
 */
export function decodeBlock(block, chainConfig) {
  if (!block || !block.transactions) return [];

  const routerSet = new Set(chainConfig.dexRouters.map((r) => r.toLowerCase()));
  const decoded = [];

  for (const tx of block.transactions) {
    const from = (tx.from || "").toLowerCase();
    const to = (tx.to || "").toLowerCase();

    if (!from || from === NULL_ADDRESS) continue;
    if (!to || to === NULL_ADDRESS) continue;

    decoded.push({
      from,
      to,
      value: parseInt(tx.value || "0x0", 16) / 10 ** chainConfig.nativeDecimals,
      gas: parseInt(tx.gas || tx.gasLimit || "0x0", 16),
      gasPrice: parseInt(tx.gasPrice || "0x0", 16),
      block: parseInt(block.number, 16),
      hash: tx.hash,
      isDex: routerSet.has(to),
    });
  }

  return decoded;
}

/**
 * Extrait les adresses uniques + DEX users depuis les txs décodées
 */
export function extractAddresses(decodedTxs) {
  const addresses = new Set();
  const dexUsers = new Set();

  for (const tx of decodedTxs) {
    addresses.add(tx.from);
    addresses.add(tx.to);
    if (tx.isDex) dexUsers.add(tx.from);
  }

  return { addresses: [...addresses], dexUsers };
}
