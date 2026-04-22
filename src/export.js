import { getAllMatches, redis } from "./lib/redis.js";
import { writeFileSync } from "node:fs";
import "dotenv/config";

async function main() {
  const matches = await getAllMatches();
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `results_${stamp}.txt`;

  const header = `# Export ${now.toISOString()} | count=${matches.length}\n`;
  const lines = matches
    .map((m) => `${m.chain.toUpperCase()} | ${m.address} | native=${m.nativeBalance} | stables=$${m.stableTotal} | tx=${m.txCount}`)
    .join("\n");

  const content = header + lines + "\n";
  writeFileSync(filename, content);
  writeFileSync("results_latest.txt", content);

  console.log(`Exported ${matches.length} matches to ${filename}`);
  await redis.quit();
}

main();
