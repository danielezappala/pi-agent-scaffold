#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import * as readline from "node:readline/promises";

const SCAFFOLD_DIR = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = path.dirname(SCAFFOLD_DIR);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
// rl.question() drops buffered lines that arrive in the same chunk (e.g. piped input);
// pulling from the async iterator queues them instead, so it works both interactively and piped.
const lines = rl[Symbol.asyncIterator]();

function expandHome(p) {
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
}

function slugify(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "pi-agent";
}

async function ask(question, defaultValue = "") {
  const suffix = defaultValue ? ` (${defaultValue})` : "";
  process.stdout.write(`${question}${suffix}: `);
  const { value, done } = await lines.next();
  const answer = done ? "" : value.trim();
  return answer || defaultValue;
}

async function askYesNo(question, defaultYes = true) {
  const hint = defaultYes ? "S/n" : "s/N";
  process.stdout.write(`${question} [${hint}]: `);
  const { value, done } = await lines.next();
  const answer = (done ? "" : value.trim()).toLowerCase();
  if (!answer) return defaultYes;
  return answer === "s" || answer === "si" || answer === "y" || answer === "yes";
}

console.log("=== Pi Agent Scaffold ===\n");

const projectName = await ask("Nome progetto", "my-pi-agent");
const projectSlug = slugify(projectName);

const defaultDest = path.join(os.homedir(), "Documents", "OpenSourcePlatform", projectSlug);
const destRaw = await ask("Cartella destinazione", defaultDest);
const dest = path.resolve(expandHome(destRaw));

if (fs.existsSync(dest) && fs.readdirSync(dest).length > 0) {
  console.error(`\nErrore: la cartella "${dest}" esiste già e non è vuota.`);
  rl.close();
  process.exit(1);
}

const provider = await ask("Provider AI", "anthropic");
const model = await ask("Modello", "claude-haiku-4-5-20251001");
const includeGoogle = await askYesNo("Includere i tool Google Workspace (Gmail/Calendar/Drive)?", false);
const includeLibreChat = await askYesNo("Includere lo scaffold LibreChat + Docker?", true);
const includeOllama = includeLibreChat && await askYesNo("Includere supporto Ollama (modelli locali)?", true);

rl.close();

fs.mkdirSync(dest, { recursive: true });

function copyFile(name) {
  fs.copyFileSync(path.join(SOURCE_DIR, name), path.join(dest, name));
}

