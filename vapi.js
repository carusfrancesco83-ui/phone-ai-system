// routes/vapi.js
// Endpoint che riceve gli eventi da VAPI a fine chiamata e salva il lead su
// Airtable riusando la stessa saveLead() già usata dal flusso Twilio.
//
// Configurazione richiesta lato VAPI dashboard:
//   1. Assistente Ecosan → tab Analysis → Structured Outputs:
//      definire i campi: nome, cognome, email, città, cap, indirizzo,
//      servizio (enum: Espurgo, Relining, Videoispezione, Montaggio amex,
//      Pulizia cisterne, Mappatura reti, Non classificato), problema, source
//   2. Assistente Ecosan o Phone Number → Server URL:
//      https://<railway-domain>/vapi/webhook
//   3. (opzionale) Server URL Secret → stesso valore di VAPI_WEBHOOK_SECRET nel .env

const express = require("express");
const router = express.Router();

const { saveLead, logMessage } = require("./airtable");
const { sendWhatsAppNotifica } = require("./whatsapp");

// Mappa di normalizzazione del campo "servizio".
// VAPI può inviare il valore in forme diverse a seconda di come sono stati
// configurati gli Structured Outputs (italiano "Espurgo" oppure UPPER "ESPURGO").
// Qui normalizziamo SEMPRE al formato italiano accettato dal SERVIZIO_MAP di
// airtable.js, così saveLead può mappare correttamente all'enum di Airtable.
const SERVIZIO_NORMALIZE = {
  // valori "puliti" in italiano (passa-attraverso)
  "Espurgo":              "Espurgo",
  "Relining":             "Relining",
  "Videoispezione":       "Videoispezione",
  "Montaggio amex":       "Montaggio amex",
  "Pulizia cisterne":     "Pulizia cisterne",
  "Mappatura reti":       "Mappatura reti",
  "Analisi dei dati":     "Analisi dei dati",
  "Ripristino manufatti": "Ripristino manufatti",
  "Impermeabilizzazione": "Impermeabilizzazione",
  "Prove di tenuta":      "Prove di tenuta",
  "Non classificato":     "Non classificato",
  // alias UPPER (per retrocompatibilità con structured outputs in maiuscolo)
  "ESPURGO":              "Espurgo",
  "RELINING":             "Relining",
  "VIDEOISPEZIONE":       "Videoispezione",
  "MONTAGGIO_AMEX":       "Montaggio amex",
  "PULIZIA_CISTERNE":     "Pulizia cisterne",
  "MAPPATURA_RETI":       "Mappatura reti",
  "ANALISI_DEI_DATI":     "Analisi dei dati",
  "RIPRISTINO_MANUFATTI": "Ripristino manufatti",
  "IMPERMEABILIZZAZIONE": "Impermeabilizzazione",
  "PROVE_DI_TENUTA":      "Prove di tenuta",
  "DA_DEFINIRE":          "Non classificato",
};

function normalizeServizio(s) {
  if (!s) return "Non classificato";
  return SERVIZIO_NORMALIZE[s.trim()] || "Non classificato";
}

// Saluto in base all'ora italiana corrente (fuso Europe/Rome).
//   06:00-13:59 → "buongiorno"
//   14:00-17:59 → "buon pomeriggio"
//   18:00-05:59 → "buonasera"
function getTimeBasedGreeting() {
  const hour = parseInt(
    new Date().toLocaleString("en-US", {
      timeZone: "Europe/Rome",
      hour: "2-digit",
      hour12: false,
    }),
    10
  );
  if (hour >= 6 && hour < 14) return "buongiorno";
  if (hour >= 14 && hour < 18) return "buon pomeriggio";
  return "buonasera";
}

