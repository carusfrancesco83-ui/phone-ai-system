# Stato Progetto — Chiamata Vocale Ecosan
## Ultimo aggiornamento: 27 Aprile 2026 (sync dopo 3 commit di altra sessione)

> 📌 **NOTA IMPORTANTE PER CHI LEGGE**: questo file è stato aggiornato **dopo** un git pull che ha portato 3 commit fatti da una sessione Claude Sonnet 4.6 il 27/04/2026. Lo schema Airtable del campo `Servizio` è cambiato (vedi sezione dedicata) e c'è un'**incoerenza nota** tra il prompt VAPI (7 servizi) e il codice (10 servizi). Va sistemata prima di andare live davvero.

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
  - Normalizza il servizio italiano → enum Airtable (es. "Espurgo" → "PULIZIA E SPURGO")
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
| Servizio | Structured Output VAPI → SERVIZIO_MAP → enum Airtable | ✅ funzionante (con caveat sui 4 servizi nuovi) |
| Problema | Structured Output VAPI | ✅ funzionante |
| Provenienza | Structured Output VAPI (campo "source") | ✅ funzionante |
| note_interne | Trascrizione completa o riassunto AI (`generateSummary`) | ✅ funzionante |
| ChatId | call.id (UUID VAPI) | ✅ funzionante |
| Canale | Hardcoded "Telefono" | ✅ funzionante |
| Stato | Hardcoded "Nuovo" | ✅ funzionante |
| Stage | Hardcoded "Lead" | ✅ funzionante |
| Data | `new Date().toISOString()` (UTC, esplicito nel payload da commit `763641b`) | ⚠️ display in UTC (vedi issue sotto) |

---

## 🆕 NOVITÀ DAL 27 APRILE 2026 (3 commit da altra sessione Claude)

### Commit `763641b` — `fix(airtable): align SERVIZIO_MAP to actual Airtable singleSelect values`

Lo **schema Airtable del campo `Servizio` è cambiato**. I valori veri ora sono **9 valori in italiano UPPERCASE con spazi**, NON i 7 valori precedenti con underscore. Lo schema corretto è documentato come commento dentro `airtable.js`:

```
ESPURGO          (vecchio)  →  PULIZIA E SPURGO       (nuovo)
RELINING         (vecchio)  →  RELINING TUBAZIONI     (nuovo)
VIDEOISPEZIONE   (uguale)   →  VIDEOISPEZIONE
MONTAGGIO_AMEX   (vecchio)  →  ❌ rimosso (mappa a RELINING TUBAZIONI nel codice)
PULIZIA_CISTERNE (vecchio)  →  ❌ rimosso (mappa a PULIZIA E SPURGO nel codice)
MAPPATURA_RETI   (vecchio)  →  MAPPATURA DELLE RETI   (nuovo)
DA_DEFINIRE      (vecchio)  →  ALTRO                  (nuovo)

NUOVI:
                            →  ANALISI DEI DATI
                            →  RIPRISTINO MANUFATTI
                            →  IMPERMEABILIZZAZIONE
                            →  PROVE DI TENUTA
```

Inoltre `airtable.js` ora include esplicitamente `Data: new Date().toISOString()` nel payload `fields` di `saveLead`.

### Commit `fc6ea84` — `fix(telegram): complete CHAT_ID_MAP and simplify to single bot token`

- `CHAT_ID_MAP` di `whatsapp.js` completato con tutti i servizi (PULIZIA_CISTERNE, MAPPATURA_RETI, ecc.)
- Rimossa `BOT_TOKEN_MAP` (era multi-bot, una key per servizio) → ora si usa **un solo `TELEGRAM_BOT_TOKEN`** per tutte le notifiche
- Aggiunta variabile `TELEGRAM_CHAT_GENERALE` come **catch-all** per la notifica generale (gruppo dove arrivano TUTTE le richieste, oltre alla notifica specifica per servizio)

### Commit `b4a9f98` — `feat: add full service coverage for all Airtable Servizio options`

I 4 servizi nuovi sono stati aggiunti dappertutto nel codice:
- `airtable.js` → `SERVIZIO_MAP` (mapping italiano → enum Airtable UPPER)
- `vapi.js` → `SERVIZIO_NORMALIZE` (mapping per accettare valori da VAPI in vari formati)
- `whatsapp.js` → `CHAT_ID_MAP` (per smistare le notifiche Telegram)

I 4 servizi nuovi sono:
- `Analisi dei dati` → `ANALISI DEI DATI` (Airtable)
- `Ripristino manufatti` → `RIPRISTINO MANUFATTI`
- `Impermeabilizzazione` → `IMPERMEABILIZZAZIONE`
- `Prove di tenuta` → `PROVE DI TENUTA`

