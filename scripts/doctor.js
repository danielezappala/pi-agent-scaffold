#!/usr/bin/env node
import fs from "node:fs";
import net from "node:net";
import { spawnSync } from "node:child_process";

const MIN_NODE_MAJOR = 22;
const MIN_NODE_MINOR = 19;
const REQUIRED_ENV = ["PROVIDER", "MODEL", "PORT"];
const PROVIDER_KEYS = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
};

function ok(message) { console.log(`OK  ${message}`); }
function warn(message) { console.log(`WARN ${message}`); }
function fail(message) { console.log(`FAIL ${message}`); failures++; }

let failures = 0;

function parseEnv(path = ".env") {
  if (!fs.existsSync(path)) return null;
  const env = new Map();
  for (const line of fs.readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env.set(trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1).trim());
  }
  return env;
}

function checkCommand(cmd, args = ["--version"]) {
  const result = spawnSync(cmd, args, { encoding: "utf8" });
  return result.status === 0;
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });
}

console.log("=== pi-agent doctor ===\n");

const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);
if (nodeMajor > MIN_NODE_MAJOR || (nodeMajor === MIN_NODE_MAJOR && nodeMinor >= MIN_NODE_MINOR)) ok(`Node.js ${process.versions.node}`);
else fail(`Node.js ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}+ richiesto, trovato ${process.versions.node}`);

if (fs.existsSync("package.json")) ok("package.json presente");
else fail("package.json non trovato");

if (fs.existsSync("node_modules")) ok("node_modules presente");
else warn("node_modules assente: esegui npm install");

const env = parseEnv();
if (!env) {
  fail(".env non trovato: copia .env.example in .env oppure esegui npm run setup");
} else {
  ok(".env presente");
  for (const key of REQUIRED_ENV) {
    if (env.get(key)) ok(`${key} configurato`);
    else fail(`${key} mancante in .env`);
  }

  const provider = env.get("PROVIDER") || "anthropic";
  const keyName = PROVIDER_KEYS[provider.toLowerCase()] || `${provider.toUpperCase()}_API_KEY`;
  if (env.get(keyName)) ok(`${keyName} configurata`);
  else warn(`${keyName} non impostata: l'agente non potra chiamare il provider ${provider}`);

  const port = Number(env.get("PORT") || 3001);
  if (Number.isInteger(port) && port > 0) {
    const free = await isPortFree(port);
    if (free) ok(`porta ${port} libera`);
    else warn(`porta ${port} gia in uso`);
  } else {
    fail(`PORT non valida: ${env.get("PORT")}`);
  }

  if (env.has("GOOGLE_CLIENT_ID") || fs.existsSync("tools-google.js")) {
    if (env.get("GOOGLE_CLIENT_ID") && env.get("GOOGLE_CLIENT_SECRET") && env.get("GOOGLE_REFRESH_TOKEN")) {
      ok("Google Workspace OAuth configurato");
    } else {
      warn("Google Workspace non completamente configurato: esegui npm run setup");
    }
  }
}

if (fs.existsSync("docker-compose.yml")) {
  if (checkCommand("docker", ["--version"])) ok("Docker disponibile");
  else warn("Docker non disponibile: serve solo per LibreChat/deploy containerizzato");
} else {
  warn("docker-compose.yml non presente: LibreChat/deploy containerizzato non incluso");
}

console.log("");
if (failures > 0) {
  console.log(`Esito: ${failures} errore/i da correggere.`);
  process.exit(1);
}
console.log("Esito: controlli completati.");
