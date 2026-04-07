// services/airtable.js
// Usa la REST API di Airtable direttamente (senza SDK).
// Tabella ID: tblu8KGxn6dfNBymT (nuova tabella leads pulita)

async function saveLead(data) {
  const apiKey = (process.env.AIRTABLE_API_KEY || "").replace(/[\r\n\s]/g, "");
  const baseId  = (process.env.AIRTABLE_BASE_ID  || "").replace(/[\r\n\s]/g, "");
  const tableId = "tblu8KGxn6dfNBymT";

  console.log(`📤 Airtable → Base: ${baseId} | Key: ${apiKey.substring(0, 10)}...`);

  const fields = {
    nome:        data.nome        || "",
    cognome:     data.cognome     || "",
    telefono:    data.telefono    || "",
    email:       data.email       || "",
    indirizzo:   data.indirizzo   || "",
    citta:       data.città       || "",
    descrizione_richiesta: data.problema || "",
    chat_id:               data.chatid  || "",
    fonte:                 "Chiamata vocale",
    stato:                 "Nuovo",
  };

  if (data.servizio && ["Espurgo", "Relining", "Videoispezione", "Montaggio amex", "Non classificato"].includes(data.servizio)) {
    fields.servizio_richiesto = data.servizio;
  }

  const response = await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
    method: "POST",
    headers: {
      Authorization:  `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
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
