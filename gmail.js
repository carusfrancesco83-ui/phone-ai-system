// gmail.js
// Invia notifiche email via:
//   1. Resend API (HTTPS) — raccomandato per Railway (SMTP bloccato)
//      Registrati su https://resend.com, ottieni RESEND_API_KEY gratuita (100 email/giorno)
//   2. Gmail SMTP (fallback per sviluppo locale)
//      Richiede App Password: https://myaccount.google.com/apppasswords

const nodemailer = require("nodemailer");

async function sendEmailNotifica(leadData) {
  const { nome, telefono, email, problema, servizio, città, indirizzo } = leadData;

  const resendApiKey  = (process.env.RESEND_API_KEY      || "").trim();
  const gmailUser     = (process.env.GMAIL_USER          || "").trim();
  const gmailPassword = (process.env.GMAIL_APP_PASSWORD  || "").trim();
  const emailTo       = (process.env.GMAIL_NOTIFY_TO     || gmailUser).trim();

  if (!emailTo) {
    console.log("⚠️ Nessun destinatario email configurato (GMAIL_NOTIFY_TO / GMAIL_USER) — email non inviata");
    return;
  }

  const subject = `📞 Nuova richiesta ${servizio || "DA_DEFINIRE"} — ${nome || "Sconosciuto"}`;
  const text =
    `NUOVA RICHIESTA DA CHIAMATA VOCALE\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Servizio:  ${servizio  || "N/D"}\n` +
    `Nome:      ${nome      || "N/D"}\n` +
    `Telefono:  ${telefono  || "N/D"}\n` +
    `Email:     ${email     || "N/D"}\n` +
    `Città:     ${città     || "N/D"}\n` +
    `Indirizzo: ${indirizzo || "N/D"}\n\n` +
    `Problema:\n${problema  || "N/D"}\n`;

  // ── 1. Resend API (HTTP — funziona su Railway) ──────────────────────────
  if (resendApiKey) {
    console.log(`📧 Invio email via Resend → ${emailTo}`);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        from:    "Phone AI System <onboarding@resend.dev>",
        to:      [emailTo],
        subject,
        text,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`❌ Resend errore ${res.status}: ${errBody}`);
      throw new Error(`Resend ${res.status}: ${errBody}`);
    }

    const data = await res.json();
    console.log(`📧 Email notifica inviata via Resend (id: ${data.id})`);
    return;
  }

  // ── 2. Gmail SMTP (fallback — solo dev locale) ──────────────────────────
  if (!gmailUser || !gmailPassword) {
    console.log("⚠️ RESEND_API_KEY non configurata e GMAIL credenziali mancanti — email non inviata");
    return;
  }

  console.log(`📧 Tentativo email SMTP → user="${gmailUser}" pass="***"`);
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: gmailUser, pass: gmailPassword },
    connectionTimeout: 10000,
    greetingTimeout:   10000,
    socketTimeout:     15000,
  });

  try {
    await transporter.sendMail({
      from:    `"Phone AI System" <${gmailUser}>`,
      to:      emailTo,
      subject,
      text,
    });
    console.log(`📧 Email notifica inviata via SMTP a ${emailTo}`);
  } catch (err) {
    console.error(`❌ Email SMTP errore: ${err.message}`);
    throw err;
  }
}

module.exports = { sendEmailNotifica };
