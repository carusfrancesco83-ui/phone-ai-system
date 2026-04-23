# Stato Progetto — Chiamata Vocale Ecosan
## Ultimo aggiornamento: 10 Aprile 2026, ore 20:00 circa

---

## 🟢 COSA FUNZIONA GIÀ (end-to-end)

```
Cliente chiama +1 (839) 225 2468
       ↓
Twilio riceve → passa la chiamata a VAPI
       ↓
VAPI (Assistente "Ecosan"):
  - Voce: ElevenLabs "Tiziana" (eleven_multilingual_v2)
  - STT:  Deepgram Nova 3, italiano
  - LLM:  GPT-4o, prompt conversazionale italiano
  - Background: rumore ufficio
       ↓
Conversazione naturale con il cliente:
  1. Ascolta il problema
  2. Chiede nome, cognome, indirizzo, email, provenienza
  3. Riepilogo + conferma
  4. Saluto → chiamata si chiude automaticamente (endCallPhrases)
       ↓
VAPI manda end-of-call-report al webhook:
  POST https://phone-ai-system-production.up.railway.app/vapi/webhook
       ↓
Server Node.js (Railway) → vapi.js:
  - Legge artifact.structuredOutputs (9 campi estratti dall'AI)
  - Normalizza il servizio (Espurgo → ESPURGO)
  - Chiama saveLead() → Airtable
  - Chiama logMessage() → Log_Chat
  - Manda notifica Telegram al responsabile del servizio
       ↓
Airtable → tabella Info_Requests: record creato con tutti i campi compilati ✅
```

### Campi che vengono compilati automaticamente in Airtable:
| Campo | Fonte | Stato |
|---|---|---|
| Nome | Structured Output VAPI | ✅ funzionante |
| Cognome | Structured Output VAPI | ✅ funzionante |
| Telefono | call.customer.number | ✅ funzionante |
| Email | Structured Output VAPI | ✅ (prompt aggiornato per chiederla SEMPRE) |
| Città | Structured Output VAPI | ✅ funzionante |
| CAP | Structured Output VAPI (dedotto dalla città) | ✅ funzionante |
| Indirizzo | Structured Output VAPI | ✅ funzionante |
| Servizio | Structured Output VAPI → SERVIZIO_MAP → enum Airtable | ✅ funzionante |
| Problema | Structured Output VAPI | ✅ funzionante |
| Provenienza | Structured Output VAPI (campo "source") | ✅ funzionante |
| note_interne | Trascrizione completa della chiamata | ✅ funzionante |
| ChatId | call.id (UUID VAPI) | ✅ funzionante |
| Canale | Hardcoded "Telefono" | ✅ funzionante |
| Stato | Hardcoded "Nuovo" | ✅ funzionante |
| Stage | Hardcoded "Lead" | ✅ funzionante |
| Data | new Date().toISOString() | ✅ ma in UTC (vedi issue sotto) |

---

## ⚠️ ISSUE CONOSCIUTE (da fixare)

### 1. Data in UTC su Airtable
Il campo `Data` viene salvato in formato UTC. Per mostrarlo in ora italiana:
- **Fix consigliato (Airtable UI)**: Airtable → tabella Info_Requests → click freccia colonna "Data" → "Edit field" → Time zone → cambia a "Europe/Rome (Rome)" → Save.
- Questo cambia SOLO il display, non i dati salvati. Tutti i record (passati e futuri) mostreranno l'ora italiana.

### 2. VAPI_WEBHOOK_SECRET disabilitato
Il secret per l'autenticazione del webhook è stato temporaneamente svuotato su Railway perché c'era un mismatch con VAPI. Da ri-configurare:
- **Su Railway**: Project → Shared Variables → `VAPI_WEBHOOK_SECRET` → impostare un valore casuale tipo `ecosan-vapi-2026-aB9xY2pQ7mNvK3rL5tH8wJ`
- **Su VAPI dashboard**: Phone Numbers → +1 (839) 225 2468 → sezione Authorization → Header Name: `X-Vapi-Secret`, Header Value: lo stesso valore
- **Restart** Railway dopo aver impostato la variabile

