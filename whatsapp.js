// whatsapp.js
// Invia notifiche Telegram ai responsabili quando arriva un nuovo lead.
// Modifica solo questo blocco per aggiornare mappature.

// ============================================================
// MAPPATURA SERVIZIO → VARIABILE ENV DEL CHAT ID TELEGRAM
// ============================================================
const CHAT_ID_MAP = {
  ESPURGO:        process.env.TELEGRAM_CHAT_ESPURGO,
  RELINING:       process.env.TELEGRAM_CHAT_RELINING,
  VIDEOISPEZIONE: process.env.TELEGRAM_CHAT_VIDEOISPEZIONE,
  MONTAGGIO_AMEX: process.env.TELEGRAM_CHAT_MONTAGGIO_AMEX,
  DA_DEFINIRE:    process.env.TELEGRAM_CHAT_DA_DEFINIRE,
};

async function sendWhatsAppNotifica(leadData) {
  const { nome, telefono, città, servizio, messaggiooriginale, data } = leadData;

  const token   = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId  = CHAT_ID_MAP[servizio] || process.env.TELEGRAM_CHAT_DA_DEFINIRE;

  if (!token) {
    console.warn("⚠️ TELEGRAM_BOT_TOKEN non configurato");
    return;
  }
  if (!chatId) {
    console.warn(`⚠️ Chat ID Telegram non configurato per servizio: ${servizio}`);
    return;
  }

  const testo =
    `🔔 *NUOVA RICHIESTA - ${servizio}*\n` +
    `👤 Cliente: ${nome || "N/D"}\n` +
    `📞 Telefono: ${telefono || "N/D"}\n` +
    `📍 Città: ${città || "N/D"}\n` +
    `🔧 Problema: ${messaggiooriginale || "N/D"}\n` +
    `📅 Data: ${data || new Date().toLocaleString("it-IT")}`;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id:    chatId,
      text:       testo,
      parse_mode: "Markdown",
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error(`❌ Telegram error ${response.status}: ${err}`);
  } else {
    console.log(`📲 Telegram inviato a ${servizio} (chat: ${chatId})`);
  }
}

module.exports = { sendWhatsAppNotifica };
