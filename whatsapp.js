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

async function sendTelegramMessage(token, chatId, testo, parseMode) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const body = { chat_id: chatId, text: testo };
  if (parseMode) body.parse_mode = parseMode;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.text();
    console.error(`❌ Telegram error ${response.status}: ${err}`);
  }
  return response.ok;
}

async function sendWhatsAppNotifica(leadData) {
  const { nome, cognome, telefono, email, problema, servizio } = leadData;
  const nomeCompleto = [nome, cognome].filter(Boolean).join(" ") || "N/D";

  // ── Notifica specifica per servizio ──────────────────────────────────────────
  const token  = (BOT_TOKEN_MAP[servizio] || process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = CHAT_ID_MAP[servizio] || process.env.TELEGRAM_CHAT_DA_DEFINIRE || process.env.TELEGRAM_CHAT_ID;

  if (!token) {
    console.warn("⚠️ TELEGRAM_BOT_TOKEN non configurato");
  } else if (!chatId) {
    console.warn(`⚠️ Chat ID Telegram non configurato per servizio: ${servizio}`);
  } else {
    const tel = (telefono || "").replace(/\D/g, "");
    const testo =
      `<b>NUOVA RICHIESTA - ${servizio}</b>\n\n` +
      `<b>Nome:</b>     ${nomeCompleto}\n` +
      `<b>Telefono:</b> ${tel ? `<a href="tel:+${tel}">+${tel}</a>` : "N/D"}\n` +
      `<b>Email:</b>    ${email    || "N/D"}\n` +
      `<b>Problema:</b> ${problema || "N/D"}`;

    const ok = await sendTelegramMessage(token, chatId, testo, "HTML");
    if (ok) console.log(`📲 Telegram inviato a ${servizio} (chat: ${chatId})`);
  }

  // ── Notifica generale (tutti i lead, solo dati anagrafici) ───────────────────
  const tokenAll  = (process.env.TELEGRAM_BOT_TOKEN_ALL || "").trim();
  const chatIdAll = process.env.TELEGRAM_CHAT_ALL || "";

  if (tokenAll && chatIdAll) {
    const tel = (telefono || "").replace(/\D/g, "");
    const testoAll =
      `<b>NUOVO LEAD - ${servizio}</b>\n\n` +
      `<b>Nome:</b>     ${nome     || "N/D"}\n` +
      `<b>Cognome:</b>  ${cognome  || "N/D"}\n` +
      `<b>Telefono:</b> ${tel ? `<a href="tel:+${tel}">+${tel}</a>` : "N/D"}\n` +
      `<b>Email:</b>    ${email    || "N/D"}`;
    const ok = await sendTelegramMessage(tokenAll, chatIdAll, testoAll, "HTML");
    if (ok) console.log(`📲 Telegram generale inviato (chat: ${chatIdAll})`);
  }
}

module.exports = { sendWhatsAppNotifica };