### 3. Notifiche Telegram parziali
Il file `whatsapp.js` (che in realtà manda notifiche Telegram) usa la mappa `TELEGRAM_CHAT_*` per smistare le notifiche per servizio. Su Railway mancano le variabili per alcuni servizi:
- ✅ `TELEGRAM_CHAT_ESPURGO` → configurata
- ❌ `TELEGRAM_CHAT_RELINING` → da aggiungere
- ❌ `TELEGRAM_CHAT_VIDEOISPEZIONE` → da aggiungere
- ❌ `TELEGRAM_CHAT_MONTAGGIO_AMEX` → da aggiungere
- ❌ `TELEGRAM_CHAT_DA_DEFINIRE` → da aggiungere
- Le chiamate con servizio diverso da ESPURGO ricadono sul fallback (chat generico) o non mandano notifica.

### 4. Chiavi di sicurezza da rotare
Tutte le chiavi sono state esposte nel contesto di una sessione Claude Code (lette dal .env per debug). Da rigenerare:
- `OPENAI_API_KEY` → platform.openai.com → API Keys → rigenerare
- `AIRTABLE_API_KEY` → airtable.com/create/tokens → rigenerare
- `TWILIO_AUTH_TOKEN` → console.twilio.com → Dashboard → rigenerare
- `ELEVENLABS_API_KEY` → elevenlabs.io → Profile → API Keys → rigenerare
- `VAPI_PRIVATE_KEY` → dashboard.vapi.ai → API Keys → rigenerare
- `TELEGRAM_BOT_TOKEN` → Telegram @BotFather → /revoke → /newtoken
- GitHub PAT → github.com/settings/tokens → revocare e ricreare
- Dopo: aggiornare .env locale + Railway shared variables + VAPI dashboard + remote git

---

## 📁 STRUTTURA FILE DEL PROGETTO

```
phone-ai-system/
├── server.js          # Express entry point, monta /twilio + /vapi + endpoint debug
├── vapi.js            # ⭐ POST /vapi/webhook — riceve end-of-call da VAPI → saveLead
├── twilio.js          # POST /twilio/incoming, /gather, /no-input, /status (vecchio flusso TwiML)
├── openai.js          # Sessioni GPT-4o in memoria, chat(), extractSaveData(), generateSummary()
├── airtable.js        # saveLead() → tabella Info_Requests + logMessage() → Log_Chat
├── dataSaver.js       # Orchestratore: saveLead + notifica Telegram + notifica Gmail
├── systemPrompt.js    # Prompt italiano per il flusso Twilio (con [SALVA_DATI] block)
├── whatsapp.js        # Notifiche Telegram (nome file fuorviante, in realtà usa Telegram Bot API)
├── gmail.js           # Notifiche email via Gmail SMTP
├── elevenlabs.js      # TTS ElevenLabs per il flusso Twilio (non usato da VAPI)
├── audioCache.js      # Cache audio MP3 in memoria per il flusso Twilio+ElevenLabs
├── package.json       # Dipendenze: express, twilio, openai, dotenv, cors, body-parser, ws, uuid, airtable
├── .env               # ⚠️ NON committato, contiene tutti i segreti
├── .gitignore         # .env, node_modules/, .claude/
├── info.md            # Note personali del proprietario (NON committato)
├── STATO_PROGETTO.md  # ⬅ QUESTO FILE
└── README.md          # Documentazione (ATTENZIONE: parzialmente disallineata con il codice attuale)
```

---

## 🔑 ACCOUNT E SERVIZI

### VAPI (Voice AI Platform)
- **Dashboard**: https://dashboard.vapi.ai
- **Account**: informaticoimprovvisato@gmail.com
- **Piano**: PAYG (Pay As You Go), ~$8.89 crediti rimasti
- **Assistente "Ecosan"**: ID `67dde60b-06ad-4c18-8b69-664204bec7f2`
  - Model: OpenAI GPT-4o, temperature 0.7
  - Voice: ElevenLabs "Tiziana" (eleven_multilingual_v2), voiceId `RXoaSpLaWTEckJgPUBG3`
  - Transcriber: Deepgram Nova 3, Italian, numerals ON
  - endCallPhrases: ["arrivederci", "buona giornata", "buona serata", "a presto", ...]
  - backgroundSound: "office"
  - Smart Endpointing: vapi
  - 9 Structured Outputs attaccati (nome, cognome, email, città, cap, indirizzo, servizio, problema, source)
- **Phone Number importato**: +1 (839) 225 2468 (Twilio US, label "Test US")
  - Server URL: `https://phone-ai-system-production.up.railway.app/vapi/webhook`

