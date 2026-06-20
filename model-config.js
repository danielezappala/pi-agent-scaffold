import { getModel } from "@earendil-works/pi-ai";

// Fonte di verità unica: provider → etichetta, env della API key, modello di default.
// Usata sia dal setup interattivo (setup.js) sia dal runtime (agent.js, server.js)
// per garantire che provider, modello e API key restino sempre coerenti.
export const PROVIDER_CONFIG = {
  ollama: {
    label: "Ollama (locale)",
    apiKeyEnv: "OPENAI_API_KEY",
    defaultModel: "gemma4:latest",
  },
  anthropic: {
    label: "Claude (Anthropic)",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    defaultModel: "claude-haiku-4-5-20251001",
  },
  openai: {
    label: "OpenAI",
    apiKeyEnv: "OPENAI_API_KEY",
    defaultModel: "gpt-4o-mini",
  },
  google: {
    label: "Google Gemini",
    apiKeyEnv: "GEMINI_API_KEY",
    defaultModel: "gemini-2.5-flash",
  },
  groq: {
    label: "Groq",
    apiKeyEnv: "GROQ_API_KEY",
    defaultModel: "openai/gpt-oss-20b",
  },
  openrouter: {
    label: "OpenRouter",
    apiKeyEnv: "OPENROUTER_API_KEY",
    defaultModel: "z-ai/glm-4.5v",
  },
  xai: {
    label: "xAI",
    apiKeyEnv: "XAI_API_KEY",
    defaultModel: "grok-code-fast-1",
  },
  deepseek: {
    label: "DeepSeek",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    defaultModel: "deepseek-chat",
  },
  mistral: {
    label: "Mistral",
    apiKeyEnv: "MISTRAL_API_KEY",
    defaultModel: "mistral-small-latest",
  },
  cerebras: {
    label: "Cerebras",
    apiKeyEnv: "CEREBRAS_API_KEY",
    defaultModel: "gpt-oss-120b",
  },
  together: {
    label: "Together AI",
    apiKeyEnv: "TOGETHER_API_KEY",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  },
  fireworks: {
    label: "Fireworks",
    apiKeyEnv: "FIREWORKS_API_KEY",
    defaultModel: "accounts/fireworks/models/llama-v3p1-8b-instruct",
  },
};

function normalizeOllamaBaseUrl(env = process.env) {
  const raw = (env.OLLAMA_BASE_URL || env.OLLAMA_HOST || "http://localhost:11434").trim();

  // Se il valore configurato non e' un URL valido, usa il default locale.
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    parsed = new URL("http://localhost:11434");
  }

  const path = parsed.pathname.replace(/\/$/, "");
  if (!path || path === "") {
    parsed.pathname = "/v1";
  }

  return parsed.toString().replace(/\/$/, "");
}

// Risolve provider + modello + API key in modo coerente a partire dall'ambiente.
// Fallisce in modo esplicito se la combinazione non è valida, invece di lasciare
// l'agente con un modello `undefined` (che produrrebbe risposte vuote).
export function resolveModel(env = process.env) {
  const provider = env.PROVIDER ?? "anthropic";
  const config = PROVIDER_CONFIG[provider];
  if (!config) {
    throw new Error(
      `PROVIDER non valido: "${provider}". Valori ammessi: ${Object.keys(PROVIDER_CONFIG).join(", ")}. Esegui: npm run setup`,
    );
  }

  if (provider === "ollama") {
    const modelId = env.MODEL || config.defaultModel;
    const openaiCompatKey = env.OPENAI_API_KEY || "ollama";

    // pi-ai richiede una API key anche per endpoint OpenAI-compatibili locali;
    // per Ollama basta un placeholder non vuoto.
    if (!env.OPENAI_API_KEY) {
      process.env.OPENAI_API_KEY = openaiCompatKey;
    }

    const model = {
      id: modelId,
      name: `Ollama ${modelId}`,
      api: "openai-completions",
      provider: "openai",
      baseUrl: normalizeOllamaBaseUrl(env),
      input: "text",
      reasoning: false,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 32768,
      maxTokens: 8192,
    };

    return { provider, modelId, model };
  }

  // L'API key deve essere quella coerente col provider scelto.
  const apiKey = config.apiKeyEnv ? env[config.apiKeyEnv] : "";
  if (config.apiKeyEnv && !apiKey) {
    throw new Error(
      `API key mancante per il provider "${provider}": imposta ${config.apiKeyEnv} nel .env. Esegui: npm run setup`,
    );
  }

  // Se MODEL non è impostato, usa il default del provider (mai un modello di un altro provider).
  const modelId = env.MODEL || config.defaultModel;
  const model = getModel(provider, modelId);
  if (!model) {
    throw new Error(
      `Modello "${modelId}" non valido per il provider "${provider}" (default consigliato: ${config.defaultModel}). Esegui: npm run setup`,
    );
  }

  return { provider, modelId, model };
}
