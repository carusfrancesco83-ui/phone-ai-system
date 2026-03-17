// services/dataSaver.js
const { saveLead } = require("./airtable");

/**
 * Salva i dati raccolti dalla chiamata vocale nella tabella Leads.
 * canale e chatid vengono impostati automaticamente dal sistema.
 */
async function saveCallData({ callSid, phoneNumber, extractedData, transcript }) {
  try {
    const leadId = await saveLead({
      nome:              extractedData?.nome     || "",
      telefono:          extractedData?.telefono || phoneNumber,
      email:             extractedData?.email    || "",
      indirizzo:         extractedData?.indirizzo || "",
      città:             extractedData?.città    || "",
      servizio:          extractedData?.servizio || "",
      problema:          extractedData?.problema || "",
      source:            extractedData?.source   || "",
      messaggiooriginale: transcript,
      canale:            "Chiamata Vocale",
      user:              phoneNumber,
      chatid:            callSid,
    });

    console.log(`✅ Lead chiamata salvato: ${leadId}`);
    return leadId;

  } catch (error) {
    console.error(`❌ Errore salvataggio lead:`, error.message);
    throw error;
  }
}

module.exports = { saveCallData };
