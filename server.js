// src/server.js
require("dotenv").config();

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");

const twilioRoutes = require("./twilio");
const { sendWhatsAppNotifica } = require("./whatsapp");
const audioCache = require("./audioCache");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// ─── ROUTES ───────────────────────────────────────────────────────────────────
app.use("/twilio", twilioRoutes);

// Health check
app.get("/health", (req, res) => res.json({ status: "ok" }));

// Serve audio MP3 generato da ElevenLabs (token temporaneo, TTL 2 min)
app.get("/audio/:token", (req, res) => {
  const buf = audioCache.get(req.params.token);
  if (!buf) return res.status(404).send("Audio non trovato o scaduto");
  res.set("Content-Type", "audio/mpeg");
  res.set("Cache-Control", "no-store");
  res.send(buf);
});

// Endpoint chiamato da n8n per inviare notifica Telegram quando arriva un lead da WhatsApp
app.post("/webhook/lead-notify", async (req, res) => {
  const { nome, telefono, email, problema, servizio } = req.body;
  const servizioUpper = (servizio || "DA_DEFINIRE").toUpperCase();

  try {
    await sendWhatsAppNotifica({ nome, telefono, email, problema, servizio: servizioUpper });

    // Per lead ESPURGO: inoltra al workflow n8n per AI email + bozza Gmail
    if (servizioUpper === "ESPURGO") {
      const n8nUrl = process.env.N8N_WEBHOOK_ESPURGO || "https://informaticoimprovvisato.app.n8n.cloud/webhook/espurgo-lead";
      try {
        await fetch(n8nUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome, telefono, email, problema, servizio: servizioUpper }),
        });
        console.log(`📧 Lead ESPURGO inoltrato a n8n: ${nome} (${telefono})`);
      } catch (e2) {
        console.error("⚠️ Errore invio n8n ESPURGO:", e2.message);
      }
    }

    res.json({ status: "ok" });
  } catch (e) {
    console.error("❌ lead-notify error:", e.message);
    res.status(500).json({ status: "error", message: e.message });
  }
});

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
