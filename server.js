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
