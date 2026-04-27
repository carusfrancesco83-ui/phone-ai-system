// services/airtable.js
// Info_Requests : tblGGr8aL3sT02YCF
// Log_Chat      : tbleD1HKPfI4wCBOg

const TABLE_LEADS = "tblGGr8aL3sT02YCF";
const TABLE_LOG   = "tbleD1HKPfI4wCBOg";

// ─── Valori singleSelect verificati via MCP ───────────────────────────────────
// Info_Requests.Servizio : PULIZIA E SPURGO | VIDEOISPEZIONE | ANALISI DEI DATI | MAPPATURA DELLE RETI | RELINING TUBAZIONI | RIPRISTINO MANUFATTI | IMPERMEABILIZZAZIONE | PROVE DI TENUTA | ALTRO
// Info_Requests.Canale   : WhatsApp | Email | Telefono | Web | Altro | Telegram
// Info_Requests.Stato    : Nuovo | In lavorazione | Completato | Non qualificato
// Info_Requests.Stage    : Lead | Contattato | Preventivo | Chiuso
// Log_Chat.Tipo_Messaggio: text | audio | voice
// Log_Chat.STT_Status    : not_needed | success | failed
// Log_Chat.AI_Parse_Status: ok | failed

const SERVIZIO_MAP = {
  "Espurgo":          "PULIZIA E SPURGO",
  "Relining":         "RELINING TUBAZIONI",
  "Videoispezione":   "VIDEOISPEZIONE",
  "Montaggio amex":   "RELINING TUBAZIONI",
  "Pulizia cisterne": "PULIZIA E SPURGO",
  "Mappatura reti":   "MAPPATURA DELLE RETI",
  "Non classificato": "ALTRO",
};

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

  const fields = {
    Nome:        data.nome       || "",
    Cognome:     data.cognome    || "",
    Telefono:    data.telefono   || "",
    Email:       data.email      || "",
    Indirizzo:   data.indirizzo  || "",
    Città:       data.città      || "",
    CAP:         data.cap        || "",
    Problema:    data.problema   || "",
    ChatId:      data.chatid     || "",
    Canale:      "Telefono",
    Stato:       "Nuovo",
    Stage:       "Lead",
    Provenienza: data.source      || "",
    note_interne: data.noteInterne || "",
    Data:        new Date().toISOString(),
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
  const fields = {
    Message_ID:          data.messageId      || "",
    Telefono:            data.telefono       || "",
    Testo_Messaggio:     data.testoMessaggio || "",
    Risposta_Inviata:    data.rispostaInviata || "",
    Tipo_Messaggio:      "voice",
    STT_Status:          data.sttStatus      || "not_needed",
    AI_Parse_Status:     data.aiParseStatus  || "failed",
    Timestamp_Messaggio: data.timestamp      || new Date().toISOString(),
  };

  try {
    const result = await airtablePost(TABLE_LOG, fields);
    console.log(`📝 Log_Chat salvato: ${result.id}`);
    return result.id;
  } catch (err) {
    console.error("⚠️ Errore Log_Chat:", err.message);
  }
}

module.exports = { saveLead, logMessage };
