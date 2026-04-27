// whatsapp.js
// Invia notifiche Telegram ai responsabili quando arriva un nuovo lead.
// Modifica solo questo blocco per aggiornare mappature.

// ============================================================
// MAPPATURA SERVIZIO → VARIABILE ENV DEL CHAT ID TELEGRAM
// Gruppi:
//   -5226226627  Pulizia e Spurgo (ESPURGO, PULIZIA_CISTERNE, MONTAGGIO_AMEX)
//   -5195212733  Videoispezione
//   -5148155974  Relining Tubazioni
//   -5184558703  Mappatura delle Reti
//   -5195790572  Altro / Generale (fallback)
// ============================================================
const CHAT_ID_MAP = {
  ESPURGO:          process.env.TELEGRAM_CHAT_ESPURGO,
  PULIZIA_CISTERNE: process.env.TELEGRAM_CHAT_PULIZIA_CISTERNE,
  MONTAGGIO_AMEX:   process.env.TELEGRAM_CHAT_MONTAGGIO_AMEX,
  RELINING:         process.env.TELEGRAM_CHAT_RELINING,
  VIDEOISPEZIONE:   process.env.TELEGRAM_CHAT_VIDEOISPEZIONE,
  MAPPATURA_RETI:   process.env.TELEGRAM_CHAT_MAPPATURA_RETI,
  DA_DEFINIRE:      process.env.TELEGRAM_CHAT_DA_DEFINIRE,
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
  const token  = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = CHAT_ID_MAP[servizio] || process.env.TELEGRAM_CHAT_DA_DEFINIRE;

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

  // ── Notifica generale (tutti i lead) → gruppo GENERALE (-5195790572) ─────────
  const tokenAll  = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatIdAll = process.env.TELEGRAM_CHAT_GENERALE || "";

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
