#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import * as readline from "node:readline/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, ".env");
const EXAMPLE_PATH = path.join(__dirname, ".env.example");

function parseEnv(content) {
  const map = new Map();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    map.set(trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1));
  }
  return map;
}

function writeEnv(map) {
  // Scrive mantenendo la struttura e i commenti di .env.example
  const template = fs.existsSync(EXAMPLE_PATH) ? fs.readFileSync(EXAMPLE_PATH, "utf-8") : "";
  const templateKeys = new Set();
  const lines = template.split("\n").map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const eq = trimmed.indexOf("=");
    if (eq === -1) return line;
    const key = trimmed.slice(0, eq).trim();
    templateKeys.add(key);
    return map.has(key) ? `${key}=${map.get(key)}` : line;
  });
  const extra = [...map.entries()]
    .filter(([k]) => !templateKeys.has(k))
    .map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(ENV_PATH, lines.join("\n").trimEnd() + "\n" + (extra.length ? extra.join("\n") + "\n" : ""));
}

function mask(v) {
  if (!v) return "non impostato";
  if (v.length <= 8) return "****";
  return v.slice(0, 4) + "****" + v.slice(-4);
}

function randomHex32() {
  return crypto.randomBytes(32).toString("hex");
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const lines = rl[Symbol.asyncIterator]();

async function ask(label, current = "", { secret = false } = {}) {
  const hint = current ? ` [attuale: ${secret ? mask(current) : current}]` : "";
  process.stdout.write(`${label}${hint}: `);
  const { value, done } = await lines.next();
  const answer = (done ? "" : value).trim();
  return answer || current;
}

async function askYesNo(label, defaultYes = true) {
  process.stdout.write(`${label} [${defaultYes ? "S/n" : "s/N"}]: `);
  const { value, done } = await lines.next();
  const a = (done ? "" : value).trim().toLowerCase();
  if (!a) return defaultYes;
  return a === "s" || a === "si" || a === "y" || a === "yes";
}

async function askChoice(label, choices, current = "") {
  console.log(`\n${label}`);
  choices.forEach(([key, desc], i) => {
    const mark = key === current ? " ◀" : "";
    console.log(`  ${i + 1}) ${key}  — ${desc}${mark}`);
  });
  process.stdout.write(`Scelta [1-${choices.length}, invio per mantenere attuale]: `);
  const { value, done } = await lines.next();
  const n = parseInt((done ? "" : value).trim());
  if (!n || n < 1 || n > choices.length) return current || choices[0][0];
  return choices[n - 1][0];
}

async function googleOAuthFlow(clientId, clientSecret) {
  const REDIRECT_URI = "http://localhost:3002/oauth2callback";
  const SCOPES = [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/drive.readonly",
  ];
  const { google } = await import("googleapis");
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  const authUrl = oauth2Client.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: SCOPES });
  console.log("\nApri questo URL nel browser:\n");
  console.log(authUrl);
  console.log("\nIn attesa del callback su http://localhost:3002 ...\n");
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, "http://localhost:3002");
      if (url.pathname !== "/oauth2callback") return;
      const code = url.searchParams.get("code");
      if (!code) { res.writeHead(400); res.end("Errore: nessun codice."); server.close(); reject(new Error("Nessun codice OAuth")); return; }
      try {
        const { tokens } = await oauth2Client.getToken(code);
        res.end("<h2>Autenticazione completata. Puoi chiudere questa scheda.</h2>");
        server.close();
        if (!tokens.refresh_token) { reject(new Error("Nessun refresh_token. Rimuovi l'app da myaccount.google.com/permissions e riprova.")); return; }
        resolve(tokens.refresh_token);
      } catch (err) { res.writeHead(500); res.end("Errore: " + err.message); server.close(); reject(err); }
    });
    server.listen(3002, (err) => { if (err) reject(err); });
  });
}

// ─── main ──────────────────────────────────────────────────────────────────────

console.log("\n╔══════════════════════════════════╗");
console.log("║   Pi Agent — Configurazione      ║");
console.log("╚══════════════════════════════════╝\n");

