# 📞 Phone AI System

Sistema di risposta automatica alle chiamate con AI, integrato con Airtable.

## Stack
- **Twilio** — riceve e gestisce le chiamate
- **OpenAI GPT-4o** — conversazione vocale intelligente
- **Airtable** — salvataggio dati strutturati
- **Node.js + Express** — server backend

---

## 🚀 Setup

### 1. Installa dipendenze
```bash
npm install
```

### 2. Configura le variabili d'ambiente
```bash
cp .env.example .env
# Modifica .env con le tue credenziali
```

### 3. Struttura Airtable
Crea una base Airtable con queste tabelle:

#### Tabella `Calls`
| Campo | Tipo |
|-------|------|
| PhoneNumber | Single line text |
| StartTime | Date & Time |
| EndTime | Date & Time |
| Duration | Number (secondi) |
| Status | Single select: `in-progress`, `completata`, `errore` |
| Type | Single select: `info`, `appointment`, `support`, `general` |
| Transcript | Long text |
| Summary | Long text |
| Contact | Link to Contacts |

#### Tabella `Contacts`
| Campo | Tipo |
|-------|------|
| PhoneNumber | Single line text |
| Name | Single line text |
| FirstContact | Date & Time |
| TotalCalls | Number |

#### Tabella `Appointments`
| Campo | Tipo |
|-------|------|
| CallId | Link to Calls |
| ContactId | Link to Contacts |
| Name | Single line text |
| Phone | Single line text |
| AppointmentDate | Date |
| AppointmentTime | Single line text |
| Service | Single line text |
| Notes | Long text |
| Status | Single select: `confermato`, `annullato`, `completato` |
| CreatedAt | Date & Time |

#### Tabella `Support_Tickets`
| Campo | Tipo |
|-------|------|
| CallId | Link to Calls |
| ContactId | Link to Contacts |
| Problem | Long text |
| Priority | Single select: `urgente`, `alta`, `media`, `bassa` |
| Status | Single select: `aperto`, `in-lavorazione`, `chiuso` |
| Notes | Long text |
| CreatedAt | Date & Time |

#### Tabella `Info_Requests`
| Campo | Tipo |
|-------|------|
| CallId | Link to Calls |
| ContactId | Link to Contacts |
| Topic | Single line text |
| Details | Long text |
| CreatedAt | Date & Time |

### 4. Configura Twilio
1. Acquista un numero Twilio
2. In **Phone Numbers → Configure**:
   - **Voice webhook (HTTP POST):** `https://TUO_DOMINIO/twilio/incoming`
   - **Status callback:** `https://TUO_DOMINIO/twilio/status`

### 5. Esponi il server pubblicamente

**Sviluppo locale con ngrok:**
```bash
ngrok http 3000
# Copia l'URL https://xxxx.ngrok.io nel .env come BASE_URL
```

**Produzione:**
Deploya su Railway, Render, o un VPS qualsiasi.

### 6. Avvia il server
```bash
# Sviluppo (con auto-restart)
npm run dev

# Produzione
npm start
```

---

## 🔄 Flusso di una chiamata

```
1. Chiamata in arrivo su numero Twilio
2. Twilio chiama POST /twilio/incoming
3. Viene creato un record su Airtable (Calls) con status "in-progress"
4. L'AI saluta il chiamante
5. Il chiamante parla → Twilio transcrive → POST /twilio/gather
6. L'AI risponde (GPT-4o) e continua la conversazione
7. Quando l'AI ha raccolto tutti i dati, inserisce il blocco [SALVA_DATI]
8. Il sistema salva:
   - Aggiorna Calls (trascrizione, summary, durata)
   - Trova/crea il Contatto
   - Salva Appuntamento / Ticket / Info_Request in base al tipo
9. La chiamata si conclude
```

---

## 🛠️ Personalizzazione

### Modificare il comportamento dell'AI
Modifica `prompts/systemPrompt.js` per:
- Cambiare il tono della voce
- Aggiungere informazioni sul tuo business
- Modificare le domande che fa l'AI
- Aggiungere nuovi tipi di chiamate

### Aggiungere nuovi tipi di dati
1. Aggiungi il tipo in `prompts/systemPrompt.js`
2. Crea la funzione in `services/airtable.js`
3. Aggiungi il caso in `services/dataSaver.js`

### Cambiare la voce
Nel file `routes/twilio.js`, cambia il parametro `voice`:
- `Polly.Bianca` — italiano femminile
- `Polly.Giorgio` — italiano maschile
- `Polly.Carla` — italiano femminile alternativo

---

## 📊 Monitoraggio

Tutti i log sono in console. Per produzione, aggiungi:
- **Sentry** per error tracking
- **Winston** per log strutturati
- **PM2** per process management

---

## 🔑 Dove trovare le credenziali

| Credenziale | Dove trovarla |
|-------------|---------------|
| `TWILIO_ACCOUNT_SID` | [console.twilio.com](https://console.twilio.com) → Dashboard |
| `TWILIO_AUTH_TOKEN` | [console.twilio.com](https://console.twilio.com) → Dashboard |
| `TWILIO_PHONE_NUMBER` | [console.twilio.com](https://console.twilio.com) → Phone Numbers |
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com/api-keys) |
| `AIRTABLE_API_KEY` | [airtable.com/create/tokens](https://airtable.com/create/tokens) |
| `AIRTABLE_BASE_ID` | URL della tua base: `airtable.com/appXXXXXX/...` |
