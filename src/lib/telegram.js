import TelegramBot from "node-telegram-bot-api";

let bot = null;
const chatId = process.env.TELEGRAM_CHAT_ID;

export function initTelegram() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) {
    console.warn("[Telegram] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID — alerts disabled");
    return;
  }
  bot = new TelegramBot(token, { polling: false });
  console.log("[Telegram] Alerts enabled");
}

export async function sendAlert(chain, address, data) {
  if (!bot) return;
  const msg = [
    `🎯 *MATCH — ${chain.toUpperCase()}* ${data.label || ""}`,
    `Score: *${data.score || "?"}*/100`,
    `\`${address}\``,
    `Native: ${data.nativeBalance} ${data.nativeSymbol}`,
    `Stables: $${data.stableTotal}`,
    `TX count: ${data.txCount}`,
    `DEX user: ✅`,
    Object.entries(data.stablecoins || {}).map(([k, v]) => `  ${k}: $${v}`).join("\n"),
  ].join("\n");

  try {
    await bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
  } catch (err) {
    console.error("[Telegram] Send failed:", err.message);
  }
}