### Twilio
- **Console**: https://console.twilio.com
- **Numero**: +1 (839) 225 2468 (USA, NON pubblicizzato — solo per test)
- **Stato**: il numero è ora gestito da VAPI (VAPI ha sovrascritto il webhook voice). Il vecchio TwiML Bin "Ecosan_bot" è ancora salvato su Twilio ma non viene più chiamato.
- **Per tornare al vecchio sistema**: Twilio Console → Phone Numbers → Configure → rimettere il TwiML Bin come webhook voice. Oppure rimuovere il numero da VAPI.

### Railway
- **Dashboard**: https://railway.app
- **Progetto**: contiene il service `phone-ai-system`
- **Dominio pubblico**: `https://phone-ai-system-production.up.railway.app`
- **Endpoint webhook VAPI**: `https://phone-ai-system-production.up.railway.app/vapi/webhook`
- **Endpoint health**: `https://phone-ai-system-production.up.railway.app/vapi/health`
- **Deploy**: auto-deploy da GitHub (`carusfrancesco83-ui/phone-ai-system`, branch `main`)
- **Shared Variables**: tutte configurate (vedi sezione variabili sotto)

### ElevenLabs
- **Dashboard**: https://elevenlabs.io
- **Piano**: Free (~37k crediti rimasti su 40k)
- **Voce usata**: "Tiziana - smart, balanced and credible"
- **Voice ID**: `RXoaSpLaWTEckJgPUBG3`
- **API Key scopes**: text_to_speech, voices read, models read, user read

### Airtable
- **Base ID**: `appZCHdwrFGX28L9X`
- **Tabella principale**: `Info_Requests` (ID: `tblGGr8aL3sT02YCF`)
  - 19 campi (vedi sezione "Campi compilati" sopra)
  - Servizio: enum (ESPURGO, RELINING, VIDEOISPEZIONE, MONTAGGIO_AMEX, PULIZIA_CISTERNE, MAPPATURA_RETI, DA_DEFINIRE)
  - Canale: enum (WhatsApp, Email, Telefono, Web, Altro, Telegram)
  - Stato: enum (Nuovo, In lavorazione, Completato, Non qualificato)
  - Stage: enum (Lead, Contattato, Preventivo, Chiuso)
- **Tabella log**: `Log_Chat` (ID: `tbleD1HKPfI4wCBOg`) — log messaggi WhatsApp/voice

### GitHub
- **Repo**: `carusfrancesco83-ui/phone-ai-system` (privata)
- **Branch**: `main`
- **Ultimo commit**: `b841db7` — `fix(vapi): read structured outputs from artifact.structuredOutputs`

---

## 🔧 VARIABILI D'AMBIENTE (Railway Shared Variables)

Tutte queste devono essere configurate su Railway:
```env
# Twilio
TWILIO_ACCOUNT_SID=ACf440c...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+18392252468

# OpenAI (usato dal flusso Twilio legacy + generateSummary)
OPENAI_API_KEY=sk-proj-...

# Airtable
AIRTABLE_API_KEY=patOtiQy...
AIRTABLE_BASE_ID=appZCHdwrFGX28L9X

# Server
PORT=3000
BASE_URL=https://phone-ai-system-production.up.railway.app

# Business
BUSINESS_NAME="Ecosan Italia"
BUSINESS_LANGUAGE=italiano

# ElevenLabs (usato dal flusso Twilio legacy con ElevenLabs TTS)
ELEVENLABS_API_KEY=sk_49b5...
ELEVENLABS_VOICE_ID=RXoaSpLaWTEckJgPUBG3

# VAPI
VAPI_PRIVATE_KEY=ec1975cf-...
VAPI_PUBLIC_KEY=3e19895b-...
VAPI_ASSISTANT_ID=67dde60b-06ad-4c18-8b69-664204bec7f2
VAPI_WEBHOOK_SECRET=      # ⚠️ attualmente vuoto, da ri-impostare

# Telegram (notifiche)
TELEGRAM_BOT_TOKEN=8664755811:AAF...
TELEGRAM_CHAT_ESPURGO=...
# TELEGRAM_CHAT_RELINING=...     # da aggiungere
# TELEGRAM_CHAT_VIDEOISPEZIONE=... # da aggiungere
# TELEGRAM_CHAT_MONTAGGIO_AMEX=... # da aggiungere
# TELEGRAM_CHAT_DA_DEFINIRE=...    # da aggiungere

# Gmail
GMAIL_USER=...
GMAIL_APP_PASSWORD=...
GMAIL_NOTIFY_TO=...
```