// ─── POST /vapi/webhook ───────────────────────────────────────────────────────
// VAPI chiama questo endpoint per ogni evento del ciclo di vita della chiamata.
// In versione DEBUG: loggo TUTTO quello che arriva, in modo da poter capire
// dai log di Railway cosa VAPI sta effettivamente mandando.
router.post("/webhook", async (req, res) => {
  // Verifica del segreto condiviso (opzionale ma consigliato).
  // Lascia VAPI_WEBHOOK_SECRET vuoto nel .env per disabilitare.
  const expectedSecret = process.env.VAPI_WEBHOOK_SECRET || "";
  const got = req.get("x-vapi-secret") || req.get("X-Vapi-Secret") || "";
  const messageType = req.body?.message?.type || req.body?.type || "unknown";
  const callId = req.body?.message?.call?.id || req.body?.call?.id || "";

  // Log riassuntivo di OGNI richiesta che arriva a /vapi/webhook
  console.log(
    `🔔 VAPI webhook IN | type=${messageType} | callId=${callId.substring(0, 12)} | secretSet=${!!expectedSecret} | secretGot=${got ? "yes" : "no"} | secretMatch=${expectedSecret ? got === expectedSecret : "n/a"} | bodyKeys=${Object.keys(req.body || {}).join(",")}`
  );

  if (expectedSecret && got !== expectedSecret) {
    console.warn(
      `⚠️ VAPI webhook: secret mismatch (expected len=${expectedSecret.length}, got len=${got.length})`
    );
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  // VAPI annida il payload sotto "message".
  const message = req.body?.message || req.body || {};
  const type = message?.type || "unknown";

  // assistant-request: VAPI lo manda PRIMA dell'inizio chiamata per chiedere
  // quale assistant usare. Rispondiamo con l'assistant fisso + override del
  // saluto iniziale in base all'ora italiana corrente (buongiorno / buon
  // pomeriggio / buonasera). Richiede che il phone-number su VAPI NON abbia
  // assistantId fisso impostato, altrimenti VAPI non invia questo evento.
  if (type === "assistant-request") {
    const greeting = getTimeBasedGreeting();
    const firstMessage = `Ecosan, ${greeting}, mi dica.`;
    console.log(`🌅 VAPI assistant-request | greeting=${greeting} | firstMessage="${firstMessage}"`);
    return res.status(200).json({
      assistantId: process.env.VAPI_ASSISTANT_ID,
      assistantOverrides: { firstMessage },
    });
  }

  // Ack veloce per gli eventi diversi da end-of-call-report
  // (status-update, speech-update, conversation-update, transcript, function-call, hang, ecc.)
  if (type !== "end-of-call-report") {
    console.log(`📨 VAPI webhook ignored: ${type}`);
    return res.status(200).json({ ignored: true, type });
  }

  // È un end-of-call-report — logghiamo i pezzi importanti del payload prima
  // di procedere al salvataggio, così se qualcosa va storto sappiamo cosa è arrivato.
  console.log(
    `📞 VAPI end-of-call-report ricevuto | callId=${callId} | hasAnalysis=${!!message.analysis} | hasStructured=${!!message.analysis?.structuredData} | structuredKeys=${Object.keys(message.analysis?.structuredData || {}).join(",")} | transcriptLen=${(message.transcript || "").length}`
  );

  try {
    const call = message.call || {};
    const callId = call.id || "";
    const phoneNumber = call.customer?.number || "";
    const transcript = message.transcript || message.artifact?.transcript || "";
    const summary = message.summary || message.analysis?.summary || "";
    const analysis = message.analysis || {};

    // VAPI mette i risultati degli Structured Outputs in artifact.structuredOutputs.
    // Il formato è un oggetto indicizzato per UUID dell'output:
    //   { "uuid-1": { "name": "nome", "result": "Francesco" }, ... }
    // Lo "appiattiamo" in un dict { nome: "Francesco", cognome: "Caruso", ... }
    // così il resto del codice può usarlo come prima.
    const artifact = message.artifact || {};
    const rawStructuredOutputs = artifact.structuredOutputs || {};
    const structured = {};
    if (rawStructuredOutputs && typeof rawStructuredOutputs === "object") {
      for (const obj of Object.values(rawStructuredOutputs)) {
        if (obj && typeof obj === "object" && obj.name) {
          structured[obj.name] = obj.result ?? "";
        }
      }
    }

    // Fallback per compatibilità con vecchio formato analysis.structuredData
    // (su VAPI legacy o se in futuro tornano a quel campo).
    if (Object.keys(structured).length === 0 && analysis.structuredData) {
      Object.assign(structured, analysis.structuredData);
    }

    console.log(
      `📞 VAPI end-of-call: ${callId} | ${phoneNumber} | ${
        message.endedReason || "no reason"
      } | structuredKeys=${Object.keys(structured).join(",") || "EMPTY"}`
    );

    // Normalizza il valore servizio in formato accettato da airtable.js
    const servizio = normalizeServizio(structured.servizio);

    // Salva il lead riusando la saveLead esistente (stessa firma del flusso Twilio).
    // noteInterne riceve il riassunto AI di VAPI se disponibile, altrimenti la
    // trascrizione completa.
    const leadId = await saveLead({
      nome:        structured.nome      || "",
      cognome:     structured.cognome   || "",
      telefono:    phoneNumber || structured.telefono || "",
      email:       structured.email     || "",
      indirizzo:   structured.indirizzo || "",
      "città":     structured["città"] || structured.citta || "",
      cap:         structured.cap       || "",
      problema:    structured.problema  || "",
      servizio:    servizio,
      source:      structured.source    || structured.provenienza || "",
      chatid:      callId,
      noteInterne: summary || transcript || "",
    });

    console.log(`✅ Lead VAPI salvato: ${leadId}`);

    // Log della trascrizione completa su Log_Chat (non bloccante).
    logMessage({
      messageId:       callId,
      telefono:        phoneNumber,
      testoMessaggio:  transcript,
      rispostaInviata: summary,
      sttStatus:       "success",
      aiParseStatus:   structured.nome ? "ok" : "failed",
      timestamp:       new Date().toISOString(),
    }).catch((err) => console.error("⚠️ Log_Chat fallito:", err.message));

    // Notifica Telegram al responsabile del servizio (non bloccante).
    // Il file whatsapp.js si aspetta il valore servizio in formato UPPER per il
    // routing dei chat ID, mentre saveLead lavora in italiano. Mappiamo qui.
    const servizioUpper = (
      {
        "Espurgo":              "ESPURGO",
        "Relining":             "RELINING",
        "Videoispezione":       "VIDEOISPEZIONE",
        "Montaggio amex":       "MONTAGGIO_AMEX",
        "Pulizia cisterne":     "PULIZIA_CISTERNE",
        "Mappatura reti":       "MAPPATURA_RETI",
        "Analisi dei dati":     "ANALISI_DEI_DATI",
        "Ripristino manufatti": "RIPRISTINO_MANUFATTI",
        "Impermeabilizzazione": "IMPERMEABILIZZAZIONE",
        "Prove di tenuta":      "PROVE_DI_TENUTA",
        "Non classificato":     "DA_DEFINIRE",
      }[servizio] || "DA_DEFINIRE"
    );

    const nomeCompleto = [structured.nome, structured.cognome]
      .filter(Boolean)
      .join(" ")
      .trim();

    sendWhatsAppNotifica({
      nome:     nomeCompleto || "",
      telefono: phoneNumber || structured.telefono || "",
      email:    structured.email    || "",
      problema: structured.problema || "",
      servizio: servizioUpper,
    }).catch((err) => console.error("❌ Telegram notifica fallita:", err.message));

    return res.status(200).json({ ok: true, leadId });
  } catch (error) {
    console.error("❌ Errore VAPI webhook:", error.message);
    // 200 anche su errore: VAPI ha politiche di retry aggressive e preferiamo
    // loggare l'errore qui invece di ricevere chiamate duplicate.
    return res.status(200).json({ ok: false, error: error.message });
  }
});

// ─── GET /vapi/health ─────────────────────────────────────────────────────────
// Endpoint diagnostico per verificare velocemente che il deploy sia raggiungibile.
router.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "vapi-webhook",
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
