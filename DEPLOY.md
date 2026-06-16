# Avvio e deploy leggero per il team

Questo progetto non richiede un deploy di produzione. L'obiettivo e avere un ambiente locale riproducibile per membri del team.

## Flusso consigliato

```bash
cp .env.example .env
npm install
npm run setup
npm run doctor
npm start
```

## Modalita disponibili

### 1. REPL locale

```bash
npm start
```

Usa `agent.js` da terminale. E la modalita piu semplice per sviluppare tool e prompt.

### 2. API compatibile OpenAI

```bash
npm run server
```

Espone il server su:

```text
http://localhost:3001/v1
```

Endpoint principali:

```text
GET  /v1/models
POST /v1/chat/completions
```

### 3. LibreChat locale

In un terminale:

```bash
npm run librechat
```

In un secondo terminale:

```bash
npm run server
```

Apri:

```text
http://localhost:3080
```

Questa modalita avvia solo LibreChat e MongoDB in Docker. `pi-agent` gira sull'host con Node.js.

### 4. Stack containerizzato

```bash
npm run deploy
```

Avvia in Docker:

- MongoDB
- LibreChat
- pi-agent

Comandi utili:

```bash
npm run deploy:logs
npm run deploy:down
npm run update
```

## Controllo ambiente

```bash
npm run doctor
```

Verifica Node.js, `.env`, API key, porta del server, Docker e configurazione Google Workspace se presente.

## File sensibili

Non committare mai `.env`.

Usa `.env.example` come modello e lascia che ogni membro del team configuri le proprie chiavi.

## Aggiornamenti

Se il progetto e clonato da Git:

```bash
npm run update
```

Lo script esegue:

1. `git pull --ff-only`, se il repository Git e presente.
2. `npm install`.
3. `npm run doctor`.
4. rebuild/restart dello stack Docker, se usato.
