# CRM Integration Log — Switch da Airtable diretto a CRM Ecosan webhook

> Lavoro fatto da Claude Code (PC Desktop) il 2026-05-28.
> Questo file serve a chi riapre il progetto su un altro PC per avere tutto il contesto.

---

## 🎯 Obiettivo

I lead delle chiamate vocali oggi finiscono direttamente su Airtable. Vogliamo che vadano al **CRM Ecosan** (NestJS Postgres), che è la single source of truth dal 26/05/2026 e ha un outbox che mirror automaticamente i lead su Airtable. Risultato: niente più doppio scrittore.

```
PRIMA:                              DOPO:
  Bot vocale                          Bot vocale
      ↓                                   ↓
   Airtable                             CRM Ecosan (postgres)
                                          ↓ (outbox automatico)
                                       Airtable
```

---

## ✅ Cosa è stato fatto

### Codice (commit `2d41008` su branch `main`)

**`crm.js`** (NEW) — modulo che invia lead al CRM via webhook autenticato:
- Endpoint: `POST {CRM_WEBHOOK_URL}/api/v1/webhooks/voice-bot/leads`
- Auth header: `x-api-key: {CRM_VOICE_BOT_SECRET}`
- Idempotency header: `x-event-id: {callSid}` (no duplicati su replay VAPI)
- Mappa i campi del bot al DTO CRM `VoiceBotLeadDto`:
  - `nome + cognome` → `callerName` (concatenati)
  - `telefono` → `callerPhone`
  - `email` → `callerEmail`
  - `città` → `callerCity`
  - `cap` → `callerCap`
  - `indirizzo` → `callerAddress`
  - `azienda` → `callerCompany`
  - `servizio` → `detectedService`
  - `problema + noteInterne` → `problem` (concatenati)
  - `transcript` → `transcript`
  - `chatid` (callSid) → `callId` + header `x-event-id`
- Ritorna `leadId` (string) come faceva `airtable.saveLead()`

**`dataSaver.js`** (MODIFIED) — solo cambio import + payload:
```js
// VECCHIO:
const { saveLead } = require("./airtable");

// NUOVO:
const { saveLead } = require("./crm");
```
- Aggiunto `azienda` e `transcript` al payload
- `airtable.js` LASCIATO INVARIATO (rollback safety: basta cambiare import in dataSaver)

**`README.md`** (MODIFIED) — sezione "Switch da Airtable a CRM Ecosan" + nuove env vars in tabella credenziali

### Env vars configurate su Railway "phone-ai-system"
- `CRM_WEBHOOK_URL` = `https://crm-dashboard-production-5149.up.railway.app`
- `CRM_VOICE_BOT_SECRET` = valore condiviso con il CRM (stesso valore di `VOICE_BOT_WEBHOOK_SECRET` lato CRM)

### Backend CRM Ecosan (gia esistente, NON modificato)
Endpoint pronto e operativo: `apps/api/src/inbound-leads/voice-bot.controller.ts`
- Auth via `VOICE_BOT_WEBHOOK_SECRET` env
- Idempotency su `x-event-id` (callId VAPI)
- Crea Lead + Activity CALL + Timeline entry
- Outbox automatico → Airtable mirror

---

## 🧪 Test eseguiti

### 1. Connettività CRM (PASSED ✅)
```bash
curl -X POST https://crm-dashboard-production-5149.up.railway.app/api/v1/webhooks/voice-bot/leads \
  -H "Content-Type: application/json" \
  -H "x-api-key: [secret]" \
  -d '{"callerPhone":"+393333333333","callerName":"TEST CLAUDE - cancellare","source":"connectivity_test","callId":"test-connectivity-X"}'
# → 200 OK
# → {"leadId":"27c1564e-28d3-4677-8c38-4a93e08ee67f","wasExisting":false,...}
```
**Risultato**: lead creato correttamente sul CRM. Da eliminare manualmente: lead `27c1564e-28d3-4677-8c38-4a93e08ee67f`.

### 2. Health Bot dopo deploy (PASSED ✅)
```bash
curl https://phone-ai-system-production.up.railway.app
# → 200 OK {"status":"ok","service":"Phone AI System","timestamp":"..."}
```