---

## ⚠️ ISSUE CONOSCIUTE (da fixare)

### 1. ⚠️ NUOVA — Inconsistenza prompt VAPI vs codice (PRIORITÀ ALTA)
Il **codice è pronto** per gestire 10 servizi (7 vecchi + 4 nuovi + Non classificato), ma:
- Il **system prompt** dell'assistente VAPI conosce ancora solo i **7 vecchi valori** italiani (Espurgo, Relining, Videoispezione, Montaggio amex, Pulizia cisterne, Mappatura reti, Non classificato)
- Lo **structured output `servizio`** di VAPI ha lo stesso elenco di 7 valori come Allowed Values

Quindi VAPI estrarrà sempre uno dei 7 vecchi valori — i 4 nuovi servizi (Analisi dei dati, Ripristino manufatti, Impermeabilizzazione, Prove di tenuta) **NON saranno mai estratti automaticamente**. Se un cliente chiede uno di questi, verrà classificato come "Non classificato" → "ALTRO" su Airtable.

**Fix necessario** (via API VAPI):
1. Aggiornare il system prompt dell'assistente per descrivere anche i 4 nuovi servizi nella sezione "CLASSIFICAZIONE INTERNA DEL SERVIZIO"
2. Aggiornare lo structured output `servizio` (UUID `1db7a830-a152-45da-b392-c9c5d6d75223`) per aggiungere i 4 nuovi valori nell'array Allowed Values

Il fix si può fare con uno script Python che fa GET → modifica → PATCH sull'API VAPI.

### 2. Data in UTC su Airtable (da prima)
Il campo `Data` viene salvato in formato UTC. Per mostrarlo in ora italiana:
- **Fix consigliato (Airtable UI)**: Airtable → tabella Info_Requests → click freccia colonna "Data" → "Edit field" → Time zone → cambia a "Europe/Rome (Rome)" → Save.
- Questo cambia SOLO il display, non i dati salvati. Tutti i record (passati e futuri) mostreranno l'ora italiana.

### 3. VAPI_WEBHOOK_SECRET disabilitato (da prima)
Il secret per l'autenticazione del webhook è stato temporaneamente svuotato su Railway perché c'era un mismatch con VAPI. Da ri-configurare:
- **Su Railway**: Project → Shared Variables → `VAPI_WEBHOOK_SECRET` → impostare un valore casuale tipo `ecosan-vapi-2026-aB9xY2pQ7mNvK3rL5tH8wJ`
- **Su VAPI dashboard**: Phone Numbers → +1 (839) 225 2468 → sezione Authorization → Header Name: `X-Vapi-Secret`, Header Value: lo stesso valore
- **Restart** Railway dopo aver impostato la variabile

### 4. Notifiche Telegram (parzialmente risolto da `fc6ea84`)
Il `CHAT_ID_MAP` ora copre tutti i servizi internamente, ma servono ancora le **env var su Railway** con i chat ID veri:
- ✅ `TELEGRAM_CHAT_ESPURGO` → configurata
- ✅ `TELEGRAM_CHAT_GENERALE` → introdotta dal commit `fc6ea84` (verificare se è stata creata su Railway)
- ❓ `TELEGRAM_CHAT_RELINING`, `_VIDEOISPEZIONE`, `_MONTAGGIO_AMEX`, `_DA_DEFINIRE`, `_PULIZIA_CISTERNE`, `_MAPPATURA_RETI`, `_ANALISI_DEI_DATI`, `_RIPRISTINO_MANUFATTI`, `_IMPERMEABILIZZAZIONE`, `_PROVE_DI_TENUTA` → da verificare/aggiungere su Railway
- Le chiamate con servizio non mappato ricadono sul fallback (`TELEGRAM_CHAT_GENERALE` o catch-all).

### 5. Chiavi di sicurezza da rotare (da prima)
Tutte le chiavi sono state esposte nel contesto di una sessione Claude Code (lette dal .env per debug). Da rigenerare:
- `OPENAI_API_KEY` → platform.openai.com → API Keys → rigenerare
- `AIRTABLE_API_KEY` → airtable.com/create/tokens → rigenerare
- `TWILIO_AUTH_TOKEN` → console.twilio.com → Dashboard → rigenerare
- `ELEVENLABS_API_KEY` → elevenlabs.io → Profile → API Keys → rigenerare
- `VAPI_PRIVATE_KEY` → dashboard.vapi.ai → API Keys → rigenerare
- `TELEGRAM_BOT_TOKEN` → Telegram @BotFather → /revoke → /newtoken
- GitHub PAT → github.com/settings/tokens → revocare e ricreare
- Dopo: aggiornare .env locale + Railway shared variables + VAPI dashboard + remote git