---

## 🛠️ COME RIPARTIRE DA UN NUOVO PC

### 1. Clona il repo
```bash
git clone https://github.com/carusfrancesco83-ui/phone-ai-system.git
cd phone-ai-system
```

### 2. Crea il file `.env` locale
Copia le variabili dalla sezione sopra nel file `.env` nella root del progetto. Oppure copiale dal Railway dashboard (Project → Shared Variables).

### 3. Installa dipendenze
```bash
npm install
```

### 4. Testa localmente
```bash
npm run dev
# Oppure: npm start
# Il server parte su http://localhost:3000
# Testa: curl http://localhost:3000/vapi/health
```

### 5. Fai modifiche
Modifica i file, testa localmente, poi:
```bash
git add <files>
git commit -m "tipo: descrizione"
git push origin main
```
Railway rileva il push automaticamente e fa redeploy in 1-3 minuti.

### 6. Per testare le chiamate VAPI
- Chiama `+1 (839) 225 2468` dal tuo cellulare (chiamata internazionale)
- Oppure vai su VAPI dashboard → Phone Numbers → Make Outbound Call → metti il tuo numero italiano → Ecosan come assistant → Call
- Dopo la chiamata, verifica su Airtable che il record sia creato con i campi corretti

### 7. Per modificare il prompt dell'assistente VAPI
Due modi:
- **Dashboard VAPI**: Assistants → Ecosan → tab Model → System Prompt → modifica → Save → Publish
- **Via API** (più veloce per piccole modifiche):
  ```bash
  # GET prompt attuale
  curl -s -H "Authorization: Bearer $VAPI_PRIVATE_KEY" \
    "https://api.vapi.ai/assistant/67dde60b-06ad-4c18-8b69-664204bec7f2" \
    | python3 -c "import json,sys; print(json.load(sys.stdin)['model']['messages'][0]['content'])"
  
  # PATCH (sostituisci tutto il model.messages[0].content)
  # Usa lo script Python che abbiamo usato in sessione
  ```

### 8. Per aggiungere/modificare Structured Outputs VAPI
```bash
# Lista tutti gli outputs
curl -s -H "Authorization: Bearer $VAPI_PRIVATE_KEY" \
  "https://api.vapi.ai/structured-output?limit=100" | python3 -m json.tool

# Attach un output all'assistente
curl -s -X PATCH "https://api.vapi.ai/structured-output/{OUTPUT_ID}" \
  -H "Authorization: Bearer $VAPI_PRIVATE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"assistantIds":["67dde60b-06ad-4c18-8b69-664204bec7f2"]}'
```

---

## 📊 COSTI OPERATIVI STIMATI

### Per singola chiamata (3 minuti medi)
| Componente | Costo/min | Per 3 min |
|---|---|---|
| VAPI platform | $0.05 | $0.15 |
| GPT-4o (LLM) | $0.04-0.06 | $0.15 |
| ElevenLabs (TTS) | $0.10 | $0.30 |
| Deepgram (STT) | $0.005 | $0.015 |
| Twilio (voice) | $0.014 | $0.042 |
| **Totale** | **~$0.21/min** | **~$0.66/chiamata** |

### Mensile (stima 10 chiamate/giorno)
~$200/mese di costi cloud. Confronto: segretaria part-time ~$1000-1500/mese.

### Crediti attuali
- VAPI: ~$8.89 (per ~42 minuti di chiamate)
- ElevenLabs: ~37k caratteri (piano Free, sufficiente per test)

---

## 🗺️ PROSSIMI STEP (in ordine di priorità)

### Alta priorità (prima del go-live)
1. ✅ ~~Pipeline end-to-end funzionante~~
2. ⬜ Rotare tutte le chiavi di sicurezza (vedi sezione Issue)
3. ⬜ Configurare VAPI_WEBHOOK_SECRET (auth del webhook)
4. ⬜ Cambiare display timezone Airtable a Europe/Rome
5. ⬜ Testare qualche giorno con scenari diversi (urgenza, vecchietto confuso, richiesta strana)
6. ⬜ Upgrade ElevenLabs a piano Starter/Creator per produzione

