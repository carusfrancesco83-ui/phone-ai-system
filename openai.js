// services/openai.js
const OpenAI = require("openai");
const { getSystemPrompt } = require("./systemPrompt");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Sessioni attive in memoria: callSid -> { messages, callRecordId, contactId }
const sessions = new Map();

function initSession(callSid, phoneNumber) {
  sessions.set(callSid, {
    phoneNumber,
    messages: [],
    transcript: [],
    startTime: Date.now(),
  });
}

function getSession(callSid) {
  return sessions.get(callSid);
}

function deleteSession(callSid) {
  sessions.delete(callSid);
}

// Invia il messaggio dell'utente e ottieni la risposta AI
async function chat(callSid, userMessage) {
  const session = sessions.get(callSid);
  if (!session) throw new Error(`Sessione non trovata per ${callSid}`);

  // aggiungi messaggio utente alla storia
  session.messages.push({ role: "user", content: userMessage });
  session.transcript.push(`Chiamante: ${userMessage}`);

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: getSystemPrompt() },
      ...session.messages,
    ],
    temperature: 0.7,
    max_tokens: 300,
  });

  const assistantMessage = response.choices[0].message.content;

  // aggiungi risposta AI alla storia
  session.messages.push({ role: "assistant", content: assistantMessage });
  session.transcript.push(`AI: ${assistantMessage}`);

  // controlla se ci sono dati da salvare
  const extractedData = extractSaveData(assistantMessage);

  // pulisci il messaggio (rimuovi il blocco JSON)
  const cleanMessage = assistantMessage
    .replace(/\[SALVA_DATI\][\s\S]*?\[\/SALVA_DATI\]/g, "")
    .trim();

  return {
    message: cleanMessage,
    extractedData,
    transcript: session.transcript.join("\n"),
  };
}

// Genera una risposta iniziale di benvenuto
async function getWelcomeMessage() {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: getSystemPrompt() },
      { role: "user", content: "START_CALL" },
    ],
    temperature: 0.7,
    max_tokens: 100,
  });
  return response.choices[0].message.content;
}

// Estrae il JSON dal blocco [SALVA_DATI] con parsing robusto
function extractSaveData(message) {
  const match = message.match(/\[SALVA_DATI\]([\s\S]*?)\[\/SALVA_DATI\]/);
  if (!match) return null;

  const raw = match[1].trim();

  // Tentativo 1: JSON valido
  try { return JSON.parse(raw); } catch {}

  // Tentativo 2: rimuovi virgole trailing prima di } o ]
  try { return JSON.parse(raw.replace(/,(\s*[}\]])/g, "$1")); } catch {}

  // Tentativo 3: sostituisci apici singoli con doppi
  try { return JSON.parse(raw.replace(/,(\s*[}\]])/g, "$1").replace(/'/g, '"')); } catch (e) {
    console.error("Errore parsing dati:", e.message, "| Raw:", raw.substring(0, 120));
    return null;
  }
}

// Genera un riassunto finale della chiamata
async function generateSummary(transcript) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: `Riassumi questa chiamata in 2-3 frasi, includendo: tipo di richiesta, dati chiave raccolti, esito.\n\nTRASCRIZIONE:\n${transcript}`,
      },
    ],
    max_tokens: 150,
  });
  return response.choices[0].message.content;
}

module.exports = {
  initSession,
  getSession,
  deleteSession,
  chat,
  getWelcomeMessage,
  generateSummary,
};
