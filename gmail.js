// gmail.js
// Invia notifiche email via Gmail SMTP quando arriva un nuovo lead da chiamata vocale.
// Richiede un'App Password Gmail (non la password dell'account).
// Guida: https://myaccount.google.com/apppasswords

const nodemailer = require("nodemailer");

async function sendEmailNotifica(leadData) {
  const { nome, telefono, email, problema, servizio, città, indirizzo } = leadData;

  const gmailUser     = (process.env.GMAIL_USER     || "").trim();
  const gmailPassword = (process.env.GMAIL_APP_PASSWORD || "").trim();
  const emailTo       = (process.env.GMAIL_NOTIFY_TO || gmailUser).trim();

  console.log(`📧 Tentativo email → user="${gmailUser ? gmailUser : "NON_SET"}" pass="${gmailPassword ? "***" : "NON_SET"}"`);

  if (!gmailUser || !gmailPassword) {
    console.log("⚠️ GMAIL_USER o GMAIL_APP_PASSWORD non configurati — email non inviata");
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: gmailUser,
      pass: gmailPassword,
    },
  });

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

  await transporter.sendMail({
    from:    `"Phone AI System" <${gmailUser}>`,
    to:      emailTo,
    subject,
    text,
  });

  console.log(`📧 Email notifica inviata a ${emailTo}`);
}

module.exports = { sendEmailNotifica };
