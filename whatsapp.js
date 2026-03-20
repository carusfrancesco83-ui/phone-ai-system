// whatsapp.js
// Invia notifiche WhatsApp ai responsabili quando arriva un nuovo lead.
// Modifica solo questo blocco per aggiornare mappature.

// ============================================================
// MAPPATURA SERVIZIO → NUMERO WHATSAPP RESPONSABILE
// Formato: "+39XXXXXXXXXX" oppure "+1XXXXXXXXXX"
// ============================================================
const RESPONSABILI = {
  ESPURGO: "+393493684887",
  RELINING: "+39XXXXXXXXXX",
  VIDEOISPEZIONE: "+39XXXXXXXXXX",
  MONTAGGIO_AMEX: "+39XXXXXXXXXX",
  DA_DEFINIRE: "+39XXXXXXXXXX",  // numero admin/fallback
};

// Numero sandbox Twilio WhatsApp (non cambiare)
const SANDBOX_NUMBER = "whatsapp:+14155238886";

async function sendWhatsAppNotifica(leadData) {
  const { nome, telefono, città, servizio, messaggiooriginale, data } = leadData;

  const destinatario = RESPONSABILI[servizio] || RESPONSABILI.DA_DEFINIRE;
  if (!destinatario || destinatario.includes("XXXXXXXXXX")) {
    console.warn(`⚠️ Numero WhatsApp non configurato per servizio: ${servizio}`);
    return;
  }

  const accountSid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
  const authToken = (process.env.TWILIO_AUTH_TOKEN || "").trim();

  const messaggio =
    `🔔 NUOVA RICHIESTA - ${servizio}\n` +
    `👤 Cliente: ${nome || "N/D"}\n` +
    `📞 Telefono: ${telefono || "N/D"}\n` +
    `📍 Città: ${città || "N/D"}\n` +
    `🔧 Problema: ${messaggiooriginale || "N/D"}\n` +
    `📅 Data: ${data || new Date().toLocaleString("it-IT")}`;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  const body = new URLSearchParams({
    From: SANDBOX_NUMBER,
    To: `whatsapp:${destinatario}`,
    Body: messaggio,
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error(`❌ WhatsApp error ${response.status}: ${err}`);
  } else {
    console.log(`📲 WhatsApp inviato a ${destinatario} (${servizio})`);
  }
}

module.exports = { sendWhatsAppNotifica };
