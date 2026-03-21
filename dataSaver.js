// services/dataSaver.js
const { saveLead } = require("./airtable");
const { sendWhatsAppNotifica } = require("./whatsapp");

/**
 * Salva i dati raccolti dalla chiamata vocale nella tabella Leads.
 * canale e chatid vengono impostati automaticamente dal sistema.
 */
async function saveCallData({ callSid, phoneNumber, extractedData, transcript }) {
  try {
    const leadId = await saveLead({
      nome:              extractedData?.nome     || "",
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

    // Notifica WhatsApp al responsabile del servizio (non bloccante)
    sendWhatsAppNotifica({
      nome:               extractedData?.nome     || "",
      telefono:           phoneNumber || extractedData?.telefono || "",
      città:              extractedData?.città    || "",
      servizio:           extractedData?.servizio || "DA_DEFINIRE",
      messaggiooriginale: transcript,
      data:               new Date().toLocaleString("it-IT"),
    }).catch(err => console.error("❌ WhatsApp notifica fallita:", err.message));

    return leadId;

  } catch (error) {
    console.error(`❌ Errore salvataggio lead:`, error.message);
    throw error;
  }
}

module.exports = { saveCallData };
