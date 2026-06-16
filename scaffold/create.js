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
const anthropicKey = await ask("ANTHROPIC_API_KEY (opzionale, invio per saltare)", "");
const serperKey = await ask("SERPER_API_KEY per ricerca web (opzionale, invio per saltare)", "");

const includeGoogle = await askYesNo("Includere i tool Google Workspace (Gmail/Calendar/Drive)?", false);
let googleClientId = "";
let googleClientSecret = "";
if (includeGoogle) {
  googleClientId = await ask("GOOGLE_CLIENT_ID (opzionale, invio per saltare)", "");
  googleClientSecret = await ask("GOOGLE_CLIENT_SECRET (opzionale, invio per saltare)", "");
}

const includeLibreChat = await askYesNo("Includere lo scaffold LibreChat + Docker?", true);

rl.close();

fs.mkdirSync(dest, { recursive: true });

function copyFile(name) {
  fs.copyFileSync(path.join(SOURCE_DIR, name), path.join(dest, name));
}

// --- File sempre copiati ---
copyFile("agent.js");
copyFile("server.js");
copyFile(".gitignore");

// --- tools.js, adattato in base ai tool Google ---
let toolsContent = fs.readFileSync(path.join(SOURCE_DIR, "tools.js"), "utf-8");
if (!includeGoogle) {
  toolsContent = toolsContent
    .replace(/^import \{ googleTools \} from "\.\/tools-google\.js";\n/m, "")
    .replace(
      /export const tools = \[getTimeTool, calculateTool, fetchUrlTool, searchWebTool, \.\.\.googleTools\];/,
      "export const tools = [getTimeTool, calculateTool, fetchUrlTool, searchWebTool];"
    );
}
fs.writeFileSync(path.join(dest, "tools.js"), toolsContent);

// --- Tool Google (opzionali) ---
if (includeGoogle) {
  copyFile("tools-google.js");
  copyFile("google-auth.js");
  copyFile("setup-google-auth.js");
}

// --- LibreChat + Docker (opzionali) ---
if (includeLibreChat) {
  copyFile("librechat.yaml");

  let composeContent = fs.readFileSync(path.join(SOURCE_DIR, "docker-compose.yml"), "utf-8");
  const jwtSecret = crypto.randomBytes(32).toString("hex");
  const jwtRefreshSecret = crypto.randomBytes(32).toString("hex");
  composeContent = composeContent
    .replace(/JWT_SECRET=.*/, `JWT_SECRET=${jwtSecret}`)
    .replace(/JWT_REFRESH_SECRET=.*/, `JWT_REFRESH_SECRET=${jwtRefreshSecret}`);
  fs.writeFileSync(path.join(dest, "docker-compose.yml"), composeContent);
}

// --- package.json ---
const dependencies = {
  "@earendil-works/pi-agent-core": "^0.79.1",
  "dotenv": "^17.4.2",
};
if (includeGoogle) dependencies.googleapis = "^173.0.0";

const packageJson = {
  name: projectSlug,
  version: "1.0.0",
  type: "module",
  scripts: { start: "node agent.js", server: "node server.js" },
  dependencies,
};
fs.writeFileSync(path.join(dest, "package.json"), JSON.stringify(packageJson, null, 2) + "\n");

// --- .env ---
const envLines = [
  `PROVIDER=${provider}`,
  `MODEL=${model}`,
  `ANTHROPIC_API_KEY=${anthropicKey}`,
  `SERPER_API_KEY=${serperKey}`,
  `PORT=3001`,
  `SYSTEM_PROMPT=Sei un assistente utile e conciso. Rispondi sempre in italiano.`,
];
if (includeGoogle) {
  envLines.push(`GOOGLE_CLIENT_ID=${googleClientId}`, `GOOGLE_CLIENT_SECRET=${googleClientSecret}`, `GOOGLE_REFRESH_TOKEN=`);
}
fs.writeFileSync(path.join(dest, ".env"), envLines.join("\n") + "\n");

console.log(`\nProgetto creato in: ${dest}`);
console.log("Eseguo npm install...\n");

const install = spawnSync("npm", ["install"], { cwd: dest, stdio: "inherit" });
if (install.status !== 0) {
  console.error("\nnpm install ha fallito. Esegui manualmente nella cartella del progetto.");
  process.exit(install.status ?? 1);
}

console.log(`\nFatto! Prossimi passi:\n`);
console.log(`  cd ${dest}`);
if (!anthropicKey) console.log(`  # imposta ANTHROPIC_API_KEY in .env`);
console.log(`  npm start          # REPL da terminale`);
console.log(`  npm run server     # API stile OpenAI su porta 3001`);
if (includeGoogle) console.log(`  node setup-google-auth.js   # autenticazione Google Workspace`);
if (includeLibreChat) console.log(`  docker compose up -d        # avvia LibreChat + MongoDB`);
