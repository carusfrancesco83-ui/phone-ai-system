// services/airtable.js
const Airtable = require("airtable");

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
  process.env.AIRTABLE_BASE_ID
);

/**
 * Salva un lead nella tabella "Leads" unificata.
 * Usato da tutte le sorgenti: chiamata vocale, WhatsApp, web, ecc.
 */
async function saveLead(data) {
  const record = await base("Leads").create({
    nome:              data.nome              || "",
    telefono:          data.telefono          || "",
    email:             data.email             || "",
    indirizzo:         data.indirizzo         || "",
    città:             data.città             || "",
    servizio:          data.servizio          || "DA_DEFINIRE",
    problema:          data.problema          || "",
    messaggiooriginale: data.messaggiooriginale || "",
    canale:            data.canale            || "",
    user:              data.user              || "",
    chatid:            data.chatid            || "",
    source:            data.source            || "",
    stato:             "COMPLETATA",
    data:              new Date().toISOString(),
  });

  console.log(`📋 Lead salvato su Airtable: ${record.id}`);
  return record.id;
}

module.exports = { saveLead };
