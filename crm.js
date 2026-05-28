// services/crm.js
//
// Invio lead al CRM Ecosan (NestJS) via webhook autenticato.
// Sostituisce la vecchia chiamata diretta ad Airtable: il CRM diventa
// la single source of truth, e ha un outbox che mirror automaticamente
// i lead su Airtable (no doppio scrittore).
//
// Endpoint CRM: POST {CRM_WEBHOOK_URL}/api/v1/webhooks/voice-bot/leads
// Auth:        header `x-api-key` con env CRM_VOICE_BOT_SECRET
// Idempotency: header `x-event-id` con callSid VAPI (no duplicati su replay)
//
// Configurazione richiesta (env vars su Railway phone-ai-system):
//   CRM_WEBHOOK_URL       (es. https://crm-dashboard-production-XXXX.up.railway.app)
//   CRM_VOICE_BOT_SECRET  (stesso valore di VOICE_BOT_WEBHOOK_SECRET sul CRM)
//
// 2026-05-28 — Created. Sostituisce airtable.saveLead nel flow chiamate vocali.

function getCrmConfig() {
  const url = (process.env.CRM_WEBHOOK_URL || "").replace(/\/+$/, ""); // strip trailing /
  const secret = (process.env.CRM_VOICE_BOT_SECRET || "").trim();
  if (!url) throw new Error("CRM_WEBHOOK_URL non configurato");
  if (!secret) throw new Error("CRM_VOICE_BOT_SECRET non configurato");
  return { url, secret };
}

/**
 * Salva un lead nel CRM tramite il webhook /webhooks/voice-bot/leads.
 *
 * @param {object} data - dati raccolti dalla chiamata vocale
 * @param {string} [data.nome]
 * @param {string} [data.cognome]
 * @param {string} [data.telefono]      cellulare/fisso del chiamante
 * @param {string} [data.email]
 * @param {string} [data.indirizzo]
 * @param {string} [data.città]
 * @param {string} [data.cap]
 * @param {string} [data.azienda]
 * @param {string} [data.servizio]      stringa libera (Espurgo / Videoispezione / Relining / ...)
 * @param {string} [data.problema]
 * @param {string} [data.source]
 * @param {string} [data.chatid]        callSid VAPI/Twilio - usato anche per idempotency
 * @param {string} [data.noteInterne]   riassunto AI della chiamata (preprended a problema)
 * @param {string} [data.transcript]    transcript completo della chiamata
 * @param {number} [data.durationSec]
 * @param {string} [data.callStartedAt] ISO date string
 * @param {string} [data.recordingUrl]
 * @returns {Promise<string>} lead id assegnato dal CRM
 */
async function saveLead(data) {
  const { url, secret } = getCrmConfig();
  const endpoint = `${url}/api/v1/webhooks/voice-bot/leads`;

  // Mapping bot → DTO CRM (VoiceBotLeadDto):
  //   nome + cognome → callerName (concatenati)
  //   telefono       → callerPhone
  //   email          → callerEmail
  //   indirizzo      → callerAddress
  //   città          → callerCity
  //   cap            → callerCap
  //   azienda        → callerCompany
  //   servizio       → detectedService (il CRM ha canonicalServiceName helper)
  //   problema       → problem (con noteInterne preprended se presenti)
  //   transcript     → transcript
  //   chatid         → callId + header x-event-id (idempotency)
  const callerName = [data.nome, data.cognome].filter(Boolean).join(" ").trim() || undefined;
  const problemaCombined = [data.noteInterne, data.problema].filter((s) => s && s.trim()).join("\n\n");

  // Fallback: se chiama da mobile, vapi.js mette il numero in `cellulare`
  // e lascia `telefono` vuoto. Il CRM accetta callerPhone OR callerEmail
  // quindi è essenziale che almeno uno dei due sia popolato.
  const body = {
    callerName,
    callerPhone: data.telefono || data.cellulare || undefined,
    callerEmail: data.email || undefined,
    callerCity: data.città || undefined,
    callerCap: data.cap || undefined,
    callerAddress: data.indirizzo || undefined,
    callerCompany: data.azienda || undefined,
    detectedService: data.servizio || undefined,
    problem: problemaCombined || undefined,
    transcript: data.transcript || undefined,
    source: data.source || "voice_bot",
    callId: data.chatid || undefined,
    durationSec: data.durationSec || undefined,
    callStartedAt: data.callStartedAt || undefined,
    recordingUrl: data.recordingUrl || undefined,
  };

  // Strip undefined per evitare validation errors lato CRM
  Object.keys(body).forEach((k) => body[k] === undefined && delete body[k]);

  const headers = {
    "Content-Type": "application/json",
    "x-api-key": secret,
  };
  if (data.chatid) {
    headers["x-event-id"] = data.chatid; // idempotency su callSid
  }

  console.log(`📤 CRM → ${endpoint} | callId: ${data.chatid || "(no-id)"}`);

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`CRM webhook ${response.status}: ${errText}`);
  }

  const json = await response.json();
  // CRM ritorna: { leadId, wasExisting, activityId, companyId, pivaMismatchedName, idempotent? }
  const leadId = json?.leadId;
  if (!leadId) throw new Error("CRM webhook returned no leadId");

  const tag = json.idempotent ? "[idempotent replay]" : (json.wasExisting ? "[existing lead]" : "[new lead]");
  console.log(`✅ Lead CRM ${tag}: ${leadId} (activity: ${json.activityId || "-"})`);
  return leadId;
}

// Ring buffer in-memory degli ultimi tentativi di saveLead (per /debug).
const LAST_ATTEMPTS = [];
function logAttempt(entry) {
  LAST_ATTEMPTS.unshift({ at: new Date().toISOString(), ...entry });
  while (LAST_ATTEMPTS.length > 10) LAST_ATTEMPTS.pop();
}
function getLastAttempts() { return LAST_ATTEMPTS; }

// Wrap di saveLead per intercettare esito
const _origSaveLead = saveLead;
async function saveLeadTracked(data) {
  const callId = data.chatid || "no-id";
  try {
    const leadId = await _origSaveLead(data);
    logAttempt({ callId, ok: true, leadId, payloadKeys: Object.keys(data) });
    return leadId;
  } catch (err) {
    logAttempt({
      callId,
      ok: false,
      error: String(err?.message || err),
      stack: String(err?.stack || "").substring(0, 1000),
      payloadKeys: Object.keys(data),
    });
    throw err;
  }
}

module.exports = { saveLead: saveLeadTracked, getLastAttempts };
