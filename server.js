// src/server.js
require("dotenv").config();

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");

const twilioRoutes = require("./twilio");
const vapiRoutes = require("./vapi");
const { sendWhatsAppNotifica } = require("./whatsapp");
const audioCache = require("./audioCache");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json({ limit: "2mb" })); // VAPI può inviare transcript lunghi

// ─── DEBUG: ring buffer dei webhook VAPI ricevuti ─────────────────────────────
// Registrato PRIMA del router /vapi così intercetta tutte le POST a /vapi/webhook
// prima che il router le consumi.
const WEBHOOK_LOG = [];
const MAX_LOG = 20;
app.use("/vapi/webhook", (req, res, next) => {
  if (req.method === "POST") {
    const t = req.body?.message?.type || req.body?.type || "unknown";
    const cid = req.body?.message?.call?.id || req.body?.call?.id || "";
    WEBHOOK_LOG.unshift({
      receivedAt: new Date().toISOString(),
      messageType: t,
      callId: cid,
      hasAnalysis: !!(req.body?.message?.analysis || req.body?.analysis),
      hasStructuredData: !!(req.body?.message?.analysis?.structuredData || req.body?.analysis?.structuredData),
      structuredKeys: Object.keys(req.body?.message?.analysis?.structuredData || req.body?.analysis?.structuredData || {}),
      bodyKeys: Object.keys(req.body || {}),
    });
    while (WEBHOOK_LOG.length > MAX_LOG) WEBHOOK_LOG.pop();
  }
  next();
});
app.get("/debug/vapi-webhook-log", (_req, res) => {
  res.json({ count: WEBHOOK_LOG.length, last: WEBHOOK_LOG });
});

// ─── ROUTES ───────────────────────────────────────────────────────────────────
app.use("/twilio", twilioRoutes);
app.use("/vapi", vapiRoutes);

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

