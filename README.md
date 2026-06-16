# pi-agent scaffold

Generatore interattivo di progetti **pi-agent** — un agente AI con tool use, REPL da terminale e server compatibile OpenAI.

## Prerequisiti

- **Node.js 22.19+** — [nodejs.org](https://nodejs.org)
- **API key** del provider AI (Anthropic, OpenAI-compatibile)
- **Docker Desktop** (solo per LibreChat) — [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop)
  - macOS: in alternativa a Docker Desktop puoi usare [Colima](https://github.com/abiosoft/colima) (`brew install colima && colima start`)
  - Docker Desktop deve essere **avviato** prima di eseguire `npm run librechat`


## Uso consigliato per il team

Per un membro del team che clona il repository:

```bash
cp .env.example .env
npm install
npm run setup
npm run doctor
npm start
```

Per usare la UI LibreChat in locale:

```bash
npm run librechat
npm run server
```

Per avviare tutto in Docker:

```bash
npm run deploy
```

Altri comandi utili:

```bash
npm run deploy:logs
npm run deploy:down
npm run update
```

Vedi anche [`DEPLOY.md`](./DEPLOY.md).

## Utilizzo rapido

```bash
node scaffold/create.js
```

Oppure installato globalmente:

```bash
npm install -g .
create-pi-agent
```

Lo scaffold pone alcune domande interattive sulla struttura del progetto, esegue `npm install` e lancia automaticamente `node setup.js` per configurare le API key.

---

## Cosa genera lo scaffold

| File | Descrizione |
|------|-------------|
| `agent.js` | REPL da terminale |
| `server.js` | API server compatibile OpenAI (porta 3001) |
| `tools.js` | Tool base (ora, calcolo, fetch URL, ricerca web) |
| `tools-google.js` | Tool Google Workspace (opzionale) |
| `google-auth.js` | Helper autenticazione OAuth Google (opzionale) |
| `setup-google-auth.js` | Script setup OAuth Google (opzionale) |
| `librechat.yaml` | Config LibreChat per sviluppo (opzionale) |
| `librechat.deploy.yaml` | Config LibreChat per deploy containerizzato (opzionale) |
| `docker-compose.yml` | LibreChat + MongoDB, dev mode (opzionale) |
| `docker-compose.deploy.yml` | Override compose per deploy completo (opzionale) |
| `Dockerfile` | Immagine pi-agent per deploy (opzionale) |
| `.env` | Variabili d'ambiente (non committare) |
| `package.json` | Dipendenze npm |
| `README.md` | Quickstart del progetto generato |

---

## Avvio del progetto generato

### REPL da terminale

```bash
npm start
```

### API server (compatibile OpenAI)

```bash
npm run server
# → http://localhost:3001/v1
```

Endpoint esposti:

| Metodo | Path | Descrizione |
|--------|------|-------------|
| `GET` | `/v1/models` | Lista modelli disponibili |
| `POST` | `/v1/chat/completions` | Completamento chat (streaming SSE o JSON) |

Il server è compatibile con qualsiasi client OpenAI (LibreChat, Open WebUI, curl, ecc.).

---

## Variabili d'ambiente

Configurate tramite `npm run setup` oppure manualmente nel file `.env`:

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `PROVIDER` | `anthropic` | Provider AI |
| `MODEL` | `claude-haiku-4-5-20251001` | ID modello |
| `ANTHROPIC_API_KEY` | — | API key Anthropic |
| `SERPER_API_KEY` | — | API key Serper per ricerca web (opzionale) |
| `PORT` | `3001` | Porta del server |
| `SYSTEM_PROMPT` | `Sei un assistente...` | Prompt di sistema dell'agente |
| `LIBRECHAT_PORT` | `3080` | Porta interfaccia web LibreChat |
| `ALLOW_REGISTRATION` | `true` | Permette la registrazione di nuovi utenti |
| `ALLOW_PASSWORD_RESET` | `true` | Abilita il recupero password via email |
| `LIBRECHAT_JWT_SECRET` | auto | Generato automaticamente da `setup.js` |
| `LIBRECHAT_JWT_REFRESH_SECRET` | auto | Generato automaticamente da `setup.js` |
| `OLLAMA_HOST` | — | URL Ollama sull'host (default: `host.docker.internal:11434`) |
| `EMAIL_SERVICE` | — | Provider email noto (`gmail`, `hotmail`, ecc.) |
| `EMAIL_HOST` | — | Host SMTP custom (alternativo a `EMAIL_SERVICE`) |
| `EMAIL_PORT` | `587` | Porta SMTP |
| `EMAIL_USERNAME` | — | Username SMTP |
| `EMAIL_PASSWORD` | — | Password SMTP o App Password |
| `EMAIL_FROM` | — | Indirizzo mittente email |
| `GOOGLE_CLIENT_ID` | — | OAuth Google (se attivato) |
| `GOOGLE_CLIENT_SECRET` | — | OAuth Google (se attivato) |
| `GOOGLE_REFRESH_TOKEN` | — | Generato da `setup.js` |

> Se `SERPER_API_KEY` non è impostata, la ricerca web usa DuckDuckGo come fallback (nessuna registrazione richiesta, risultati più limitati).

---

## Tool inclusi

### Tool base

| Tool | Descrizione |
|------|-------------|
| `get_current_time` | Data e ora corrente (fuso Europe/Rome) |
| `calculate` | Valutazione espressioni matematiche |
| `fetch_url` | Lettura contenuto di una pagina web (stripping HTML, max 8000 char) |
| `search_web` | Ricerca web (Serper API o DuckDuckGo fallback) |

### Tool Google Workspace (opzionali)

| Tool | Descrizione |
|------|-------------|
| `gmail_search` | Ricerca email con sintassi Gmail (`from:`, `is:unread`, ecc.) |
| `gmail_read` | Lettura corpo completo di una email per ID |
| `gmail_send` | Invio email (l'agente chiede conferma prima di inviare) |
| `calendar_list_events` | Lista eventi Google Calendar nei prossimi N giorni |
| `calendar_create_event` | Creazione evento (l'agente chiede conferma) |
| `drive_list_files` | Lista file Drive con sintassi di ricerca Drive |
| `drive_read_file` | Lettura contenuto di un file Drive (Docs, Sheets, testo) |

---

## Setup wizard

`npm run setup` guida la configurazione interattiva di tutto lo stack:

1. **Provider e modello** — scelta guidata (Anthropic, OpenAI-compatibile)
2. **API key** del provider
3. **Ricerca web** — Serper opzionale, fallback DuckDuckGo
4. **System prompt** dell'agente
5. **LibreChat** — porta, registrazione, recupero password, JWT auto-generati
6. **Email SMTP** — Gmail (App Password) o SMTP custom
7. **Ollama** — rilevamento automatico su `host.docker.internal:11434`
8. **Google Workspace** — flusso OAuth completo

Il wizard preserva i valori già configurati e mostra sempre il valore attuale mascherato per i campi segreti.

---

## Setup Google Workspace

1. Crea un progetto su [Google Cloud Console](https://console.cloud.google.com/)
2. Abilita le API: **Gmail API**, **Google Calendar API**, **Google Drive API**
3. Vai su _Credenziali_ → _Crea credenziali_ → **ID client OAuth 2.0** → Tipo: **App desktop**
4. Esegui il setup (chiede Client ID, Client Secret e avvia il flusso OAuth):

```bash
node setup.js
```

Lo script avvia un server locale sulla porta 3002, apre l'URL OAuth e scrive il `GOOGLE_REFRESH_TOKEN` direttamente nel `.env`. Per rinnovare solo il token in futuro:

```bash
node setup-google-auth.js
```

---

## LibreChat

LibreChat fornisce un'interfaccia web chat che si connette a `server.js` tramite l'API compatibile OpenAI.

### Funzionalità incluse

- **Recupero password** via email SMTP (Gmail, Outlook, provider custom)
- **Modelli locali Ollama** — se Ollama è in esecuzione sull'host, compare automaticamente come endpoint
- **Persistenza** — chat, utenti e file caricati sopravvivono ai riavvii Docker grazie ai volumi named
- **Registrazione utenti** configurabile (`ALLOW_REGISTRATION`)

### Sviluppo locale (raccomandato)

In questa modalità LibreChat gira in Docker, `server.js` gira sull'host:

```bash
# Terminale 1: avvia LibreChat + MongoDB
npm run librechat

# Terminale 2: avvia pi-agent
npm run server

# Apri l'interfaccia web
open http://localhost:3080
```

LibreChat raggiunge `server.js` tramite `host.docker.internal:3001` (configurato in `librechat.yaml`).

> **macOS con Colima**: `npm run librechat` rileva automaticamente il socket Colima. Se usi Docker Desktop non è necessaria nessuna configurazione aggiuntiva.

### Deploy containerizzato (Raspberry Pi / server remoto)

In questa modalità tutto il stack gira in Docker — nessun Node.js richiesto sull'host:

```bash
docker compose -f docker-compose.yml -f docker-compose.deploy.yml up -d --build
```

`docker-compose.deploy.yml` aggiunge il servizio `pi-agent` e cambia il mount di `librechat.yaml` con `librechat.deploy.yaml`, che punta a `http://pi-agent:3001/v1` (rete interna Docker).

Per fermare tutto:

```bash
docker compose -f docker-compose.yml -f docker-compose.deploy.yml down
```

#### Architettura deploy

```
┌─────────────────────────────────────────────┐
│  Docker network                             │
│                                             │
│  ┌──────────────┐    ┌───────────────────┐  │
│  │  LibreChat   │───▶│   pi-agent        │  │
│  │  :3080       │    │   :3001           │  │
│  └──────────────┘    └───────────────────┘  │
│         │                    │              │
│  ┌──────────────┐            │ .env         │
│  │  MongoDB     │            │              │
│  └──────────────┘            │              │
└─────────────────────────────────────────────┘
         ↑ :3080 esposta all'host
```

---

## Aggiungere tool personalizzati

Definisci il tool in `tools.js` (o in un file separato):

```js
import { Type } from "@earendil-works/pi-ai";

export const myTool = {
  name: "my_tool",
  label: "My Tool",
  description: "Descrizione precisa — usata dall'LLM per decidere quando invocare il tool.",
  parameters: Type.Object({
    input: Type.String({ description: "L'input da elaborare" }),
  }),
  execute: async (_id, { input }) => {
    const result = await doSomething(input);
    return {
      content: [{ type: "text", text: result }],
    };
  },
};
```

Aggiungilo all'array `tools` esportato in `tools.js`:

```js
export const tools = [getTimeTool, calculateTool, fetchUrlTool, searchWebTool, myTool];
```

Il campo `description` è la parte più importante: deve spiegare all'LLM **quando e perché** invocare il tool.

---

## Struttura del progetto generato

```
my-pi-agent/
├── agent.js                    # REPL da terminale
├── server.js                   # API server compatibile OpenAI
├── tools.js                    # Definizioni tool
├── tools-google.js             # Tool Google Workspace (se abilitato)
├── google-auth.js              # OAuth helper (se abilitato)
├── setup-google-auth.js        # Setup OAuth (se abilitato)
├── librechat.yaml              # Config LibreChat dev (se abilitato)
├── librechat.deploy.yaml       # Config LibreChat deploy (se abilitato)
├── docker-compose.yml          # Dev: LibreChat + MongoDB (se abilitato)
├── docker-compose.deploy.yml   # Deploy: + pi-agent containerizzato (se abilitato)
├── Dockerfile                  # Immagine pi-agent (se abilitato)
├── .env                        # Variabili d'ambiente (non committare)
├── .gitignore
└── package.json
```

---

## Dipendenze

| Pacchetto | Descrizione |
|-----------|-------------|
| `@earendil-works/pi-agent-core` | Core agent con tool use e gestione conversazione |
| `@earendil-works/pi-ai` | Wrapper provider AI e definizioni tipo (`Type`) |
| `dotenv` | Caricamento `.env` |
| `googleapis` | SDK Google Workspace (se attivato) |
