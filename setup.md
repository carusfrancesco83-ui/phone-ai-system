# SETUP.md — Guida alla Replicazione del Sistema Phone AI

Questa guida spiega come duplicare e configurare il sistema di assistente telefonico AI per un nuovo cliente.

---

## Architettura del sistema

```
Chiamata in entrata (Twilio)
        ↓
   Server Express (Railway)
        ↓
   OpenAI GPT-4o  ←→  systemPrompt.js (identità del business)
        ↓
   Airtable (salvataggio lead)
        ↓
   Telegram Bot (notifica al responsabile)
```

---

## 1. Prerequisiti (account necessari)

| Servizio   | Uso                                      | Costo indicativo         |
|------------|------------------------------------------|--------------------------|
| Twilio     | Numero telefonico + Speech-to-Text       | ~1 €/mese + consumo      |
| OpenAI     | GPT-4o per la conversazione AI           | Pay-per-use              |
| Airtable   | Database lead (CRM leggero)              | Gratuito fino a 1000 rec |
| Telegram   | Notifiche al responsabile                | Gratuito                 |
| Railway    | Hosting del server Node.js               | ~5 €/mese                |
| GitHub     | Deploy automatico su Railway             | Gratuito                 |

---

## 2. File da personalizzare per il nuovo cliente

### 2.1 `systemPrompt.js` — Identità e flusso della chiamata

Questo è il file più importante. Modifica:

- **`BUSINESS_NAME`** → viene letto da env, non toccare il codice
- **Servizi offerti** (riga `- **servizio**`): sostituisci le opzioni con quelle del nuovo cliente
- **Dati da raccogliere**: aggiungi o rimuovi campi in base alle esigenze
- **Formato `[SALVA_DATI]`**: aggiorna le chiavi JSON perché corrispondano ai campi Airtable

Esempio: se il cliente è un idraulico, i servizi potrebbero essere:
```
PERDITA_ACQUA | CALDAIA | SCARICO | INSTALLAZIONE | DA_DEFINIRE
```

### 2.2 `whatsapp.js` — Notifiche Telegram

Aggiorna `CHAT_ID_MAP` con i servizi del nuovo cliente (devono corrispondere esattamente ai valori nel systemPrompt):

```javascript
const CHAT_ID_MAP = {
  PERDITA_ACQUA: process.env.TELEGRAM_CHAT_PERDITA_ACQUA,
  CALDAIA:       process.env.TELEGRAM_CHAT_CALDAIA,
  // ...
  DA_DEFINIRE:   process.env.TELEGRAM_CHAT_DA_DEFINIRE,
};
```

### 2.3 `airtable.js` — Campi del database

Verifica che i campi salvati corrispondano alle colonne della base Airtable del cliente.

---

## 3. Configurazione Twilio

1. Acquista un numero italiano su [twilio.com/console](https://console.twilio.com)
2. Vai su **Phone Numbers → Manage → Active Numbers → [numero]**
3. Nella sezione **Voice & Fax**, imposta:
   - **A call comes in**: Webhook
   - **URL**: `https://[tuo-dominio-railway]/twilio/incoming`
   - **Method**: HTTP POST

---

## 4. Creazione Bot Telegram

1. Apri Telegram e cerca `@BotFather`
2. Invia `/newbot` e segui le istruzioni
3. Copia il **token** (formato: `123456789:ABCdef...`)
4. Avvia una chat con il bot oppure aggiungilo al gruppo desiderato
5. Per ottenere il **chat_id**:
   ```
   https://api.telegram.org/bot[TOKEN]/getUpdates
   ```
   Invia un messaggio al bot, poi cerca `"chat":{"id": NUMERO}` nella risposta
   > ⚠️ Usa il valore di `chat.id`, NON quello di `update_id`

---

## 5. Configurazione Airtable

1. Crea una nuova base su [airtable.com](https://airtable.com)
2. Crea una tabella chiamata **Leads** con queste colonne:

| Nome colonna       | Tipo         |
|--------------------|--------------|
| nome               | Testo        |
| telefono           | Testo        |
| email              | Testo        |
| indirizzo          | Testo        |
| città              | Testo        |
| servizio           | Testo        |
| problema           | Testo lungo  |
| source             | Testo        |
| messaggiooriginale | Testo lungo  |
| canale             | Testo        |
| user               | Testo        |
| chatid             | Testo        |

3. Ottieni il **Base ID**: visibile nell'URL della base (`appXXXXXXXXXXXXXX`)
4. Genera un **Personal Access Token** su [airtable.com/create/tokens](https://airtable.com/create/tokens) con scope `data.records:write`

---

## 6. Variabili d'ambiente (Railway)

Vai su Railway → Progetto → Variables e aggiungi:

```env
# Business
BUSINESS_NAME=Nome Azienda Cliente
BUSINESS_LANGUAGE=italiano

# Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+39xxxxxxxxxx

# OpenAI
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Airtable
AIRTABLE_API_KEY=patXXXXXXXXXXXXXX
AIRTABLE_BASE_ID=appXXXXXXXXXXXXXX
AIRTABLE_TABLE_NAME=Leads

# Telegram (un chat ID per ogni servizio)
TELEGRAM_BOT_TOKEN=123456789:ABCdef...
TELEGRAM_CHAT_DA_DEFINIRE=262161386
TELEGRAM_CHAT_[SERVIZIO1]=xxxxxxxxxxxx
TELEGRAM_CHAT_[SERVIZIO2]=xxxxxxxxxxxx

# URL pubblico del server (Railway lo fornisce)
BASE_URL=https://[tuo-progetto].up.railway.app
```

---

## 7. Deploy su Railway

1. Crea un nuovo progetto su [railway.app](https://railway.app)
2. Collega il repository GitHub del progetto
3. Railway fa il deploy automatico a ogni push su `main`
4. Verifica che il dominio Railway sia configurato in `BASE_URL`
5. Testa con: `https://[dominio]/health` → deve restituire `{"status":"ok"}`

---

## 8. Test end-to-end

1. **Test Telegram**: `GET /test-telegram` → verifica che arrivi il messaggio sul telefono
2. **Test Airtable**: `GET /debug/airtable` → verifica accesso alla base
3. **Chiama il numero Twilio** e parla con l'AI
4. Verifica che il lead appaia in Airtable e arrivi la notifica Telegram

---

## 9. Checklist finale

- [ ] Numero Twilio acquistato e webhook configurato
- [ ] Bot Telegram creato e chat_id ottenuto (valore di `chat.id`, non `update_id`)
- [ ] Base Airtable creata con tutte le colonne
- [ ] Tutte le variabili d'ambiente aggiunte su Railway
- [ ] `systemPrompt.js` aggiornato con nome azienda e servizi
- [ ] `whatsapp.js` aggiornato con i servizi del cliente
- [ ] Deploy su Railway completato
- [ ] Test end-to-end superato

---

## Note

- Il saluto cambia automaticamente in base all'orario italiano (Buongiorno / Buon pomeriggio / Buona sera)
- Se un responsabile non vuole ricevere notifiche per un certo servizio, lascia vuota la variabile env corrispondente — il sistema usa `DA_DEFINIRE` come fallback
- Per aggiungere campi extra al lead: modifica `systemPrompt.js` (dati da raccogliere + blocco `[SALVA_DATI]`), `dataSaver.js` e la tabella Airtable
- Il campo `messaggiooriginale` contiene solo le parole del chiamante, non le risposte dell'AI