function copyDir(name, filter = () => true) {
  const src = path.join(SOURCE_DIR, name);
  const dst = path.join(dest, name);
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (!filter(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    if (entry.isDirectory()) fs.cpSync(from, to, { recursive: true });
    else fs.copyFileSync(from, to);
  }
}

// --- File sempre copiati ---
copyFile("agent.js");
copyFile("server.js");
copyFile("model-config.js");
copyFile("tool-setup.js");
copyFile(".gitignore");
copyFile(".env.example");
copyDir("scripts", (name) => name === "doctor.js");

// --- Tool e setup integration ---
copyFile("tools.js");
copyFile("tools-google.js");
copyFile("google-auth.js");
copyFile("setup-google-auth.js");

// --- setup.js (sempre incluso) ---
copyFile("setup.js");

// --- LibreChat + Docker (opzionali) ---
if (includeLibreChat) {
  copyFile("librechat.deploy.yaml");
  copyFile("docker-compose.deploy.yml");
  copyFile("Dockerfile");
  copyFile("DEPLOY.md");
  copyDir("scripts", (name) => name !== "doctor.js");

  // librechat.yaml — generato dinamicamente
  const ollamaEndpoint = includeOllama ? `
    - name: "Ollama"
      apiKey: "ollama"
      baseURL: "http://host.docker.internal:11434/v1"
      models:
        default: ["qwen2.5-coder:latest", "deepseek-coder-v2:lite"]
        fetch: true
      titleConvo: true
      titleModel: "current_model"
      modelDisplayLabel: "Ollama"
      dropParams: ["user"]` : "";

  fs.writeFileSync(path.join(dest, "librechat.yaml"), `version: 1.3.5
cache: true
endpoints:
  custom:
    - name: "Pi Agent"
      apiKey: "none"
      baseURL: "http://host.docker.internal:3001/v1"
      models:
        default: ["pi-agent"]
        fetch: false
      titleConvo: true
      titleModel: "pi-agent"
      modelDisplayLabel: "Pi Agent"
      dropParams: ["user", "frequency_penalty", "presence_penalty"]${ollamaEndpoint}
`);

  // docker-compose.yml — generato dinamicamente
  const ollamaEnv = includeOllama ? `\n      - OLLAMA_HOST=\${OLLAMA_HOST:-}` : "";
  fs.writeFileSync(path.join(dest, "docker-compose.yml"), `services:
  mongodb:
    image: mongo:7
    restart: unless-stopped
    volumes:
      - mongodb-data:/data/db

  librechat:
    image: ghcr.io/danny-avila/librechat:latest
    restart: unless-stopped
    ports:
      - "\${LIBRECHAT_PORT:-3080}:3080"
    extra_hosts:
      - "host.docker.internal:host-gateway"
    depends_on:
      - mongodb
    environment:
      - MONGO_URI=mongodb://mongodb:27017/LibreChat
      - ALLOW_REGISTRATION=\${ALLOW_REGISTRATION:-true}
      - ALLOW_PASSWORD_RESET=\${ALLOW_PASSWORD_RESET:-true}
      - DOMAIN_CLIENT=\${DOMAIN_CLIENT:-http://localhost:3080}
      - DOMAIN_SERVER=\${DOMAIN_SERVER:-http://localhost:3080}
      - NO_INDEX=true
      - JWT_SECRET=\${LIBRECHAT_JWT_SECRET}
      - JWT_REFRESH_SECRET=\${LIBRECHAT_JWT_REFRESH_SECRET}
      - EMAIL_SERVICE=\${EMAIL_SERVICE:-}
      - EMAIL_HOST=\${EMAIL_HOST:-}
      - EMAIL_PORT=\${EMAIL_PORT:-587}
      - EMAIL_ENCRYPTION=\${EMAIL_ENCRYPTION:-starttls}
      - EMAIL_USERNAME=\${EMAIL_USERNAME:-}
      - EMAIL_PASSWORD=\${EMAIL_PASSWORD:-}
      - EMAIL_FROM=\${EMAIL_FROM:-}
      - EMAIL_FROM_NAME=\${EMAIL_FROM_NAME:-Pi Agent}${ollamaEnv}
    volumes:
      - ./librechat.yaml:/app/librechat.yaml:ro
      - librechat-uploads:/app/uploads
      - librechat-logs:/app/logs

volumes:
  mongodb-data:
  librechat-uploads:
  librechat-logs:
`);
}

// --- package.json ---
const dependencies = {
  "@earendil-works/pi-agent-core": "^0.79.1",
  "@earendil-works/pi-ai": "^0.79.1",
  "dotenv": "^17.4.2",
  "googleapis": "^173.0.0",
};

const scripts = {
  start: "node agent.js",
  server: "node server.js",
  setup: "node setup.js",
  doctor: "node scripts/doctor.js",
};
if (includeLibreChat) {
  Object.assign(scripts, {
    librechat: "sh scripts/librechat.sh",
    "librechat:down": "docker compose down",
    deploy: "sh scripts/deploy.sh",
    "deploy:down": "sh scripts/down.sh",
    "deploy:logs": "sh scripts/logs.sh",
    update: "sh scripts/update.sh",
  });
}

const packageJson = {
  name: projectSlug,
  version: "1.0.0",
  type: "module",
  scripts,
  dependencies,
};
fs.writeFileSync(path.join(dest, "package.json"), JSON.stringify(packageJson, null, 2) + "\n");

// --- .env derivato dal template aggiornato ---
const envExamplePath = path.join(dest, ".env.example");
let envContent = fs.readFileSync(envExamplePath, "utf-8");
envContent = envContent.replace(/^PROVIDER=.*$/m, `PROVIDER=${provider}`);
envContent = envContent.replace(/^MODEL=.*$/m, `MODEL=${model}`);
if (!includeOllama) {
  envContent = envContent.replace(/^OLLAMA_HOST=.*$/m, "OLLAMA_HOST=");
}
if (includeLibreChat) {
  envContent = envContent
    .replace(/^LIBRECHAT_JWT_SECRET=.*$/m, `LIBRECHAT_JWT_SECRET=${crypto.randomBytes(32).toString("hex")}`)
    .replace(/^LIBRECHAT_JWT_REFRESH_SECRET=.*$/m, `LIBRECHAT_JWT_REFRESH_SECRET=${crypto.randomBytes(32).toString("hex")}`);
}
if (!includeGoogle) {
  envContent = envContent
    .replace(/^GOOGLE_CLIENT_ID=.*$/m, "GOOGLE_CLIENT_ID=")
    .replace(/^GOOGLE_CLIENT_SECRET=.*$/m, "GOOGLE_CLIENT_SECRET=")
    .replace(/^GOOGLE_REFRESH_TOKEN=.*$/m, "GOOGLE_REFRESH_TOKEN=");
}

fs.writeFileSync(path.join(dest, ".env"), envContent);

// --- README.md ---
const commandsTable = [
  "| Comando | Descrizione |",
  "|---------|-------------|",
  "| `npm start` | REPL da terminale |",
  "| `npm run server` | API server compatibile OpenAI su porta 3001 |",
  "| `npm run setup` | Configura o aggiorna il file .env |",
  "| `npm run doctor` | Controlla ambiente e configurazione |",
  ...(includeLibreChat ? [
    "| `npm run librechat` | Avvia LibreChat + MongoDB in background |",
    "| `npm run deploy` | Avvia stack completo containerizzato |",
    "| `npm run deploy:logs` | Mostra i log dello stack containerizzato |",
    "| `npm run deploy:down` | Ferma lo stack containerizzato |",
  ] : []),
].join("\n");

const googleSection = includeGoogle ? `
## Google Workspace

Per configurare o rinnovare l'accesso OAuth:

\`\`\`bash
npm run setup
\`\`\`
` : "";

const librechatSection = includeLibreChat ? `
## LibreChat

\`\`\`bash
npm run librechat   # avvia LibreChat + MongoDB
npm run server      # avvia il server Pi Agent
open http://localhost:3080
\`\`\`

Funzionalità incluse:
- Recupero password via email SMTP (configura le variabili \`EMAIL_*\` nel \`.env\` con \`npm run setup\`)
${includeOllama ? "- Modelli locali Ollama — avvia Ollama sull'host, comparirà automaticamente come endpoint\n" : ""}- Persistenza chat e utenti tramite volumi Docker

Vedi \`DEPLOY.md\` per il deploy containerizzato completo.
` : "";

const readme = `# ${projectName}

## Setup

\`\`\`bash
npm install
npm run setup      # wizard interattivo: API key, email, Ollama, OAuth Google
npm run doctor     # controlla ambiente e configurazione
npm start          # oppure: npm run server
\`\`\`

## Comandi

${commandsTable}
${librechatSection}${googleSection}
## Aggiungere tool

Definisci un tool in \`tools.js\` e aggiungilo all'array \`tools\` esportato.
Ogni tool richiede: \`name\`, \`label\`, \`description\`, \`parameters\`, \`execute\`.
`;
fs.writeFileSync(path.join(dest, "README.md"), readme);

console.log(`\nProgetto creato in: ${dest}`);
console.log("Eseguo npm install...\n");

const install = spawnSync("npm", ["install"], { cwd: dest, stdio: "inherit" });
if (install.status !== 0) {
  console.error("\nnpm install ha fallito. Esegui manualmente nella cartella del progetto.");
  process.exit(install.status ?? 1);
}

console.log(`\nProgetto pronto. Avvio configurazione...\n`);
console.log("─".repeat(40));

const setup = spawnSync("node", ["setup.js"], { cwd: dest, stdio: "inherit" });
if (setup.status !== 0) {
  console.error("\nsetup.js ha fallito. Rieseguilo manualmente con:");
  console.error(`  cd ${dest} && node setup.js`);
}
