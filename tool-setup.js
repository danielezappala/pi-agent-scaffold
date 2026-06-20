import { isGoogleConfigured } from "./tools-google.js";

// Registro delle integrazioni configurabili. Per ognuna: stato attuale e una guida
// passo-passo che si adatta a cosa manca davvero (non ripete passi già completati).
// Fonte di verità unica per le istruzioni mostrate dal tool get_tool_setup.

function googleGuide() {
  const hasClientId = !!process.env.GOOGLE_CLIENT_ID;
  const hasSecret = !!process.env.GOOGLE_CLIENT_SECRET;
  const token = (process.env.GOOGLE_REFRESH_TOKEN ?? "").trim();
  const tokenIsUrl = /^https?:\/\//i.test(token);
  const tokenMissing = token === "";
  const configured = isGoogleConfigured();

  const steps = [];
  if (!hasClientId || !hasSecret) {
    steps.push("Crea (o apri) un progetto su Google Cloud Console: https://console.cloud.google.com/");
    steps.push("Abilita le API: Gmail API, Google Calendar API, Google Drive API.");
    steps.push("Vai su 'Credenziali' → 'Crea credenziali' → 'ID client OAuth 2.0' → tipo 'App desktop'.");
    steps.push("Aggiungi tra i redirect URI autorizzati: http://localhost:3002/oauth2callback");
    steps.push("Copia il Client ID e il Client Secret in .env nei campi GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.");
  } else {
    steps.push("Client ID e Client Secret sono già presenti nel .env. ✓");
  }

  if (tokenMissing || tokenIsUrl) {
    const reason = tokenIsUrl
      ? "Il GOOGLE_REFRESH_TOKEN attuale non è valido: contiene un URL invece di un token."
      : "Manca il GOOGLE_REFRESH_TOKEN.";
    steps.push(`${reason} Va generato col flusso OAuth.`);
    steps.push("Nel terminale del progetto esegui: node setup-google-auth.js");
    steps.push("Apri l'URL che viene stampato e autorizza l'app con il tuo account Google.");
    steps.push("Lo script stamperà una riga 'GOOGLE_REFRESH_TOKEN=1//...': copiala e sostituisci con quella il valore in .env.");
    steps.push("In alternativa 'npm run setup' (sezione Google) esegue il flusso e scrive il token da solo.");
  } else if (!configured) {
    steps.push("Imposta GOOGLE_REFRESH_TOKEN con un token valido nel .env.");
  }

  if (!configured) {
    steps.push("Riavvia l'agente: i tool Gmail, Calendar e Drive si attiveranno automaticamente.");
  }

  return { configured, steps };
}

function webSearchGuide() {
  const hasSerper = !!process.env.SERPER_API_KEY?.trim();
  const steps = hasSerper
    ? ["La ricerca web usa già Serper (risultati Google). ✓"]
    : [
        "La ricerca web funziona già con DuckDuckGo come fallback (nessuna configurazione richiesta).",
        "Per risultati migliori (Google) crea una chiave su https://serper.dev",
        "Imposta SERPER_API_KEY nel .env con la chiave ottenuta.",
        "Riavvia l'agente: search_web userà automaticamente Serper.",
      ];
  // La ricerca web è sempre operativa (Serper o DuckDuckGo): mai "non configurata".
  return { configured: true, steps, optional: !hasSerper };
}

export const INTEGRATIONS = {
  google: {
    label: "Google Workspace (Gmail, Calendar, Drive)",
    guide: googleGuide,
  },
  web_search: {
    label: "Ricerca web (Serper / DuckDuckGo)",
    guide: webSearchGuide,
  },
};

// Costruisce la guida (stato + passi) per una integrazione, o l'elenco se non specificata.
export function getSetupGuide(integration) {
  if (!integration) {
    const list = Object.entries(INTEGRATIONS).map(([key, def]) => {
      const { configured } = def.guide();
      return `- ${key}: ${def.label} — ${configured ? "configurato ✓" : "DA CONFIGURARE"}`;
    });
    return {
      content: [{ type: "text", text: `Integrazioni disponibili:\n${list.join("\n")}\n\nChiedi la configurazione di una specifica (es. "google").` }],
      details: { integrations: Object.keys(INTEGRATIONS) },
    };
  }

  const def = INTEGRATIONS[integration];
  if (!def) {
    const valid = Object.keys(INTEGRATIONS).join(", ");
    throw new Error(`Integrazione sconosciuta: "${integration}". Valori validi: ${valid}.`);
  }

  const { configured, steps, optional } = def.guide();
  const header = configured
    ? `${def.label}: già configurato.${optional ? " (miglioramento opzionale disponibile)" : ""}`
    : `${def.label}: configurazione necessaria. Segui i passi nell'ordine.`;
  const text = [header, "", ...steps.map((s, i) => `${i + 1}. ${s}`)].join("\n");
  return {
    content: [{ type: "text", text }],
    details: { integration, configured: !!configured, steps },
  };
}
