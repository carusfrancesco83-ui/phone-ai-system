// whatsapp.js
// Invia notifiche SMS ai responsabili quando arriva un nuovo lead.
// Modifica solo questo blocco per aggiornare mappature.

// ============================================================
// MAPPATURA SERVIZIO → NUMERO SMS RESPONSABILE
// Formato: "+39XXXXXXXXXX"
// ============================================================
const RESPONSABILI = {
  ESPURGO:        "+393493684887",
  RELINING:       "+39XXXXXXXXXX",
  VIDEOISPEZIONE: "+39XXXXXXXXXX",
  MONTAGGIO_AMEX: "+39XXXXXXXXXX",
  DA_DEFINIRE:    "+39XXXXXXXXXX",  // numero admin/fallback
};

// Numero Twilio mittente SMS (già configurato in ENV)
const FROM_NUMBER = (process.env.TWILIO_PHONE_NUMBER || "").trim();

async function sendWhatsAppNotifica(leadData) {
  const { nome, telefono, città, servizio, messaggiooriginale, data } = leadData;

  const destinatario = RESPONSABILI[servizio] || RESPONSABILI.DA_DEFINIRE;
  if (!destinatario || destinatario.includes("XXXXXXXXXX")) {
    console.warn(`⚠️ Numero SMS non configurato per servizio: ${servizio}`);
    return;
  }

  const accountSid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
  const authToken  = (process.env.TWILIO_AUTH_TOKEN  || "").trim();

  const messaggio =
    `NUOVA RICHIESTA - ${servizio}\n` +
    `Cliente: ${nome || "N/D"}\n` +
    `Telefono: ${telefono || "N/D"}\n` +
    `Citta: ${città || "N/D"}\n` +
    `Problema: ${messaggiooriginale || "N/D"}\n` +
    `Data: ${data || new Date().toLocaleString("it-IT")}`;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  const body = new URLSearchParams({
    From: FROM_NUMBER,
    To:   destinatario,
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
    console.error(`❌ SMS error ${response.status}: ${err}`);
  } else {
    console.log(`📲 SMS inviato a ${destinatario} (${servizio})`);
  }
}

module.exports = { sendWhatsAppNotifica };
