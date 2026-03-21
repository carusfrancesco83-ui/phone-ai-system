// src/server.js
require("dotenv").config();

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");

const twilioRoutes = require("./twilio");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// ─── ROUTES ───────────────────────────────────────────────────────────────────
app.use("/twilio", twilioRoutes);

// ─── POST /webhook/lead-notify ────────────────────────────────────────────────
// Chiamato da n8n (WhatsApp bot) dopo aver completato un lead.
// Body JSON: { nome, telefono, email, indirizzo, città, servizio, problema, source }
app.post("/webhook/lead-notify", async (req, res) => {
  const { sendWhatsAppNotifica } = require("./whatsapp");
  const { sendEmailNotifica }    = require("./gmail");

  const lead = req.body || {};
  const notifData = {
    nome:      lead.nome      || "",
    telefono:  lead.telefono  || "",
    email:     lead.email     || "",
    problema:  lead.problema  || "",
    servizio:  lead.servizio  || "DA_DEFINIRE",
    città:     lead.città     || "",
    indirizzo: lead.indirizzo || "",
  };

  console.log(`📲 /webhook/lead-notify ricevuto: ${JSON.stringify(notifData)}`);

  const results = await Promise.allSettled([
    sendWhatsAppNotifica(notifData),
    sendEmailNotifica(notifData),
  ]);

  results.forEach((r, i) => {
    if (r.status === "rejected")
      console.error(`❌ Notifica ${i === 0 ? "Telegram" : "Email"} fallita:`, r.reason?.message);
  });

  res.json({ ok: true });
});

// Health check
app.get("/health", (req, res) => res.json({ status: "ok" }));

// Debug variabili Telegram
app.get("/debug/telegram", (req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  const chatId = process.env.TELEGRAM_CHAT_ID || "";
  res.json({
    token_presente: token.length > 0,
    token_prefisso: token.substring(0, 10) + "...",
    chat_id: chatId,
    chat_id_presente: chatId.length > 0,
  });
});

// Test notifica Telegram (risposta raw Telegram)
app.get("/test-telegram", async (req, res) => {
  const token  = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = process.env.TELEGRAM_CHAT_ID || "";
  const url    = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "Test notifica Ecosan - funziona!",
      }),
    });
    const body = await r.json();
    res.json({ http_status: r.status, telegram_response: body });
  } catch (e) {
    res.json({ errore: e.message });
  }
});

// Debug Airtable: verifica token e lista tabelle disponibili
app.get("/debug/airtable", async (req, res) => {
  const apiKey = (process.env.AIRTABLE_API_KEY || "").replace(/[\r\n\s]/g, "");
  const baseId  = (process.env.AIRTABLE_BASE_ID  || "").replace(/[\r\n\s]/g, "");

  try {
    const r = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const body = await r.json();
    res.json({ status: r.status, apiKeyPrefix: apiKey.substring(0, 12), baseId, body });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// Debug variabili Gmail
app.get("/debug/gmail", (req, res) => {
  const user = (process.env.GMAIL_USER || "").trim();
  const pass = (process.env.GMAIL_APP_PASSWORD || "").trim();
  const to   = (process.env.GMAIL_NOTIFY_TO || user).trim();
  res.json({
    GMAIL_USER_presente:         user.length > 0,
    GMAIL_USER_prefisso:         user ? user.substring(0, 5) + "..." : "NON_SET",
    GMAIL_APP_PASSWORD_presente: pass.length > 0,
    GMAIL_APP_PASSWORD_lunghezza: pass.length,
    GMAIL_NOTIFY_TO:             to || "NON_SET",
  });
});

// Test invio email Gmail
app.get("/test-gmail", async (req, res) => {
  const { sendEmailNotifica } = require("./gmail");
  try {
    await sendEmailNotifica({
      nome:      "Test Railway",
      telefono:  "+39000000000",
      email:     "test@test.it",
      problema:  "Email di test dalla route /test-gmail",
      servizio:  "Test",
      città:     "Test",
      indirizzo: "Via Test 1",
    });
    res.json({ successo: true, messaggio: "Email inviata — controlla la casella" });
  } catch (e) {
    res.json({ successo: false, errore: e.message, codice: e.code || null });
  }
});

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "Phone AI System",
    timestamp: new Date().toISOString(),
  });
});

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║      📞 Phone AI System avviato      ║
  ╠══════════════════════════════════════╣
  ║  Server:  http://localhost:${PORT}      ║
  ║  Business: ${(process.env.BUSINESS_NAME || "").padEnd(24)}║
  ╚══════════════════════════════════════╝

  Webhook Twilio → ${process.env.BASE_URL}/twilio/incoming
  `);
});

module.exports = app;
