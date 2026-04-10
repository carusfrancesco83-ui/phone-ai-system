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
  "Espurgo":          "Espurgo",
  "Relining":         "Relining",
  "Videoispezione":   "Videoispezione",
  "Montaggio amex":   "Montaggio amex",
  "Pulizia cisterne": "Pulizia cisterne",
  "Mappatura reti":   "Mappatura reti",
  "Non classificato": "Non classificato",
  // alias UPPER (per retrocompatibilità con structured outputs in maiuscolo)
  "ESPURGO":          "Espurgo",
  "RELINING":         "Relining",
  "VIDEOISPEZIONE":   "Videoispezione",
  "MONTAGGIO_AMEX":   "Montaggio amex",
  "PULIZIA_CISTERNE": "Pulizia cisterne",
  "MAPPATURA_RETI":   "Mappatura reti",
  "DA_DEFINIRE":      "Non classificato",
};

function normalizeServizio(s) {
  if (!s) return "Non classificato";
  return SERVIZIO_NORMALIZE[s.trim()] || "Non classificato";
}

// ─── POST /vapi/webhook ───────────────────────────────────────────────────────
// VAPI chiama questo endpoint per ogni evento del ciclo di vita della chiamata.
// Filtriamo solo "end-of-call-report" e ignoriamo gli altri rispondendo comunque 200.
router.post("/webhook", async (req, res) => {
  // Verifica del segreto condiviso (opzionale ma consigliato).
  // Lascia VAPI_WEBHOOK_SECRET vuoto nel .env per disabilitare.
  const expectedSecret = process.env.VAPI_WEBHOOK_SECRET || "";
  if (expectedSecret) {
    const got = req.get("x-vapi-secret") || req.get("X-Vapi-Secret") || "";
    if (got !== expectedSecret) {
      console.warn("⚠️ VAPI webhook: secret mismatch");
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
  }

  // VAPI annida il payload sotto "message".
  const message = req.body?.message || req.body || {};
  const type = message?.type || "unknown";

  // Ack veloce per gli eventi diversi da end-of-call-report
  // (status-update, transcript, function-call, hang, ecc.)
  if (type !== "end-of-call-report") {
    console.log(`📨 VAPI webhook ignored: ${type}`);
    return res.status(200).json({ ignored: true, type });
  }

  try {
    const call = message.call || {};
    const callId = call.id || "";
    const phoneNumber = call.customer?.number || "";
    const transcript = message.transcript || "";
    const summary = message.summary || message.analysis?.summary || "";
    const analysis = message.analysis || {};
    const structured = analysis.structuredData || {};

    console.log(
      `📞 VAPI end-of-call: ${callId} | ${phoneNumber} | ${
        message.endedReason || "no reason"
      }`
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
        "Espurgo":          "ESPURGO",
        "Relining":         "RELINING",
        "Videoispezione":   "VIDEOISPEZIONE",
        "Montaggio amex":   "MONTAGGIO_AMEX",
        "Pulizia cisterne": "PULIZIA_CISTERNE",
        "Mappatura reti":   "MAPPATURA_RETI",
        "Non classificato": "DA_DEFINIRE",
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
