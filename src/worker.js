import { parentPort, workerData } from "node:worker_threads";
import { WebSocketProvider } from "ethers";
import { decodeBlock, extractAddresses } from "./lib/decoder.js";
import { filterAndScore } from "./scoring/filters.js";

const { chain, chainConfig } = workerData;
const BATCH_SIZE = 10;
let rpcIndex = 0;
let reconnectDelay = 1000;

function getRpc() {
  const rpc = chainConfig.rpcs[rpcIndex % chainConfig.rpcs.length];
  rpcIndex++;
  return rpc;
}

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}][${chain.toUpperCase()}] ${msg}`);
}

async function processBlock(blockNumber, provider) {
  try {
    const block = await provider.send("eth_getBlockByNumber", [
      "0x" + blockNumber.toString(16),
      true,
    ]);
    if (!block) return;

    const decoded = decodeBlock(block, chainConfig);
    const { addresses, dexUsers } = extractAddresses(decoded);

    log(`Block ${blockNumber} | ${decoded.length} txs | ${addresses.length} addrs | ${dexUsers.size} dex`);

    const rpcUrl = getRpc();
    let matches = 0;

    // Filtre par batch
    for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
      const batch = addresses.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((addr) => filterAndScore(addr, chain, chainConfig, dexUsers, rpcUrl))
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) matches++;
      }
    }

    if (matches > 0) log(`${matches} MATCH(es) in block ${blockNumber}`);

    parentPort?.postMessage({
      type: "block_processed",
      chain,
      blockNumber,
      txCount: decoded.length,
      addresses: addresses.length,
      matches,
    });
  } catch (err) {
    log(`Error processing block ${blockNumber}: ${err.message}`);
  }
}

async function connect() {
  log(`Connecting to WebSocket...`);

  let ws;
  try {
    ws = new WebSocketProvider(chainConfig.ws);
    await ws.ready;
  } catch (err) {
    log(`WS connection failed: ${err.message} — retry in ${reconnectDelay / 1000}s`);
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
    return;
  }

  reconnectDelay = 1000;
  log(`Connected — listening for new blocks`);

  parentPort?.postMessage({ type: "connected", chain });

  ws.on("block", (blockNumber) => {
    processBlock(blockNumber, ws);
  });

  ws.websocket.on("close", () => {
    log(`WebSocket closed — reconnecting in ${reconnectDelay / 1000}s`);
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
  });

  ws.websocket.on("error", (err) => {
    log(`WebSocket error: ${err.message}`);
  });
}

connect();
