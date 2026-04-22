import { FILTER_CONFIG, ERC20_BALANCE_OF } from "../config/chains.js";
import { isScanned, markScanned, saveMatch, isTestTxPattern, getRecurrence } from "../lib/redis.js";
import { sendAlert } from "../lib/telegram.js";
import { scoreWallet, scoreLabel } from "./target-scorer.js";

async function rpcCall(rpcUrl, method, params) {
  const resp = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const data = await resp.json();
  return data.result;
}

async function getNativeBalance(rpc, address, decimals) {
  const result = await rpcCall(rpc, "eth_getBalance", [address, "latest"]);
  if (!result) return 0;
  return parseInt(result, 16) / 10 ** decimals;
}

async function getTxCount(rpc, address) {
  const result = await rpcCall(rpc, "eth_getTransactionCount", [address, "latest"]);
  if (!result) return 0;
  return parseInt(result, 16);
}

async function getErc20Balance(rpc, tokenAddress, walletAddress, decimals) {
  const padded = walletAddress.replace("0x", "").padStart(64, "0");
  const data = ERC20_BALANCE_OF + padded;
  const result = await rpcCall(rpc, "eth_call", [{ to: tokenAddress, data }, "latest"]);
  if (!result || result === "0x") return 0;
  return parseInt(result, 16) / 10 ** decimals;
}

/**
 * Pipeline de filtrage complet :
 * 1. Dedup (Redis)
 * 2. DEX user check
 * 3. Wallet type (EOA only — reject contracts)
 * 4. Native balance >= min
 * 5. TX count >= min
 * 6. Stablecoins >= min
 * 7. Score 0-100
 * → MATCH si score > 0 (tous les filtres passés)
 */
export async function filterAndScore(address, chain, chainConfig, dexUsers, rpcUrl, blocksSeen, avgGasPrice, decodedTxs) {
  // 1. Dedup
  if (await isScanned(address, chain)) return null;

  // 2. DEX user
  if (!dexUsers.has(address)) {
    await markScanned(address, chain);
    return null;
  }

  // 3. Wallet type — EOA only (MetaMask/Trust), reject contracts
  const code = await rpcCall(rpcUrl, "eth_getCode", [address, "latest"]);
  if (code && code !== "0x" && code !== "0x0") {
    await markScanned(address, chain);
    return null; // Contract address — skip
  }

  // 4. Native balance
  const nativeBalance = await getNativeBalance(rpcUrl, address, chainConfig.nativeDecimals);
  if (nativeBalance < FILTER_CONFIG.minNative) {
    await markScanned(address, chain);
    return null;
  }

  // 4. TX count
  const txCount = await getTxCount(rpcUrl, address);
  if (txCount < FILTER_CONFIG.minTxCount) {
    await markScanned(address, chain);
    return null;
  }

  // 5. Stablecoins
  const stablecoins = {};
  let stableTotal = 0;
  for (const [name, info] of Object.entries(chainConfig.stablecoins)) {
    const bal = await getErc20Balance(rpcUrl, info.address, address, info.decimals);
    if (bal > 0) {
      stablecoins[name] = Math.round(bal * 100) / 100;
      stableTotal += bal;
    }
  }
  if (stableTotal < FILTER_CONFIG.minStablecoins) {
    await markScanned(address, chain);
    return null;
  }

  // 6. Balance totale > $10K (native + stables)
  const totalBalanceUsd = stableTotal + nativeBalance * 1000;
  if (totalBalanceUsd < FILTER_CONFIG.minBalanceUsd) {
    await markScanned(address, chain);
    return null;
  }

  // 7. Test TX Pattern — detect small sends from this rich wallet to new addresses
  let hasTestTx = false;
  const txsFromAddr = (decodedTxs || []).filter((tx) => tx.from === address);
  for (const tx of txsFromAddr) {
    if (await isTestTxPattern(chain, address, tx.to, tx.value, nativeBalance)) {
      hasTestTx = true;
      break;
    }
  }

  // 8. Récurrence — envoie à la même adresse 2+ fois en 30 jours
  let maxRecurrence = 0;
  for (const tx of txsFromAddr) {
    const count = await getRecurrence(chain, address, tx.to);
    if (count > maxRecurrence) maxRecurrence = count;
  }

  // 9. Score
  const { score, breakdown } = scoreWallet({
    nativeBalance,
    stableTotal,
    txCount,
    isDex: true,
    blocksSeen: blocksSeen || 1,
    avgGasPrice: avgGasPrice || 20,
    hasTestTx,
    recurrence: maxRecurrence,
  });

  const label = scoreLabel(score);

  const matchData = {
    nativeBalance: Math.round(nativeBalance * 10000) / 10000,
    nativeSymbol: chainConfig.nativeSymbol,
    txCount,
    stablecoins: JSON.stringify(stablecoins),
    stableTotal: Math.round(stableTotal * 100) / 100,
    dexUser: "true",
    score,
    label,
    breakdown: JSON.stringify(breakdown),
  };

  await saveMatch(address, chain, matchData);
  await markScanned(address, chain);
  await sendAlert(chain, address, { ...matchData, stablecoins, score, label });

  return matchData;
}
