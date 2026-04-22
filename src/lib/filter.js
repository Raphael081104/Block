import { FILTER_CONFIG, ERC20_BALANCE_OF } from "../config/chains.js";
import { isScanned, markScanned, saveMatch } from "./redis.js";
import { sendAlert } from "./telegram.js";

/**
 * Couche 3 — Filtrage séquentiel (cheap → expensive)
 * 1. Déjà scanné ? → skip
 * 2. DEX user ? → sinon skip
 * 3. Native balance >= min ? → sinon skip
 * 4. TX count >= min ? → sinon skip
 * 5. Stablecoins >= min ? → sinon skip
 * → MATCH → Redis + Telegram
 */

async function rpcCall(provider, method, params) {
  const body = { jsonrpc: "2.0", id: 1, method, params };
  const resp = await fetch(provider, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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

export async function filterAddress(address, chain, chainConfig, dexUsers, rpcUrl) {
  // 1. Déjà scanné
  if (await isScanned(address, chain)) return null;

  // 2. DEX user
  if (!dexUsers.has(address)) {
    await markScanned(address, chain);
    return null;
  }

  // 3. Native balance
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

  // MATCH
  const matchData = {
    nativeBalance: Math.round(nativeBalance * 10000) / 10000,
    nativeSymbol: chainConfig.nativeSymbol,
    txCount,
    stablecoins: JSON.stringify(stablecoins),
    stableTotal: Math.round(stableTotal * 100) / 100,
    dexUser: "true",
  };

  await saveMatch(address, chain, matchData);
  await markScanned(address, chain);
  await sendAlert(chain, address, { ...matchData, stablecoins });

  return matchData;
}
