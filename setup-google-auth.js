import "dotenv/config";
import { google } from "googleapis";
import http from "node:http";
import { createAuthClient, REDIRECT_URI, SCOPES } from "./google-auth.js";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  REDIRECT_URI
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: SCOPES,
});

console.log("\nApri questo URL nel browser:\n");
console.log(authUrl);
console.log("\nIn attesa del callback su http://localhost:3002 ...\n");

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:3002");
  if (url.pathname !== "/oauth2callback") return;

  const code = url.searchParams.get("code");
  if (!code) {
    res.end("Errore: nessun codice ricevuto.");
    server.close();
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    res.end("<h2>Autenticazione completata! Puoi chiudere questa scheda.</h2>");
    server.close();

    if (!tokens.refresh_token) {
      console.error("ATTENZIONE: nessun refresh_token ricevuto. Rimuovi l'accesso all'app da https://myaccount.google.com/permissions e riprova.");
      process.exit(1);
    }

    console.log("Autenticazione completata!\n");
    console.log("Aggiungi queste righe al tuo .env:\n");
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
  } catch (err) {
    res.end("Errore durante lo scambio del token: " + err.message);
    server.close();
    console.error(err);
    process.exit(1);
  }
});

server.listen(3002);
