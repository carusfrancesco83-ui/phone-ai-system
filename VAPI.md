# VAPI — Stato + Procedura ripristino

> Data: 2026-05-28
> Stato attuale: **VAPI piattaforma DEGRADED da 5h+** (https://status.vapi.ai)
> Workaround attivo: bypass VAPI sul numero IT — chiamate gestite dal bot direct

---

## 🚨 Situazione

VAPI sta avendo problemi multipli alla piattaforma:
- Dashboard utente: errore `"No organizations found. Please contact support@vapi.ai for help."`
- Chiamate live: non rispondono (status Twilio = `no-answer`)
- API parzialmente funzionante (lettura assistants/numeri ok da cache, write/call falliscono)

Status page VAPI mostra:
- "Degraded for 5 hours and 29 minutes" (incident in corso)
- "Degraded for 8 hours and 17 minutes" (recente)
- "Down for 4 hours and 37 minutes" (database outage recente)

**Non è colpa del nostro codice o account.** È un incident lato VAPI.

---

## ✅ Bypass attivo (cosa ho fatto il 28/05)

### Webhook Twilio cambiato
Numero **+39 800 940 397** (IT, "Ecosan AI Toll-Free IT"):

| Voce | PRIMA | DOPO |
|------|-------|------|
| `voice_url` | `https://api.vapi.ai/twilio/inbound_call` | `https://phone-ai-system-production.up.railway.app/twilio/incoming` |
| `voice_method` | POST | POST |
| `status_callback` | (non set) | `https://phone-ai-system-production.up.railway.app/twilio/status` |

### Cosa fa il bot direct ora
- Riceve chiamata via webhook `/twilio/incoming`
- Genera saluto via ElevenLabs (TTS)
- Conversa con utente via OpenAI gpt-4o (file `openai.js`)
- Estrae dati strutturati (`[SALVA_DATI]` JSON nel transcript)
- A fine chiamata: `dataSaver.saveCallData()` → `crm.saveLead()` → CRM Ecosan
- CRM mirror su Airtable via outbox automatico

### Limitazioni del bypass
- **Prompt usato**: `systemPrompt.js` del bot, NON il prompt configurato su VAPI dashboard
- **Voce**: configurata in `elevenlabs.js` (non la voce VAPI `RXoaSpLaWTEckJgPUBG3`)
- **Latenza**: leggermente più alta del VAPI streaming (batch TTS)
- **Numero US +1 839 225 2468**: **NON bypassato**, continua a puntare a VAPI → squilla a vuoto finché VAPI non torna su

---

## 🔄 Procedura: tornare a VAPI quando risolve

Quando VAPI ripristina la piattaforma e la dashboard funziona di nuovo:

### Step 1 — Verifica VAPI funziona
1. Login su https://dashboard.vapi.ai (no più "No organizations found")
2. Cerca **assistant "Ecosan"** (id: `67dde60b-06ad-4c18-8b69-664204bec7f2`) → deve esserci
3. Cerca numero **+39 800 940 397** → in VAPI deve avere `assistantId` = Ecosan
4. Saldo VAPI > 0

### Step 2 — Ripristina webhook Twilio del numero IT
Da terminale (con auth Twilio): UN comando solo.

```bash
SID="AC<...redatto, vedi env TWILIO_ACCOUNT_SID...>"
TOKEN="<TWILIO_AUTH_TOKEN>"
PHONE_SID="PN387389a6d52888639a9d72518e175f1d"  # +39800940397

curl -X POST -u "$SID:$TOKEN" \
  "https://api.twilio.com/2010-04-01/Accounts/$SID/IncomingPhoneNumbers/$PHONE_SID.json" \
  --data-urlencode "VoiceUrl=https://api.vapi.ai/twilio/inbound_call" \
  --data-urlencode "VoiceMethod=POST"
```

OPPURE: dimmi su Claude Code "ripristina webhook VAPI" e lo faccio io con un comando.

### Step 3 — Test
1. Chiama +39 800 940 397
2. Aspetta 2-3 sec → risponde Ecosan VAPI con il SUO prompt e la SUA voce
3. Termina chiamata
4. Verifica VAPI dashboard: nuova chiamata listata con `endedReason` valido

---

## 🛠️ Files modificati durante il bypass

### Repo `phone-ai-system` (commit `7b62a75` + precedenti)
- `crm.js` (NEW) — modulo invio lead al CRM via webhook
- `dataSaver.js` — usa `./crm` invece di `./airtable`
- `server.js` — aggiunti endpoint debug:
  - `GET /debug/twilio` — lista numeri Twilio + voice config
  - `GET /debug/twilio-calls` — ultime chiamate Twilio
  - `GET /debug/twilio-creds` — verifica env vars Twilio
  - `GET /debug/vapi` — lista assistants/numeri VAPI + recent calls
  - `GET /debug/vapi-assign?phoneId=X&assistantId=Y` — assegna assistant a numero VAPI
- `airtable.js` — INVARIATO (rollback safety)
- `vapi.js` — INVARIATO (ancora usa `./airtable`, da migrare a `./crm` se vuoi unificare)
- `README.md` — sezione "Switch da Airtable a CRM Ecosan"
- `CRM_INTEGRATION_LOG.md` (NEW) — log dettagliato integrazione CRM

### Env vars Railway `phone-ai-system`
```
CRM_WEBHOOK_URL=https://crm-dashboard-production-5149.up.railway.app
CRM_VOICE_BOT_SECRET=<shared secret with CRM>
```

### Repo `crm-dashboard` (commit `684b38a`)
- `apps/api/src/leads/leads.service.ts` — fix `findOrCreateLead`: enqueue Airtable mirror per lead nuovi (prima i lead da inbound webhook NON arrivavano mai su Airtable)

---

## 🔍 Diagnostica VAPI (se serve in futuro)

### Endpoint debug bot per VAPI
```
GET https://phone-ai-system-production.up.railway.app/debug/vapi
```

Ritorna JSON con:
- Assistants attivi (id, nome, modello, voce)
- Phones registrati (id, numero, provider, assistantId associato)
- Ultime 5 chiamate VAPI (status, endedReason, durata)

### API VAPI manuale
```bash
curl -H "Authorization: Bearer $VAPI_PRIVATE_KEY" \
  https://api.vapi.ai/phone-number  # lista numeri
```

### Patch assistant a un numero VAPI
```bash
curl -X PATCH \
  -H "Authorization: Bearer $VAPI_PRIVATE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"assistantId":"<ASSISTANT_ID>"}' \
  https://api.vapi.ai/phone-number/<PHONE_ID>
```

### Identifiers chiave
| Risorsa | ID |
|---------|----|
| Assistant Ecosan | `67dde60b-06ad-4c18-8b69-664204bec7f2` |
| Assistant Riley | `0127c3e3-cb0d-4546-b1e6-9f19cfe8fc8d` |
| Phone +39 800 940 397 (IT) | `dac9e456-42fa-4bad-b84f-8ee2b5c1f48a` |
| Phone +1 839 225 2468 (US) | `9909b309-9ca1-4152-9935-5e571e4351fd` |
| Twilio Account SID | `AC<...redatto, vedi env TWILIO_ACCOUNT_SID...>` |
| Twilio PN SID +39 | `PN387389a6d52888639a9d72518e175f1d` |
| Twilio PN SID +1 | `PN19cf24bddc46a26d811a5474eca8851c` |

---

## 💡 Idea futura: auto-fallback VAPI → bot direct

Visto che VAPI ha avuto **3+ incident degraded nelle ultime 24h**, conviene implementare uno switch automatico quando VAPI è down:

### Approccio 1: health check periodico
- Cron sul bot (`@Cron("*/2 * * * *")`) ogni 2 min:
  1. GET `https://status.vapi.ai/api/v2/status.json` → se `degraded`/`down`:
     - PATCH Twilio numero IT → webhook bot direct
  2. Se VAPI torna `operational`:
     - PATCH Twilio numero IT → webhook VAPI

### Approccio 2: TwiML fallback nativo Twilio
Twilio supporta `VoiceFallbackUrl`:
- Primary: `https://api.vapi.ai/twilio/inbound_call`
- Fallback: `https://phone-ai-system-production.up.railway.app/twilio/incoming` (chiamato se primary risponde con 5xx o timeout)

Più semplice ma richiede che VAPI risponda con errore HTTP (non `no-answer` puro). Verificare comportamento.

Implementiamo quando VAPI è di nuovo stabile e si decide se mantenerlo.

---

## 🧹 Cleanup post-VAPI

Quando VAPI è di nuovo OK e tutto è stato verificato:

- [ ] Rimuovere endpoint debug `/debug/vapi*` e `/debug/twilio*` da `server.js` (sono pubblici)
- [ ] Ruotare `CRM_VOICE_BOT_SECRET` (è stato condiviso in chat per debug)
- [ ] Cancellare lead test dal CRM (`leadId = 27c1564e-28d3-4677-8c38-4a93e08ee67f` se ancora presente)
- [ ] Decidere se migrare `vapi.js` a `./crm` (così anche lead VAPI passano dal CRM invece di andare diretti ad Airtable)

---

## 📊 Storico commit di oggi (28/05/2026)

### Repo phone-ai-system (branch main)
```
0ed9b05  debug: add /debug/twilio-creds (no sensitive data)
34a66cd  debug: add /debug/vapi (lista assistants/numeri/calls VAPI)
7b62a75  debug: add /debug/vapi-assign endpoint per assegnare assistantId a phone
f97e9be  debug: add /debug/twilio + /debug/twilio-calls endpoints
70b3bd2  docs: log integrazione CRM + problema aperto twilio webhook
2d41008  feat(crm): switch da Airtable diretto a CRM Ecosan webhook
```

### Repo crm-dashboard (branch master)
```
684b38a  fix(leads): findOrCreateLead enqueue Airtable mirror per lead nuovi
```

### Modifica configurazione runtime (Twilio API)
- Webhook +39 800 940 397: `api.vapi.ai/twilio/inbound_call` → `phone-ai-system-production.up.railway.app/twilio/incoming`

---

**Per riprendere**: dimmi "leggi VAPI.md e ripristina VAPI" quando la piattaforma è di nuovo operational.