// FIX: configura analysisPlan dell'assistant per estrarre dati strutturati
// dalle conversazioni. Da chiamare UNA volta sola per assistant Ecosan.
// Uso: GET /debug/vapi-configure-extraction?assistantId=...
app.get("/debug/vapi-configure-extraction", async (req, res) => {
  const key = process.env.VAPI_PRIVATE_KEY || "";
  if (!key) return res.status(500).json({ error: "VAPI_PRIVATE_KEY not configured" });
  const { assistantId } = req.query;
  if (!assistantId) return res.status(400).json({ error: "assistantId required" });

  // Schema dei dati che vapi.js si aspetta nel webhook end-of-call-report.
  // Campi mappati 1:1 con quello che il codice del bot legge da `structured.X`.
  const analysisPlan = {
    summaryPlan: {
      enabled: true,
      messages: [
        {
          role: "system",
          content: "Riassumi la chiamata in 2-3 frasi in italiano. Includi: chi ha chiamato (nome), cosa serve (servizio/problema), dove (città/indirizzo), eventuali dettagli importanti (urgenza, fascia oraria preferita, riferimenti). Tono professionale, no elenchi.",
        },
        { role: "user", content: "Riassumi la chiamata sulla base di questa trascrizione:\n\n{{transcript}}" },
      ],
    },
    structuredDataPlan: {
      enabled: true,
      messages: [
        {
          role: "system",
          content:
            "Estrai dalla trascrizione della chiamata i dati del cliente. Rispondi SOLO con JSON valido che rispetta lo schema fornito. Se un dato NON è stato detto esplicitamente, usa stringa vuota (''). NON inventare. Per il campo 'servizio' scegli SOLO uno dei valori dell'enum.",
        },
        { role: "user", content: "Estrai i dati da questa trascrizione:\n\n{{transcript}}" },
      ],
      schema: {
        type: "object",
        properties: {
          nome:       { type: "string", description: "Nome di battesimo del chiamante (es. Mario)" },
          cognome:    { type: "string", description: "Cognome del chiamante (es. Rossi)" },
          azienda:    { type: "string", description: "Nome dell'azienda/attività se il chiamante non è un privato. Vuoto per privati cittadini." },
          cellulare:  { type: "string", description: "Numero cellulare se il chiamante (da fisso) lo ha lasciato. Vuoto se chiama da mobile o non lo ha dato." },
          indirizzo:  { type: "string", description: "Via + numero civico dove fare l'intervento. Vuoto se non specificato." },
          "città":    { type: "string", description: "Città o paese dell'intervento. NON dare per scontato Catania." },
          cap:        { type: "string", description: "CAP a 5 cifre se detto. Vuoto altrimenti." },
          servizio: {
            type: "string",
            description: "Servizio richiesto. Scegli UNO dei valori dell'enum sulla base del problema descritto.",
            enum: [
              "Espurgo",
              "Videoispezione",
              "Relining",
              "Montaggio amex",
              "Pulizia cisterne",
              "Mappatura reti",
              "Analisi dei dati",
              "Ripristino manufatti",
              "Impermeabilizzazione",
              "Prove di tenuta",
              "Non classificato",
            ],
          },
          problema: { type: "string", description: "Descrizione del problema riportato dal cliente in 1-2 frasi." },
          source:   { type: "string", description: "Come il chiamante ha trovato il numero (es. 'Google', 'passaparola', 'volantino'). Vuoto se non chiesto/non risposto." },
        },
        required: [],
      },
    },
    successEvaluationPlan: {
      enabled: true,
      rubric: "PassFail",
      messages: [
        {
          role: "system",
          content:
            "Valuta se la chiamata si è chiusa con un lead utile. PASS se sono stati raccolti almeno nome+indirizzo+servizio. FAIL se la chiamata si è chiusa senza dati essenziali.",
        },
        { role: "user", content: "Valuta questa chiamata:\n\n{{transcript}}" },
      ],
    },
  };

  try {
    const r = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ analysisPlan }),
    });
    const body = await r.json();
    res.status(r.status).json({
      status: r.status,
      ok: r.ok,
      patched_analysisPlan_keys: Object.keys(analysisPlan),
      response: body,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Debug VAPI: configurazione COMPLETA assistant (incluso analysisPlan/
// structuredOutputs che determinano se VAPI estrae dati dalla conversazione).
app.get("/debug/vapi-assistant-full/:id", async (req, res) => {
  const key = process.env.VAPI_PRIVATE_KEY || "";
  if (!key) return res.status(500).json({ error: "VAPI_PRIVATE_KEY not configured" });
  try {
    const r = await fetch(`https://api.vapi.ai/assistant/${req.params.id}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const a = await r.json();
    // Ritorna SOLO le sezioni rilevanti per data extraction
    res.json({
      id: a.id,
      name: a.name,
      updatedAt: a.updatedAt,
      // questi sono i tre posti dove VAPI può avere config di estrazione dati
      analysisPlan: a.analysisPlan ?? null,
      analysisSchema: a.analysisSchema ?? null,
      summaryPrompt: a.summaryPrompt ?? null,
      structuredDataPrompt: a.structuredDataPrompt ?? null,
      structuredDataSchema: a.structuredDataSchema ?? null,
      successEvaluationPrompt: a.successEvaluationPrompt ?? null,
      successEvaluationRubric: a.successEvaluationRubric ?? null,
      serverUrl: a.serverUrl ?? null,
      server: a.server ?? null,
      // raw config message del model (per controllare gli structured outputs annidati)
      modelHasMessages: Array.isArray(a.model?.messages) && a.model.messages.length > 0,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Debug VAPI: dettaglio di una specifica chiamata (transcript, dati strutturati,
// messages, ecc.). Permette di capire se VAPI ha estratto i dati correttamente
// e cosa avrebbe dovuto inviare al webhook.
app.get("/debug/vapi-call/:id", async (req, res) => {
  const key = process.env.VAPI_PRIVATE_KEY || "";
  if (!key) return res.status(500).json({ error: "VAPI_PRIVATE_KEY not configured" });
  try {
    const r = await fetch(`https://api.vapi.ai/call/${req.params.id}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const body = await r.json();
    res.status(r.status).json(body);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Debug VAPI: leggi il prompt completo di un assistant.
// Usato per verificare cosa sta effettivamente usando VAPI quando l'utente
// chiama, e confrontarlo con cosa si configura via dashboard.
// Uso: GET /debug/vapi-assistant/:id
app.get("/debug/vapi-assistant/:id", async (req, res) => {
  const key = process.env.VAPI_PRIVATE_KEY || "";
  if (!key) return res.status(500).json({ error: "VAPI_PRIVATE_KEY not configured" });
  try {
    const r = await fetch(`https://api.vapi.ai/assistant/${req.params.id}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const body = await r.json();
    res.status(r.status).json(body);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Fix VAPI: RIMUOVI assistantId da phone-number (per ripristinare
// il flusso assistant-request → bot Express che applica saluto
// dinamico + callerType variabile).
// Uso: GET /debug/vapi-detach?phoneId=...
app.get("/debug/vapi-detach", async (req, res) => {
  const key = process.env.VAPI_PRIVATE_KEY || "";
  if (!key) return res.status(500).json({ error: "VAPI_PRIVATE_KEY not configured" });
  const { phoneId } = req.query;
  if (!phoneId) return res.status(400).json({ error: "phoneId required" });
  try {
    const r = await fetch(`https://api.vapi.ai/phone-number/${phoneId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ assistantId: null }),
    });
    const body = await r.json();
    res.status(r.status).json({ status: r.status, body });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Fix VAPI: assegna assistantId a phone-number (PATCH).
// Uso: GET /debug/vapi-assign?phoneId=...&assistantId=...
app.get("/debug/vapi-assign", async (req, res) => {
  const key = process.env.VAPI_PRIVATE_KEY || "";
  if (!key) return res.status(500).json({ error: "VAPI_PRIVATE_KEY not configured" });
  const { phoneId, assistantId } = req.query;
  if (!phoneId || !assistantId) {
    return res.status(400).json({ error: "phoneId + assistantId required as query params" });
  }
  try {
    const r = await fetch(`https://api.vapi.ai/phone-number/${phoneId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ assistantId }),
    });
    const body = await r.json();
    res.status(r.status).json({ status: r.status, body });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Debug VAPI: verifica account, lista assistants, numeri configurati,
// ultime chiamate (con errori). Tutti i dati sensibili oscurati.
app.get("/debug/vapi", async (req, res) => {
  const key = process.env.VAPI_PRIVATE_KEY || "";
  if (!key) return res.status(500).json({ error: "VAPI_PRIVATE_KEY not configured" });
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  try {
    const [assistantsR, phonesR, callsR] = await Promise.all([
      fetch("https://api.vapi.ai/assistant?limit=10", { headers }),
      fetch("https://api.vapi.ai/phone-number?limit=10", { headers }),
      fetch("https://api.vapi.ai/call?limit=10", { headers }),
    ]);
    const assistants = assistantsR.ok ? await assistantsR.json() : { error: `${assistantsR.status}` };
    const phones = phonesR.ok ? await phonesR.json() : { error: `${phonesR.status}` };
    const calls = callsR.ok ? await callsR.json() : { error: `${callsR.status}` };

    res.json({
      api_key_present: true,
      api_key_prefix: key.substring(0, 8) + "...",
      assistants: Array.isArray(assistants) ? assistants.map(a => ({
        id: a.id, name: a.name, model: a.model?.model, voice: a.voice?.voiceId,
        createdAt: a.createdAt, updatedAt: a.updatedAt,
      })) : assistants,
      phones: Array.isArray(phones) ? phones.map(p => ({
        id: p.id, number: p.number, provider: p.provider, name: p.name,
        assistantId: p.assistantId, createdAt: p.createdAt,
        twilioAccountSid: p.twilioAccountSid?.substring(0, 12) + "...",
      })) : phones,
      recent_calls: Array.isArray(calls) ? calls.slice(0, 5).map(c => ({
        id: c.id, type: c.type, status: c.status, endedReason: c.endedReason,
        phoneNumber: c.phoneNumber?.number, assistantId: c.assistantId,
        startedAt: c.startedAt, endedAt: c.endedAt,
      })) : calls,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Debug Twilio CREDENZIALI: verifica che env vars siano popolate.
// Non espone valori, solo presenza e prefissi.
// Debug env vars per integrazione CRM + VAPI webhook secret.
app.get("/debug/integration-env", (req, res) => {
  const vapiSecret = process.env.VAPI_WEBHOOK_SECRET || "";
  const crmUrl = process.env.CRM_WEBHOOK_URL || "";
  const crmSecret = process.env.CRM_VOICE_BOT_SECRET || "";
  res.json({
    VAPI_WEBHOOK_SECRET: {
      set: vapiSecret.length > 0,
      length: vapiSecret.length,
      note: "Se set, VAPI dashboard DEVE inviare lo stesso valore in x-vapi-secret header del webhook server URL",
    },
    CRM_WEBHOOK_URL: {
      set: crmUrl.length > 0,
      value: crmUrl,
    },
    CRM_VOICE_BOT_SECRET: {
      set: crmSecret.length > 0,
      length: crmSecret.length,
      note: "Deve combaciare con env VOICE_BOT_WEBHOOK_SECRET del CRM",
    },
  });
});

app.get("/debug/twilio-creds", (req, res) => {
  const sid = process.env.TWILIO_ACCOUNT_SID || "";
  const token = process.env.TWILIO_AUTH_TOKEN || "";
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER || "";
  res.json({
    accountSid_present: sid.length > 0,
    accountSid_prefix: sid.substring(0, 12) + (sid.length > 12 ? "..." : ""),
    accountSid_length: sid.length,
    accountSid_format_ok: sid.startsWith("AC") && sid.length === 34,
    authToken_present: token.length > 0,
    authToken_length: token.length,
    authToken_format_ok: token.length === 32,
    phoneNumber: phoneNumber || "(empty)",
    baseUrl: process.env.BASE_URL || "(empty)",
  });
});

// Debug Twilio: lista numeri attivi + voice config (per diagnosticare
// "squilla a vuoto"). Mostra solo info NON sensibili (no auth token).
app.get("/debug/twilio", async (req, res) => {
  try {
    const twilio = require("twilio");
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) {
      return res.status(500).json({
        error: "TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN missing in env",
      });
    }
    const client = twilio(sid, token);

    // Lista numeri attivi sull'account
    const numbers = await client.incomingPhoneNumbers.list({ limit: 50 });

    const result = numbers.map((n) => ({
      sid: n.sid,
      phoneNumber: n.phoneNumber,
      friendlyName: n.friendlyName,
      voiceUrl: n.voiceUrl || "(empty — won't ring)",
      voiceMethod: n.voiceMethod,
      voiceFallbackUrl: n.voiceFallbackUrl || null,
      voiceFallbackMethod: n.voiceFallbackMethod,
      voiceApplicationSid: n.voiceApplicationSid || null,
      statusCallback: n.statusCallback || null,
      statusCallbackMethod: n.statusCallbackMethod,
      capabilities: n.capabilities,
      dateCreated: n.dateCreated,
    }));

    res.json({
      accountSid: sid,
      botExpectedUrl: `${process.env.BASE_URL || "https://phone-ai-system-production.up.railway.app"}/twilio/incoming`,
      numbers: result,
    });
  } catch (e) {
    res.status(500).json({ error: e.message, code: e.code || null });
  }
});

// Debug Twilio: ultime chiamate (per vedere status/error code)
app.get("/debug/twilio-calls", async (req, res) => {
  try {
    const twilio = require("twilio");
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const calls = await client.calls.list({ limit: 20 });
    res.json(calls.map((c) => ({
      sid: c.sid,
      from: c.from,
      to: c.to,
      direction: c.direction,
      status: c.status,
      duration: c.duration,
      startTime: c.startTime,
      endTime: c.endTime,
      // ⚠️ tipici codici errore: 11200 (HTTP retrieval failure), 13225 (invalid url), 32100 (account locked)
    })));
  } catch (e) {
    res.status(500).json({ error: e.message, code: e.code || null });
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