### 3. Webhook Twilio simulato (PASSED ✅)
```bash
curl -X POST https://phone-ai-system-production.up.railway.app/twilio/incoming \
  -d "CallSid=CA_test&From=%2B393333333333&CallStatus=ringing"
# → 200 OK in 1.2s
# → TwiML valido: <Response><Play>...</Play><Gather .../></Response>
```

---

## ✅ PROBLEMA RISOLTO 2026-05-31

Il "squilla a vuoto" del 2026-05-28 NON era Twilio: era l'incident infrastrutturale VAPI documentato in `VAPI.md`. Risolto da VAPI entro il 2026-05-31. Webhook Twilio del +39 verificato live alle 08:10Z: punta a `api.vapi.ai/twilio/inbound_call`, chiamate funzionano, disclosure AI attiva. Le sezioni qui sotto sono conservate come storico della diagnosi (in parte fuorviante: indicava Twilio come causa probabile, ma la vera causa era VAPI).

## 📜 Storico — diagnosi 2026-05-28 (problema chiamate reali squillano a vuoto)

**Sintomo**: l'utente chiama il numero Twilio del bot, ma il numero **squilla a vuoto** senza che l'AI risponda.

**Cosa NON è il problema**:
- ❌ Bot non avviato → bot è UP e risponde a `/health` e `/twilio/incoming`
- ❌ Webhook `/twilio/incoming` rotto → risponde 200 + TwiML valido in 1.2s
- ❌ Env vars CRM mancanti → bot ha CRM_WEBHOOK_URL + CRM_VOICE_BOT_SECRET configurati
- ❌ CRM down → CRM risponde 200 OK al test diretto

**Cosa È PROBABILMENTE il problema**:
La configurazione del **numero Twilio** non punta più al webhook del bot. Possibili cause:
1. **Webhook URL su Twilio Console è vuoto / scaduto / sbagliato**
2. **Numero Twilio sospeso** (problemi account/credito)
3. **Stale config** dopo cambio Railway URL del bot in passato

### 🎯 Cosa Claude Code deve verificare/risolvere

