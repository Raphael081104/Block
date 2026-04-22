import TelegramBot from 'node-telegram-bot-api';

let bot = null;
const chatId = process.env.TELEGRAM_CHAT_ID;

export function initHitAlerts() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) {
    console.warn('[HitAlerts] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID — alerts disabled');
    return;
  }
  bot = new TelegramBot(token, { polling: false });
  console.log('[HitAlerts] Telegram alerts enabled');
}

/**
 * Send hit alert to Telegram
 * @param {object} opts
 * @param {string} opts.chain - chain name
 * @param {string} opts.to - recipient address
 * @param {string} opts.from - sender address
 * @param {string} opts.value - amount
 * @param {string} opts.symbol - token symbol
 * @param {string} opts.txHash - transaction hash
 * @param {string} [opts.type] - 'transfer' for auto-transfer confirmation
 */
export async function sendHitAlert({ chain, to, from, value, symbol, txHash, type }) {
  if (!bot) return;

  let msg;

  if (type === 'transfer') {
    msg = [
      `*AUTO-TRANSFER CONFIRMED*`,
      `Chain: *${chain}*`,
      `${value} ${symbol}`,
      `\`${from}\` -> Main wallet`,
      `TX: \`${txHash}\``,
    ].join('\n');
  } else {
    msg = [
      `*HIT DETECTED*`,
      `Chain: *${chain}*`,
      `${value} ${symbol} received`,
      `To: \`${to}\``,
      `From: \`${from}\``,
      `TX: \`${txHash}\``,
      `Auto-transfer in progress...`,
    ].join('\n');
  }

  try {
    await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('[HitAlerts] Send failed:', err.message);
  }
}