const env = parseEnv(fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf-8") : "");

// ── 1. Provider e modello ──────────────────────────────────────────────────────
console.log("── Modello AI ──────────────────────────────────────────────\n");

const PROVIDERS = [
  ["anthropic", "Claude (Anthropic)"],
  ["openai",    "OpenAI / compatibile"],
];
const provider = await askChoice("Provider", PROVIDERS, env.get("PROVIDER") ?? "anthropic");
env.set("PROVIDER", provider);

const MODEL_SUGGESTIONS = {
  anthropic: "claude-haiku-4-5-20251001",
  openai: "gpt-4o-mini",
};
const model = await ask("Modello", env.get("MODEL") ?? MODEL_SUGGESTIONS[provider] ?? "");
env.set("MODEL", model);

const apiKey = await ask("API Key del provider", env.get("ANTHROPIC_API_KEY") ?? "", { secret: true });
env.set("ANTHROPIC_API_KEY", apiKey);

// ── 2. Ricerca web ─────────────────────────────────────────────────────────────
console.log("\n── Ricerca web ────────────────────────────────────────────\n");
console.log("  Serper.dev offre risultati Google. Senza chiave usa DuckDuckGo.");
const serperKey = await ask("SERPER_API_KEY (opzionale, invio per saltare)", env.get("SERPER_API_KEY") ?? "", { secret: true });
env.set("SERPER_API_KEY", serperKey);

// ── 3. Prompt di sistema ───────────────────────────────────────────────────────
console.log("\n── Prompt di sistema ──────────────────────────────────────\n");
const sysPrompt = await ask("SYSTEM_PROMPT", env.get("SYSTEM_PROMPT") ?? "Sei un assistente utile e conciso. Rispondi sempre in italiano.");
env.set("SYSTEM_PROMPT", sysPrompt);

// ── 4. LibreChat ───────────────────────────────────────────────────────────────
console.log("\n── LibreChat ──────────────────────────────────────────────\n");

const librechatPort = await ask("Porta LibreChat", env.get("LIBRECHAT_PORT") ?? "3080");
env.set("LIBRECHAT_PORT", librechatPort);

const allowReg = await askYesNo("Permettere la registrazione di nuovi utenti?", (env.get("ALLOW_REGISTRATION") ?? "true") === "true");
env.set("ALLOW_REGISTRATION", allowReg ? "true" : "false");

const allowReset = await askYesNo("Abilitare il recupero password via email?", (env.get("ALLOW_PASSWORD_RESET") ?? "true") === "true");
env.set("ALLOW_PASSWORD_RESET", allowReset ? "true" : "false");

// JWT: auto-genera se mancanti
if (!env.get("LIBRECHAT_JWT_SECRET") || env.get("LIBRECHAT_JWT_SECRET")?.startsWith("change-me")) {
  env.set("LIBRECHAT_JWT_SECRET", randomHex32());
  console.log("  JWT_SECRET generato automaticamente.");
}
if (!env.get("LIBRECHAT_JWT_REFRESH_SECRET") || env.get("LIBRECHAT_JWT_REFRESH_SECRET")?.startsWith("change-me")) {
  env.set("LIBRECHAT_JWT_REFRESH_SECRET", randomHex32());
  console.log("  JWT_REFRESH_SECRET generato automaticamente.");
}

// ── 5. Email SMTP ──────────────────────────────────────────────────────────────
console.log("\n── Email SMTP (per recupero password) ────────────────────\n");

const hasEmail = !!(env.get("EMAIL_USERNAME"));
const configEmail = await askYesNo("Configurare l'email SMTP?", hasEmail);
if (configEmail) {
  console.log("  Esempi: gmail → EMAIL_SERVICE=gmail | SMTP custom → EMAIL_HOST=smtp.example.com");
  const emailService = await ask("EMAIL_SERVICE (gmail, hotmail, yahoo — vuoto per SMTP custom)", env.get("EMAIL_SERVICE") ?? "");
  env.set("EMAIL_SERVICE", emailService);

  if (!emailService) {
    const emailHost = await ask("EMAIL_HOST", env.get("EMAIL_HOST") ?? "");
    env.set("EMAIL_HOST", emailHost);
    const emailPort = await ask("EMAIL_PORT", env.get("EMAIL_PORT") ?? "587");
    env.set("EMAIL_PORT", emailPort);
  } else {
    env.set("EMAIL_HOST", "");
    env.set("EMAIL_PORT", env.get("EMAIL_PORT") ?? "587");
  }

  const emailUser = await ask("EMAIL_USERNAME", env.get("EMAIL_USERNAME") ?? "");
  env.set("EMAIL_USERNAME", emailUser);
  const emailPass = await ask("EMAIL_PASSWORD", env.get("EMAIL_PASSWORD") ?? "", { secret: true });
  env.set("EMAIL_PASSWORD", emailPass);
  const emailFrom = await ask("EMAIL_FROM", env.get("EMAIL_FROM") ?? emailUser);
  env.set("EMAIL_FROM", emailFrom);
  const emailFromName = await ask("EMAIL_FROM_NAME", env.get("EMAIL_FROM_NAME") ?? "Pi Agent");
  env.set("EMAIL_FROM_NAME", emailFromName);
} else {
  console.log("  Email saltata — il recupero password non sarà disponibile.");
}

// ── 6. Ollama ──────────────────────────────────────────────────────────────────
console.log("\n── Ollama (modelli locali, opzionale) ────────────────────\n");

const hasOllama = await askYesNo("Hai Ollama installato sull'host?", !!(env.get("OLLAMA_HOST")));
if (hasOllama) {
  const ollamaHost = await ask(
    "OLLAMA_HOST (invio per default)",
    env.get("OLLAMA_HOST") || "http://host.docker.internal:11434"
  );
  env.set("OLLAMA_HOST", ollamaHost);
} else {
  env.set("OLLAMA_HOST", "");
}

// ── 7. Google Workspace ────────────────────────────────────────────────────────
const hasGoogleCreds = !!(env.get("GOOGLE_CLIENT_ID") || env.get("GOOGLE_CLIENT_SECRET"));
const configGoogle = await askYesNo("\nConfigurare Google Workspace (Gmail, Calendar, Drive)?", hasGoogleCreds);
if (configGoogle) {
  console.log("\n── Google Workspace ───────────────────────────────────────\n");
  const clientId = await ask("GOOGLE_CLIENT_ID", env.get("GOOGLE_CLIENT_ID") ?? "");
  env.set("GOOGLE_CLIENT_ID", clientId);
  const clientSecret = await ask("GOOGLE_CLIENT_SECRET", env.get("GOOGLE_CLIENT_SECRET") ?? "", { secret: true });
  env.set("GOOGLE_CLIENT_SECRET", clientSecret);

  if (clientId && clientSecret) {
    const doOAuth = await askYesNo("Avviare il flusso OAuth Google ora?");
    if (doOAuth) {
      try {
        const refreshToken = await googleOAuthFlow(clientId, clientSecret);
        env.set("GOOGLE_REFRESH_TOKEN", refreshToken);
        console.log("Google autenticato.\n");
      } catch (err) {
        console.error(`\nErrore OAuth: ${err.message}`);
        console.error("Puoi riprovare con: node setup.js\n");
      }
    }
  }
} else {
  if (!hasGoogleCreds) {
    env.set("GOOGLE_CLIENT_ID", "");
    env.set("GOOGLE_CLIENT_SECRET", "");
    env.set("GOOGLE_REFRESH_TOKEN", "");
  }
}

// ── Salva ──────────────────────────────────────────────────────────────────────
writeEnv(env);
rl.close();

console.log("\n✓ .env aggiornato.\n");
console.log("Prossimi passi:");
console.log("  npm run librechat   # avvia LibreChat + MongoDB via Docker");
console.log("  npm run server      # avvia il server Pi Agent");
console.log("  npm start           # REPL da terminale\n");
