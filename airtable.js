// services/airtable.js
const Airtable = require("airtable");

const apiKey = (process.env.AIRTABLE_API_KEY || "").trim();
const baseId = (process.env.AIRTABLE_BASE_ID || "").trim();
console.log(`🔑 Airtable init — API key: ${apiKey.substring(0, 10)}... | Base: ${baseId}`);
const base = new Airtable({ apiKey }).base(baseId);

/**
 * Salva un lead nella tabella "Leads" unificata.
 * Usato da tutte le sorgenti: chiamata vocale, WhatsApp, web, ecc.
 */
async function saveLead(data) {
  const record = await base("Leads").create({
    Nome:                 data.nome                 || "",
    Telefono:             data.telefono             || "",
    Email:                data.email                || "",
    Indirizzo:            data.indirizzo            || "",
    Città:                data.città                || "",
    Servizio:             data.servizio             || "DA_DEFINIRE",
    Problema:             data.problema             || "",
    MessaggioOriginale:   data.messaggiooriginale   || "",
    Canale:               data.canale               || "",
    User:                 data.user                 || "",
    ChatId:               data.chatid               || "",
    Source:               data.source               || "",
    Stato:                "COMPLETATA",
    Data:                 new Date().toISOString(),
  });

  console.log(`📋 Lead salvato su Airtable: ${record.id}`);
  return record.id;
}

module.exports = { saveLead };
