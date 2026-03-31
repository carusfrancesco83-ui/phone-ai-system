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

// ============================================================
// MAPPATURA SERVIZIO → BOT TOKEN (opzionale per bot separati)
// Se non configurato, usa TELEGRAM_BOT_TOKEN come fallback
// ============================================================
const BOT_TOKEN_MAP = {
  ESPURGO:        process.env.TELEGRAM_BOT_TOKEN_ESPURGO,
  RELINING:       process.env.TELEGRAM_BOT_TOKEN_RELINING,
  VIDEOISPEZIONE: process.env.TELEGRAM_BOT_TOKEN_VIDEOISPEZIONE,
  MONTAGGIO_AMEX: process.env.TELEGRAM_BOT_TOKEN_MONTAGGIO_AMEX,
  DA_DEFINIRE:    process.env.TELEGRAM_BOT_TOKEN_DA_DEFINIRE,
};

async function sendTelegramMessage(token, chatId, testo) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: testo }),
  });
  if (!response.ok) {
    const err = await response.text();
    console.error(`❌ Telegram error ${response.status}: ${err}`);
  }
  return response.ok;
}

async function sendWhatsAppNotifica(leadData) {
  const { nome, telefono, email, problema, servizio } = leadData;

  // Notifica specifica per servizio
  const token  = (BOT_TOKEN_MAP[servizio] || process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = CHAT_ID_MAP[servizio] || process.env.TELEGRAM_CHAT_DA_DEFINIRE || process.env.TELEGRAM_CHAT_ID;

  if (!token) {
    console.warn("⚠️ TELEGRAM_BOT_TOKEN non configurato");
  } else if (!chatId) {
    console.warn(`⚠️ Chat ID Telegram non configurato per servizio: ${servizio}`);
  } else {
    const testo =
      `NUOVA RICHIESTA - ${servizio}\n\n` +
      `Nome:     ${nome     || "N/D"}\n` +
      `Telefono: ${telefono || "N/D"}\n` +
      `Email:    ${email    || "N/D"}\n` +
      `Problema: ${problema || "N/D"}`;

    const ok = await sendTelegramMessage(token, chatId, testo);
    if (ok) console.log(`📲 Telegram inviato a ${servizio} (chat: ${chatId})`);
  }

  // Notifica generale (monitoraggio)
  const tokenAll = (process.env.TELEGRAM_BOT_TOKEN_ALL || "").trim();
  const chatIdAll = process.env.TELEGRAM_CHAT_ALL || "";

  if (tokenAll && chatIdAll) {
    const testoAll =
      `NUOVA RICHIESTA - ${servizio}\n\n` +
      `Nome:     ${nome     || "N/D"}\n` +
      `Telefono: ${telefono || "N/D"}\n` +
      `Email:    ${email    || "N/D"}\n` +
      `Problema: ${problema || "N/D"}`;
    const ok = await sendTelegramMessage(tokenAll, chatIdAll, testoAll);
    if (ok) console.log(`📲 Telegram generale inviato (chat: ${chatIdAll})`);
  }
}

module.exports = { sendWhatsAppNotifica };
