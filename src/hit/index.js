import 'dotenv/config';
import { startDetector } from './detector.js';
import { initHitAlerts } from './alerts.js';

// Required env:
//   MAIN_WALLET        — destination for auto-transfers
//   VAULT_PASSWORD     — decrypt vanity private keys
//   TELEGRAM_BOT_TOKEN — alerts (optional)
//   TELEGRAM_CHAT_ID   — alerts (optional)
//   REDIS_URL          — Redis connection (default: localhost)

initHitAlerts();
startDetector().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
