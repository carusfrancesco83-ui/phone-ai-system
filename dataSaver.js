// services/dataSaver.js
const { saveLead } = require("./airtable");
const { sendWhatsAppNotifica } = require("./whatsapp");
const { sendEmailNotifica } = require("./gmail");

/**
 * Salva i dati raccolti dalla chiamata vocale nella tabella Leads.
 * canale e chatid vengono impostati automaticamente dal sistema.
 */
async function saveCallData({ callSid, phoneNumber, extractedData, transcript }) {
  try {
    const leadId = await saveLead({
      nome:              extractedData?.nome     || "",
      cognome:           extractedData?.cognome  || "",
      telefono:          phoneNumber || extractedData?.telefono || "",
      email:             extractedData?.email    || "",
      indirizzo:         extractedData?.indirizzo || "",
      città:             extractedData?.città    || "",
      servizio:          extractedData?.servizio || "",
      problema:          extractedData?.problema || "",
      source:            extractedData?.source   || "",
      messaggiooriginale: transcript.split("\n").filter(r => r.startsWith("Chiamante:")).map(r => r.replace("Chiamante: ", "")).join(" | "),
      canale:            "Chiamata Vocale",
      user:              phoneNumber,
      chatid:            callSid,
    });

    console.log(`✅ Lead chiamata salvato: ${leadId}`);

    const notifData = {
      nome:      `${extractedData?.nome || ""} ${extractedData?.cognome || ""}`.trim(),
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
