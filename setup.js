#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import * as readline from "node:readline/promises";

const ENV_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), ".env");

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
  fs.writeFileSync(ENV_PATH, [...map.entries()].map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
}

function mask(v) {
  if (!v) return "non impostato";
  if (v.length <= 8) return "****";
  return v.slice(0, 4) + "****" + v.slice(-4);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const lines = rl[Symbol.asyncIterator]();

async function ask(label, current = "") {
  const hint = current ? ` [attuale: ${mask(current)}]` : "";
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

  console.log("\nApri questo URL nel browser per autorizzare l'accesso:\n");
  console.log(authUrl);
  console.log("\nIn attesa del callback su http://localhost:3002 ...\n");

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, "http://localhost:3002");
      if (url.pathname !== "/oauth2callback") return;

      const code = url.searchParams.get("code");
      if (!code) {
        res.writeHead(400);
        res.end("Errore: nessun codice ricevuto.");
        server.close();
        reject(new Error("Nessun codice OAuth nel callback"));
        return;
      }

      try {
        const { tokens } = await oauth2Client.getToken(code);
        res.end("<h2>Autenticazione completata. Puoi chiudere questa scheda.</h2>");
        server.close();

        if (!tokens.refresh_token) {
          reject(new Error(
            "Nessun refresh_token ricevuto.\n" +
            "Rimuovi l'accesso dell'app da https://myaccount.google.com/permissions e riprova."
          ));
          return;
        }

        resolve(tokens.refresh_token);
      } catch (err) {
        res.writeHead(500);
        res.end("Errore: " + err.message);
        server.close();
        reject(err);
      }
    });

    server.listen(3002, (err) => {
      if (err) reject(err);
    });
  });
}

// ─── main ──────────────────────────────────────────────────────────────────────

console.log("=== Configurazione .env ===\n");

const env = parseEnv(fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf-8") : "");

// --- API key provider ---
const apiKey = await ask("ANTHROPIC_API_KEY", env.get("ANTHROPIC_API_KEY") ?? "");
env.set("ANTHROPIC_API_KEY", apiKey);

// --- Serper ---
const serperKey = await ask("SERPER_API_KEY (ricerca web, opzionale — invio per saltare)", env.get("SERPER_API_KEY") ?? "");
env.set("SERPER_API_KEY", serperKey);

// --- Google Workspace ---
if (env.has("GOOGLE_CLIENT_ID")) {
  console.log("\n--- Google Workspace ---\n");

  const clientId = await ask("GOOGLE_CLIENT_ID", env.get("GOOGLE_CLIENT_ID") ?? "");
  env.set("GOOGLE_CLIENT_ID", clientId);

  const clientSecret = await ask("GOOGLE_CLIENT_SECRET", env.get("GOOGLE_CLIENT_SECRET") ?? "");
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
        console.error("Puoi riprovare più tardi con: node setup.js\n");
      }
    }
  } else {
    console.log("Client ID o Secret mancanti — OAuth saltato. Riavvia setup.js quando sono pronti.\n");
  }
}

writeEnv(env);
rl.close();

console.log("\n.env aggiornato.\n");
console.log("Prossimi passi:");
console.log("  npm start          # REPL da terminale");
console.log("  npm run server     # API server su porta 3001");
