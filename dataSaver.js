// services/dataSaver.js
//
// 2026-05-28 — Switch da Airtable diretto → CRM webhook:
// I lead ora vengono salvati nel CRM Ecosan (NestJS) che è la single source
// of truth. Il CRM ha un outbox che mirror automaticamente i lead su Airtable,
// quindi non serve più la doppia scrittura.
//
// Vecchio import: const { saveLead } = require("./airtable");
// (airtable.js resta nel repo per eventuale rollback rapido)
const { saveLead } = require("./crm");
const { sendWhatsAppNotifica } = require("./whatsapp");
const { sendEmailNotifica } = require("./gmail");
const { generateSummary } = require("./openai");

/**
 * Salva i dati raccolti dalla chiamata vocale sul CRM Ecosan.
 * Il CRM crea Lead + Activity CALL + Timeline entry, e poi sincronizza
 * automaticamente su Airtable via outbox (no più doppio scrittore).
 */
async function saveCallData({ callSid, phoneNumber, extractedData, transcript }) {
  try {
    // Genera riassunto AI della chiamata per note_interne
    let noteInterne = "";
    try {
      noteInterne = await generateSummary(transcript);
    } catch (e) {
      console.warn("⚠️ Riassunto non generato:", e.message);
    }

    const leadId = await saveLead({
      nome:              extractedData?.nome     || "",
      cognome:           extractedData?.cognome  || "",
      azienda:           extractedData?.azienda  || "",
      telefono:          phoneNumber || extractedData?.telefono || "",
      email:             extractedData?.email    || "",
      indirizzo:         extractedData?.indirizzo || "",
      città:             extractedData?.città    || "",
      cap:               extractedData?.cap      || "",
      servizio:          extractedData?.servizio || "",
      problema:          extractedData?.problema || "",
      source:            extractedData?.source   || "voice_bot",
      chatid:            callSid,           // → callId + x-event-id (idempotency)
      noteInterne,                          // preprended a problem nel CRM
      transcript,                           // passato come campo dedicato al CRM
      callStartedAt:     new Date().toISOString(),
    });

    console.log(`✅ Lead chiamata salvato: ${leadId}`);

    const notifData = {
      nome:      extractedData?.nome      || "",
      cognome:   extractedData?.cognome   || "",
      telefono:  phoneNumber || extractedData?.telefono || "",
      email:     extractedData?.email     || "",
      problema:  extractedData?.problema  || "",
      servizio:  extractedData?.servizio  || "DA_DEFINIRE",
      città:     extractedData?.città     || "",
      indirizzo: extractedData?.indirizzo || "",
    };

    // Notifica Telegram al responsabile del servizio (non bloccante)
    sendWhatsAppNotifica(notifData)
      .catch(err => console.error("❌ Telegram notifica fallita:", err.message));

    // Notifica Email Gmail (non bloccante)
    sendEmailNotifica(notifData)
      .catch(err => console.error("❌ Email notifica fallita:", err.message));

    return leadId;

  } catch (error) {
    console.error(`❌ Errore salvataggio lead:`, error.message);
    throw error;
  }
}

module.exports = { saveCallData };
