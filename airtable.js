// services/airtable.js
// Usa la REST API di Airtable direttamente (senza SDK).
// Tabella ID: tblGGr8aL3sT02YCF (nome: "Table 1" in Airtable)

async function saveLead(data) {
  const apiKey = (process.env.AIRTABLE_API_KEY || "").replace(/[\r\n\s]/g, "");
  const baseId  = (process.env.AIRTABLE_BASE_ID  || "").replace(/[\r\n\s]/g, "");
  const tableId = "tblGGr8aL3sT02YCF";

  console.log(`📤 Airtable → Base: ${baseId} | Key: ${apiKey.substring(0, 10)}...`);

  const response = await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
    method: "POST",
    headers: {
      Authorization:  `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: {
        Nome:               data.nome               || "",
        Cognome:            data.cognome             || "",
        Telefono:           data.telefono            || "",
        Email:              data.email               || "",
        Indirizzo:          data.indirizzo           || "",
        "Città":            data.città               || "",
        Servizio:           data.servizio            || "DA_DEFINIRE",
        Problema:           data.problema            || "",
        MessaggioOriginale: data.messaggiooriginale  || "",
        Canale:             data.canale              || "",
        User:               data.user               || "",
        ChatId:             data.chatid              || "",
        "Source ":          data.source              || "",
        Stage:              "NUOVA",
        Stato:              "ATTIVA",
        Data:               new Date().toISOString(),
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Airtable ${response.status}: ${err}`);
  }

  const result = await response.json();
  console.log(`📋 Lead salvato su Airtable: ${result.id}`);
  return result.id;
}

module.exports = { saveLead };
