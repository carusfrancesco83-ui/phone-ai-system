// services/airtable.js
// Usa la REST API di Airtable direttamente (senza SDK).
// Info_Requests : tblGGr8aL3sT02YCF
// Log_Chat      : tbleD1HKPfI4wCBOg

const TABLE_LEADS = "tblGGr8aL3sT02YCF"; // Info_Requests
const TABLE_LOG   = "tbleD1HKPfI4wCBOg";  // Log_Chat

function getAirtableConfig() {
  return {
    apiKey: (process.env.AIRTABLE_API_KEY || "").replace(/[\r\n\s]/g, ""),
    baseId: (process.env.AIRTABLE_BASE_ID  || "").replace(/[\r\n\s]/g, ""),
  };
}

async function airtablePost(tableId, fields) {
  const { apiKey, baseId } = getAirtableConfig();

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

  return response.json();
}

// ─── SALVA LEAD su Info_Requests ─────────────────────────────────────────────
async function saveLead(data) {
  const { apiKey, baseId } = getAirtableConfig();
  console.log(`📤 Airtable → Base: ${baseId} | Key: ${apiKey.substring(0, 10)}...`);

  // Mappa valori AI → valori esatti Airtable (MAIUSCOLO con underscore)
  const SERVIZIO_MAP = {
    "Espurgo":         "ESPURGO",
    "Relining":        "RELINING",
    "Videoispezione":  "VIDEOISPEZIONE",
    "Montaggio amex":  "MONTAGGIO_AMEX",
    "Non classificato":"DA_DEFINIRE",
  };

  const fields = {
    Nome:      data.nome      || "",
    Cognome:   data.cognome   || "",
    Telefono:  data.telefono  || "",
    Email:     data.email     || "",
    Indirizzo: data.indirizzo || "",
    Città:     data.città     || "",
    CAP:       data.cap       || "",
    Problema:  data.problema  || "",
    ChatId:    data.chatid    || "",
    Source:      "Chiamata Vocale",
    Canale:      "Telefono",
    Stato:       "Nuovo",
    Provenienza: data.source || "",
  };

  const servizioAirtable = SERVIZIO_MAP[data.servizio];
  if (servizioAirtable) {
    fields.Servizio = servizioAirtable;
  }

  const result = await airtablePost(TABLE_LEADS, fields);
  console.log(`📋 Lead salvato su Airtable: ${result.id}`);
  return result.id;
}

// ─── LOGGA MESSAGGIO su Log_Chat ─────────────────────────────────────────────
async function logMessage(data) {
  // data: { messageId, telefono, testoMessaggio, rispostaInviata,
  //         tipoMessaggio, sttStatus, aiParseStatus, timestamp }
  const fields = {
    Message_ID:          data.messageId         || "",
    Telefono:            data.telefono           || "",
    Testo_Messaggio:     data.testoMessaggio     || "",
    Risposta_Inviata:    data.rispostaInviata    || "",
    Tipo_Messaggio:      data.tipoMessaggio      || "chiamata_vocale",
    Canale:              "Chiamata Vocale",
    STT_Status:          data.sttStatus          || "ok",
    AI_Parse_Status:     data.aiParseStatus      || "nessun_dato",
    Timestamp_Messaggio: data.timestamp          || new Date().toISOString(),
  };

  try {
    const result = await airtablePost(TABLE_LOG, fields);
    console.log(`📝 Log_Chat salvato: ${result.id}`);
    return result.id;
  } catch (err) {
    // Il log non deve bloccare la chiamata
    console.error("⚠️ Errore Log_Chat:", err.message);
  }
}

module.exports = { saveLead, logMessage };