### 6. Debiti tecnici nel codice (note di lettura)
Durante questa review ho notato in `dataSaver.js` campi passati a `saveLead` che NON esistono nello schema Airtable (saveLead li ignora silenziosamente):
- `messaggiooriginale` (non esiste)
- `canale: "Chiamata Vocale"` (valore non valido del singleSelect; saveLead hardcoda comunque "Telefono")
- `user: phoneNumber` (non esiste)

Sono inert (saveLead non li mette nel payload), ma è codice morto da pulire quando si avrà tempo.

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
- **Piano**: PAYG (Pay As You Go)
- **Assistente "Ecosan"**: ID `67dde60b-06ad-4c18-8b69-664204bec7f2`
  - Model: OpenAI GPT-4o, temperature 0.7
  - Voice: ElevenLabs "Tiziana" (eleven_multilingual_v2), voiceId `RXoaSpLaWTEckJgPUBG3`
  - Transcriber: Deepgram Nova 3, Italian, numerals ON
  - endCallPhrases: ["arrivederci", "buona giornata", "buona serata", "a presto", ...]
  - backgroundSound: "office"
  - Smart Endpointing: vapi
  - 9 Structured Outputs attaccati: nome, cognome, email, città, cap, indirizzo, servizio, problema, source
  - ⚠️ Lo structured output `servizio` ha **solo 7 Allowed Values vecchi** — da aggiornare con i 4 nuovi (vedi Issue #1)
- **Phone Number importato**: +1 (839) 225 2468 (Twilio US, label "Test US")
  - Server URL: `https://phone-ai-system-production.up.railway.app/vapi/webhook`

### IDs degli Structured Outputs VAPI (utili per PATCH via API)
```
nome:      e9beb5f6-8243-4f93-81a9-ea7ef6a5a06d
cognome:   d3876d0f-f47e-4c08-9315-f32dc7cafaf0
email:     37cf67f2-4e58-4b30-82eb-eb7a29a086a7
città:     5c5ed76d-f5a1-4f25-925a-bd3d514bcc47
cap:       a66ef5a2-455a-48bc-952f-7a0515baadef
indirizzo: e5cf1318-0a17-4778-900a-c29a8466894d
servizio:  1db7a830-a152-45da-b392-c9c5d6d75223  ← da aggiornare con i 4 nuovi valori
problema:  a3e5f040-abda-4f81-845e-319e2e5eaf3a
source:    a2e00a46-1fdc-4f25-a9d2-55df3d0071fe
```

### Twilio
- **Console**: https://console.twilio.com
- **Numero**: +1 (839) 225 2468 (USA, NON pubblicizzato — solo per test)
- **Stato**: il numero è ora gestito da VAPI (VAPI ha sovrascritto il webhook voice). Il vecchio TwiML Bin "Ecosan_bot" è ancora salvato su Twilio ma non viene più chiamato.

### Railway
- **Dashboard**: https://railway.app
- **Progetto**: contiene il service `phone-ai-system`
- **Dominio pubblico**: `https://phone-ai-system-production.up.railway.app`
- **Endpoint webhook VAPI**: `https://phone-ai-system-production.up.railway.app/vapi/webhook`
- **Endpoint health**: `https://phone-ai-system-production.up.railway.app/vapi/health`
- **Deploy**: auto-deploy da GitHub (`carusfrancesco83-ui/phone-ai-system`, branch `main`)
- **Shared Variables**: vedi sezione variabili sotto

### ElevenLabs
- **Dashboard**: https://elevenlabs.io
- **Piano**: Free
- **Voce usata**: "Tiziana - smart, balanced and credible"
- **Voice ID**: `RXoaSpLaWTEckJgPUBG3`

### Airtable
- **Base ID**: `appZCHdwrFGX28L9X`
- **Tabella principale**: `Info_Requests` (ID: `tblGGr8aL3sT02YCF`)
  - **`Servizio` enum (NUOVO!)**: PULIZIA E SPURGO, VIDEOISPEZIONE, ANALISI DEI DATI, MAPPATURA DELLE RETI, RELINING TUBAZIONI, RIPRISTINO MANUFATTI, IMPERMEABILIZZAZIONE, PROVE DI TENUTA, ALTRO
  - **`Canale` enum**: WhatsApp, Email, Telefono, Web, Altro, Telegram
  - **`Stato` enum**: Nuovo, In lavorazione, Completato, Non qualificato
  - **`Stage` enum**: Lead, Contattato, Preventivo, Chiuso
- **Tabella log**: `Log_Chat` (ID: `tbleD1HKPfI4wCBOg`) — log messaggi WhatsApp/voice

### GitHub
- **Repo**: `carusfrancesco83-ui/phone-ai-system` (privata)
- **Branch**: `main`
- **Ultimo commit**: `b4a9f98` — `feat: add full service coverage for all Airtable Servizio options`

---

## 🔧 VARIABILI D'AMBIENTE (Railway Shared Variables)

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
TELEGRAM_CHAT_GENERALE=...    # NUOVO da commit fc6ea84 (catch-all)
TELEGRAM_CHAT_ESPURGO=...
# Gli altri TELEGRAM_CHAT_* sono opzionali; se mancanti il sistema usa _GENERALE
# TELEGRAM_CHAT_RELINING=...
# TELEGRAM_CHAT_VIDEOISPEZIONE=...
# TELEGRAM_CHAT_MONTAGGIO_AMEX=...
# TELEGRAM_CHAT_DA_DEFINIRE=...
# TELEGRAM_CHAT_PULIZIA_CISTERNE=...
# TELEGRAM_CHAT_MAPPATURA_RETI=...
# TELEGRAM_CHAT_ANALISI_DEI_DATI=...
# TELEGRAM_CHAT_RIPRISTINO_MANUFATTI=...
# TELEGRAM_CHAT_IMPERMEABILIZZAZIONE=...
# TELEGRAM_CHAT_PROVE_DI_TENUTA=...

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

### 9. Per aggiornare Allowed Values dello structured output `servizio` (Issue #1)
```bash
# GET schema corrente
curl -s -H "Authorization: Bearer $VAPI_PRIVATE_KEY" \
  "https://api.vapi.ai/structured-output/1db7a830-a152-45da-b392-c9c5d6d75223" \
  | python3 -m json.tool

# PATCH con i nuovi valori (esempio)
curl -s -X PATCH "https://api.vapi.ai/structured-output/1db7a830-a152-45da-b392-c9c5d6d75223" \
  -H "Authorization: Bearer $VAPI_PRIVATE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "schema": {
      "type": "string",
      "enum": [
        "Espurgo", "Relining", "Videoispezione", "Montaggio amex",
        "Pulizia cisterne", "Mappatura reti",
        "Analisi dei dati", "Ripristino manufatti",
        "Impermeabilizzazione", "Prove di tenuta",
        "Non classificato"
      ],
      "description": "Tipo di servizio richiesto. DEVE essere uno dei valori elencati."
    }
  }'
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

---

## 🗺️ PROSSIMI STEP (in ordine di priorità)

### Alta priorità (prima del go-live)
1. ✅ ~~Pipeline end-to-end funzionante~~
2. ✅ ~~Allineare SERVIZIO_MAP allo schema Airtable reale~~ (commit 763641b)
3. ✅ ~~Coverage completo dei servizi nel codice~~ (commit b4a9f98)
4. ⬜ **NUOVO** — Aggiornare prompt VAPI + structured output `servizio` per i 4 nuovi servizi (Issue #1)
5. ⬜ Rotare tutte le chiavi di sicurezza (vedi sezione Issue #5)
6. ⬜ Configurare VAPI_WEBHOOK_SECRET (auth del webhook)
7. ⬜ Cambiare display timezone Airtable a Europe/Rome
8. ⬜ Aggiungere `TELEGRAM_CHAT_GENERALE` su Railway se non c'è
9. ⬜ Testare qualche giorno con scenari diversi (urgenza, vecchietto confuso, richiesta strana)

### Media priorità (miglioramenti)
10. ⬜ Upgrade ElevenLabs a piano Starter/Creator per produzione
11. ⬜ Aggiungere TELEGRAM_CHAT_* per gli altri servizi
12. ⬜ Tuning del prompt (voce, latenza, tono) basato su feedback utente
13. ⬜ Numero italiano Twilio (+39) per produzione Ecosan reale
14. ⬜ Allineare README.md con il codice attuale
15. ⬜ Pulire `dataSaver.js` rimuovendo i campi obsoleti (`messaggiooriginale`, `user`, `canale: "Chiamata Vocale"`)

### Bassa priorità (nice to have)
16. ⬜ Aggiungere notifiche Gmail anche dal flusso VAPI (dataSaver.js già ha sendEmailNotifica, ma vapi.js non lo chiama)
17. ⬜ Rimuovere il codice legacy Twilio se non più necessario
18. ⬜ Valutare cambio modello GPT-4o → GPT-4o-mini o Gemini 2.5 Flash per costi

---

## 📝 ARCHITETTURA TECNICA (per chi continua il lavoro)

### Flusso VAPI (attivo, gestisce le chiamate)
```
Twilio → VAPI → GPT-4o + ElevenLabs + Deepgram
                     ↓ (end-of-call-report)
              POST /vapi/webhook (Railway)
                     ↓
              vapi.js → artifact.structuredOutputs
                     ↓ (normalizza servizio italiano, flatten keys)
              saveLead() → SERVIZIO_MAP italiano → enum Airtable UPPER
                     ↓
              Airtable POST + Log_Chat POST + Telegram notifica
```

### Mapping servizio attuale (ATTENZIONE: doppio passaggio)
```
VAPI estrae:        "Espurgo"           ↓
vapi.js normalizza: "Espurgo"           ↓ SERVIZIO_NORMALIZE
saveLead riceve:    "Espurgo"           ↓ SERVIZIO_MAP (in airtable.js)
Airtable riceve:    "PULIZIA E SPURGO"  ✅
```

C'è un doppio mapping perché:
1. `vapi.js` normalizza per accettare valori VAPI in più formati (italiano "Espurgo" o UPPER "ESPURGO" come fallback)
2. `airtable.js` trasforma il valore italiano normalizzato nel valore esatto del singleSelect Airtable (UPPER con spazi)

### vapi.js — struttura del payload VAPI ricevuto
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
    analysis: { ... }  // vecchio formato, fallback
  }
}
```

### airtable.js — SERVIZIO_MAP corrente (post commit `b4a9f98`)
```javascript
const SERVIZIO_MAP = {
  "Espurgo":              "PULIZIA E SPURGO",
  "Relining":             "RELINING TUBAZIONI",
  "Videoispezione":       "VIDEOISPEZIONE",
  "Montaggio amex":       "RELINING TUBAZIONI",  // mappato qui
  "Pulizia cisterne":     "PULIZIA E SPURGO",    // mappato qui
  "Mappatura reti":       "MAPPATURA DELLE RETI",
  "Analisi dei dati":     "ANALISI DEI DATI",
  "Ripristino manufatti": "RIPRISTINO MANUFATTI",
  "Impermeabilizzazione": "IMPERMEABILIZZAZIONE",
  "Prove di tenuta":      "PROVE DI TENUTA",
  "Non classificato":     "ALTRO",
};
```

---

## 🔐 NOTE DI SICUREZZA

1. **Il file `.env` NON deve mai essere committato su git** — è in `.gitignore`
2. **Il remote git contiene un GitHub PAT nell'URL** — da rimuovere con `git remote set-url origin https://github.com/carusfrancesco83-ui/phone-ai-system.git` e poi usare macOS Keychain per l'auth
3. **Tutte le chiavi sono state esposte** nel contesto della sessione Claude Code del 10/04/2026 — da rigenerare TUTTE (vedi sezione Issue)
4. **VAPI_WEBHOOK_SECRET** è attualmente vuoto su Railway — chiunque conosca l'URL del webhook può creare lead falsi. Da rimettere appena possibile.
5. **Il numero +1 (839) 225 2468 NON è pubblicizzato** — è un numero di test USA, nessun cliente reale lo conosce. Per la produzione serviranno numero italiano +39.

---

## 📋 CHANGELOG

### 27 Aprile 2026 (sessione Claude Sonnet 4.6)
- `763641b` — fix airtable: SERVIZIO_MAP allineato ai veri valori del singleSelect Airtable (PULIZIA E SPURGO, ecc.) + aggiunto campo `Data` esplicito
- `fc6ea84` — fix telegram: CHAT_ID_MAP completato + bot singolo + TELEGRAM_CHAT_GENERALE catch-all
- `b4a9f98` — feat: aggiunti 4 nuovi servizi (Analisi dei dati, Ripristino manufatti, Impermeabilizzazione, Prove di tenuta) in airtable.js, vapi.js, whatsapp.js

### 10 Aprile 2026 (sessione Claude Opus 4.6)
- `b841db7` — fix vapi: legge `artifact.structuredOutputs` invece di `analysis.structuredData`
- `76c46df` — debug vapi: logging verboso per diagnosi
- `ebc1149` — feat vapi: endpoint POST /vapi/webhook (versione iniziale)
- `5d16c4b` — docs: STATO_PROGETTO.md (questo file, prima versione)
- Configurazione iniziale assistente Ecosan, structured outputs (9 campi), endCallPhrases via API

### Prima del 10 Aprile 2026
- Workflow Airtable + Telegram + Gmail + WhatsApp + Twilio TwiML legacy (vedi git log per dettagli)
