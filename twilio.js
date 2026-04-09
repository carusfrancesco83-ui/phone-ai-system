// routes/twilio.js
const express = require("express");
const router = express.Router();
const twilio = require("twilio");
const VoiceResponse = twilio.twiml.VoiceResponse;

const openaiService = require("./openai");
const { saveCallData } = require("./dataSaver");
const { getGreeting } = require("./systemPrompt");
const { logMessage } = require("./airtable");
const { generateSpeech } = require("./elevenlabs");
const audioCache = require("./audioCache");

// Genera audio ElevenLabs e aggiunge twiml.play(); fallback su Google Neural2
async function ttsPlay(twiml, text) {
  try {
    const buffer = await generateSpeech(text);
    const token  = audioCache.store(buffer);
    twiml.play(`${process.env.BASE_URL}/audio/${token}`);
  } catch (err) {
    console.error("⚠️ ElevenLabs fallback su Google:", err.message);
    twiml.say({ language: "it-IT", voice: "Google.it-IT-Neural2-C" }, text);
  }
}

// ─── POST /twilio/incoming ────────────────────────────────────────────────────
// Twilio chiama questo endpoint quando arriva una chiamata
router.post("/incoming", async (req, res) => {
  const twiml = new VoiceResponse();
  const callSid = req.body.CallSid;
  const from = req.body.From || "unknown";

  try {
    console.log(`📞 Chiamata in arrivo: ${from} [${callSid}]`);

    // Inizializza sessione AI in memoria
    openaiService.initSession(callSid, from);

    // Messaggio di benvenuto
    const businessName = process.env.BUSINESS_NAME || "la nostra azienda";
    const welcomeText = `${getGreeting()}, sono l'assistente di ${businessName}. Come posso aiutarla?`;

    // Aggiungi alla history della sessione
    const session = openaiService.getSession(callSid);
    session.messages.push({ role: "assistant", content: welcomeText });
    session.transcript.push(`AI: ${welcomeText}`);

    // Parla e poi ascolta
    await ttsPlay(twiml, welcomeText);

    twiml.gather({
      input: "speech",
      action: `${process.env.BASE_URL}/twilio/gather`,
      method: "POST",
      language: "it-IT",
      speechTimeout: "auto",
      timeout: 10,
      actionOnEmptyResult: true,
    });

    twiml.redirect(`${process.env.BASE_URL}/twilio/no-input`);

  } catch (error) {
    console.error("Errore incoming:", error.message);
    twiml.say({ language: "it-IT" }, "Si è verificato un errore. Richiami più tardi.");
    twiml.hangup();
  }

  res.type("text/xml").send(twiml.toString());
});

// ─── POST /twilio/gather ──────────────────────────────────────────────────────
// Riceve il parlato trascritto e risponde con AI
router.post("/gather", async (req, res) => {
  const twiml = new VoiceResponse();
  const callSid = req.body.CallSid;
  const speechResult = req.body.SpeechResult || "";
  const confidence = parseFloat(req.body.Confidence || "0");

  console.log(`🎙️ [${callSid}] "${speechResult}" (confidence: ${confidence.toFixed(2)})`);

  try {
    if (!speechResult || confidence < 0.3) {
      await ttsPlay(twiml, "Mi scusi, non ho capito. Può ripetere?");
    } else {
      const { message, extractedData, transcript } = await openaiService.chat(
        callSid,
        speechResult
      );

      // Se l'AI ha raccolto tutti i dati → salva il lead
      if (extractedData) {
        const session = openaiService.getSession(callSid);
        saveCallData({
          callSid,
          phoneNumber: session.phoneNumber,
          extractedData,
          transcript,
        }).catch(console.error);
      }

      // Log ogni scambio su Log_Chat (non bloccante)
      logMessage({
        messageId:      `${callSid}-${Date.now()}`,
        telefono:       req.body.From || "unknown",
        testoMessaggio: speechResult,
        rispostaInviata: message,
        tipoMessaggio:  "chiamata_vocale",
        sttStatus:      confidence >= 0.3 ? "ok" : "bassa_confidenza",
        aiParseStatus:  extractedData ? "dati_estratti" : "nessun_dato",
        timestamp:      new Date().toISOString(),
      }).catch(() => {});

      await ttsPlay(twiml, message);
    }

    // Controlla se la chiamata si sta concludendo
    const session = openaiService.getSession(callSid);
    const lastMsg = session?.messages.at(-1)?.content || "";
    const isEnding =
      /arriveder|grazie per aver chiamato|buona giornata|al più presto|arrivederci/i.test(lastMsg);

    if (isEnding) {
      twiml.hangup();
    } else {
      twiml.gather({
        input: "speech",
        action: `${process.env.BASE_URL}/twilio/gather`,
        method: "POST",
        language: "it-IT",
        speechTimeout: "auto",
        timeout: 8,
        actionOnEmptyResult: true,
      });
      twiml.redirect(`${process.env.BASE_URL}/twilio/no-input`);
    }

  } catch (error) {
    console.error("Errore gather:", error.message);
    await ttsPlay(twiml, "Si è verificato un problema. La ricontatteremo al più presto.");
    twiml.hangup();
  }

  res.type("text/xml").send(twiml.toString());
});

// ─── POST /twilio/no-input ────────────────────────────────────────────────────
router.post("/no-input", async (req, res) => {
  const twiml = new VoiceResponse();
  const callSid = req.body.CallSid;

  const session = openaiService.getSession(callSid);
  if (session) {
    const noInputCount = (session.noInputCount || 0) + 1;
    session.noInputCount = noInputCount;

    if (noInputCount >= 2) {
      await ttsPlay(twiml, "Non ricevo risposta. La ringrazio e arrivederci.");
      twiml.hangup();
      return res.type("text/xml").send(twiml.toString());
    }
  }

  await ttsPlay(twiml, "C'è ancora qualcuno? Come posso aiutarla?");
  twiml.gather({
    input: "speech",
    action: `${process.env.BASE_URL}/twilio/gather`,
    method: "POST",
    language: "it-IT",
    speechTimeout: "auto",
    timeout: 8,
    actionOnEmptyResult: true,
  });
  twiml.redirect(`${process.env.BASE_URL}/twilio/no-input`);

  res.type("text/xml").send(twiml.toString());
});

// ─── POST /twilio/status ──────────────────────────────────────────────────────
router.post("/status", async (req, res) => {
  const { CallSid, CallStatus } = req.body;
  console.log(`📊 Status [${CallSid}]: ${CallStatus}`);

  if (CallStatus === "completed") {
    openaiService.deleteSession(CallSid);
  }

  res.sendStatus(200);
});

module.exports = router;