### Media priorità (miglioramenti)
7. ⬜ Aggiungere TELEGRAM_CHAT_* per tutti i servizi
8. ⬜ Tuning del prompt (voce, latenza, tono) basato su feedback utente
9. ⬜ Numero italiano Twilio (+39) per produzione Ecosan reale
10. ⬜ Allineare README.md con il codice attuale

### Bassa priorità (nice to have)
11. ⬜ Aggiungere notifiche Gmail anche dal flusso VAPI (attualmente solo Telegram)
12. ⬜ Aggiungere PULIZIA_CISTERNE e MAPPATURA_RETI al prompt VAPI
13. ⬜ Rimuovere il codice legacy Twilio se non più necessario
14. ⬜ Valutare cambio modello GPT-4o → GPT-4o-mini o Gemini 2.5 Flash per costi

---

## 📝 ARCHITETTURA TECNICA (per chi continua il lavoro)

### Flusso VAPI (attivo, gestisce le chiamate)
```
Twilio → VAPI → GPT-4o + ElevenLabs + Deepgram
                     ↓ (end-of-call-report)
              POST /vapi/webhook (Railway)
                     ↓
              vapi.js → artifact.structuredOutputs
                     ↓ (normalizza servizio, flatten keys)
              saveLead() → Airtable POST
              logMessage() → Airtable POST (Log_Chat)
              sendWhatsAppNotifica() → Telegram Bot API
```

### Flusso Twilio legacy (dormiente, ma codice ancora presente)
```
Twilio → POST /twilio/incoming (server.js)
              ↓
       TwiML <Say> + <Gather speech>
              ↓
       POST /twilio/gather → openai.js chat()
              ↓
       extractSaveData() → [SALVA_DATI] block parser
              ↓
       saveCallData() → saveLead() → Airtable
```
⚠️ Il flusso Twilio legacy NON gestisce più le chiamate perché il numero è puntato a VAPI.

### vapi.js — struttura del payload VAPI
Il webhook riceve diversi tipi di evento. Solo `end-of-call-report` trigger il salvataggio:
```javascript
// Il payload VAPI ha questa struttura per end-of-call-report:
{
  message: {
    type: "end-of-call-report",
    endedReason: "assistant-said-end-call-phrase",
    call: {
      id: "uuid-della-chiamata",
      customer: { number: "+39..." }
    },
    transcript: "AI: Buongiorno...\nUser: Ho un problema...",
    artifact: {
      structuredOutputs: {
        "uuid-output-1": { name: "nome", result: "Francesco" },
        "uuid-output-2": { name: "cognome", result: "Caruso" },
        // ... altri 7 campi
      },
      transcript: "...",
      messages: [...]
    },
    analysis: { ... }  // vecchio formato, non usato attualmente
  }
}
```

### airtable.js — mapping servizio
Il prompt VAPI usa nomi italiani ("Espurgo", "Relining", ecc.) e il codice li mappa ai valori UPPER del singleSelect Airtable tramite `SERVIZIO_MAP`:
```javascript
const SERVIZIO_MAP = {
  "Espurgo":          "ESPURGO",
  "Relining":         "RELINING",
  "Videoispezione":   "VIDEOISPEZIONE",
  "Montaggio amex":   "MONTAGGIO_AMEX",
  "Pulizia cisterne": "PULIZIA_CISTERNE",
  "Mappatura reti":   "MAPPATURA_RETI",
  "Non classificato": "DA_DEFINIRE",
};
```
⚠️ `vapi.js` ha un suo `SERVIZIO_NORMALIZE` che accetta anche i valori UPPER come alias.

---

## 🔐 NOTE DI SICUREZZA

1. **Il file `.env` NON deve mai essere committato su git** — è in `.gitignore`
2. **Il remote git contiene un GitHub PAT nell'URL** — da rimuovere con `git remote set-url origin https://github.com/carusfrancesco83-ui/phone-ai-system.git` e poi usare macOS Keychain per l'auth
3. **Tutte le chiavi sono state esposte** nel contesto della sessione Claude Code del 10/04/2026 — da rigenerare TUTTE (vedi sezione Issue)
4. **VAPI_WEBHOOK_SECRET** è attualmente vuoto su Railway — chiunque conosca l'URL del webhook può creare lead falsi. Da rimettere appena possibile.
5. **Il numero +1 (839) 225 2468 NON è pubblicizzato** — è un numero di test USA, nessun cliente reale lo conosce. Per la produzione servità un numero italiano +39.