**1. Twilio Console: voice configuration del numero**
- Vai su [console.twilio.com](https://console.twilio.com) → Phone Numbers → Active Numbers → click sul numero in uso
- Sezione "Voice Configuration"
- **A call comes in** deve essere:
  - Type: `Webhook`
  - URL: `https://phone-ai-system-production.up.railway.app/twilio/incoming`
  - Method: `HTTP POST`
- Se diverso/vuoto → configurarlo + Save

**2. Verifica chiamate in Twilio logs**
- Console Twilio → Monitor → Logs → Calls
- Ultima chiamata: status (`failed`/`no-answer`/`canceled`/`completed`), error code

**3. Se Twilio dice "destination URL unreachable"**
- Verificare che Railway phone-ai-system sia stabile (non in restart loop)
- Verificare che l'URL del webhook sia esattamente quello sopra (no typo, no trailing slash)

**4. Test rapido alternativo (TwiML Bin)**
Per isolare il problema, su Twilio Console crea un **TwiML Bin** statico:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="it-IT">Test funzionante</Say>
</Response>
```
Configura il numero per usare quel TwiML Bin invece del webhook bot.
- Se chiamando il numero ora dice "Test funzionante" → il numero Twilio funziona, problema solo sul webhook → riportare webhook al bot
- Se NON dice nulla → problema lato Twilio/Carrier (numero/conto)

---

## 📋 File chiave del progetto

| File | Cosa fa |
|------|---------|
| `server.js` | Express bootstrap + endpoints `/twilio/*`, `/vapi/*`, `/debug/*` |
| `twilio.js` | TwiML handler (incoming, gather, no-input, status) |
| `vapi.js` | VAPI integration (se usato come provider alternativo) |
| `openai.js` | GPT-4o conversation + summary |
| `elevenlabs.js` | TTS per la voce dell'AI |
| `audioCache.js` | Cache temporanea audio MP3 (TTL 2min) |
| `dataSaver.js` | ✏️ MODIFICATO — orchestratore salvataggio lead post-chiamata |
| `crm.js` | ✨ NEW — invio lead al CRM Ecosan via webhook |
| `airtable.js` | LEGACY — invio diretto Airtable (rollback safety) |
| `whatsapp.js` | Notifica Telegram al responsabile reparto |
| `gmail.js` | Notifica email |
| `systemPrompt.js` | Prompt sistema per OpenAI (identità + flow chiamata) |

---

## 🔑 Env vars complete del progetto (Railway)

| Var | Uso |
|-----|-----|
| `TWILIO_ACCOUNT_SID` | Twilio API |
| `TWILIO_AUTH_TOKEN` | Twilio API |
| `TWILIO_PHONE_NUMBER` | Numero attivo |
| `OPENAI_API_KEY` | GPT-4o |
| `ELEVENLABS_API_KEY` | TTS |
| `VAPI_PRIVATE_KEY` | VAPI (se usato) |
| `AIRTABLE_API_KEY` | LEGACY (debug endpoint `/debug/airtable` lo usa ancora) |
| `AIRTABLE_BASE_ID` | LEGACY |
| `TELEGRAM_BOT_TOKEN` | Notifiche reparto |
| `TELEGRAM_CHAT_ID` | ID chat default |
| `GMAIL_APP_PASSWORD` | Email notifiche |
| `RESEND_API_KEY` | Email transactional |
| **`CRM_WEBHOOK_URL`** | ✨ NEW — `https://crm-dashboard-production-5149.up.railway.app` |
| **`CRM_VOICE_BOT_SECRET`** | ✨ NEW — shared secret con CRM (env `VOICE_BOT_WEBHOOK_SECRET` lato CRM) |
| `BUSINESS_NAME` | Nome azienda (per prompt) |
| `BASE_URL` | URL pubblico bot (per audio + webhook self-reference) |
| `PORT` | Auto-set da Railway |

---

## 🔄 Rollback rapido (se serve)

Se la nuova pipeline CRM ha problemi e serve tornare ad Airtable diretto:

1. In `dataSaver.js` riga 9:
   ```js
   // Cambiare:
   const { saveLead } = require("./crm");
   // In:
   const { saveLead } = require("./airtable");
   ```
2. Commit + push
3. Railway ridepoya il bot
4. Lead tornano a finire direttamente su Airtable (vecchio comportamento)

Il modulo `airtable.js` è invariato proprio per questo motivo.

---

## 📌 To-do post-fix

Quando il problema "squilla a vuoto" sarà risolto e tutto funziona end-to-end:

- [ ] Cancellare lead test dal CRM: `leadId = 27c1564e-28d3-4677-8c38-4a93e08ee67f`
- [ ] **Ruotare il `VOICE_BOT_WEBHOOK_SECRET`**: il secret è stato condiviso in chat per debug. Generare nuovo secret, aggiornare env var su CRM (Railway "crm dashboard") + bot (Railway "phone-ai-system"). Tutti e due devono avere lo stesso valore.
- [ ] Verificare che dopo una chiamata vera:
  - Lead appare sul CRM in `/leads`
  - Lead appare ANCHE su Airtable (via outbox mirror automatico)
  - Activity "Chiamata Voice Bot" presente sul lead
  - Timeline entry "CONTACT_ATTEMPTED" presente
- [ ] (Opzionale) Disabilitare/rimuovere endpoint `/debug/airtable` da `server.js` se non più usato
- [ ] (Opzionale) Rimuovere `airtable.js` e dipendenza `airtable` da `package.json` quando si è sicuri al 100% che la pipeline CRM funziona

---

## 🌐 URL utili

- **Bot health**: https://phone-ai-system-production.up.railway.app
- **Bot debug Telegram**: https://phone-ai-system-production.up.railway.app/debug/telegram
- **Bot debug Airtable**: https://phone-ai-system-production.up.railway.app/debug/airtable
- **CRM backend**: https://crm-dashboard-production-5149.up.railway.app
- **CRM frontend**: https://fsv.informaticoimprovvisato.com
- **CRM webhook endpoint**: https://crm-dashboard-production-5149.up.railway.app/api/v1/webhooks/voice-bot/leads

---

**Data ultimo aggiornamento**: 2026-05-28
**Branch**: `main`
**Ultimo commit**: `2d41008` (feat(crm): switch da Airtable diretto a CRM Ecosan webhook)
