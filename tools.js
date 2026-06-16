import { Type } from "@earendil-works/pi-ai";
import { googleTools } from "./tools-google.js";

export const getTimeTool = {
  name: "get_current_time",
  label: "Get Current Time",
  description: "Returns the current date and time.",
  parameters: Type.Object({}),
  execute: async () => {
    const now = new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" });
    return {
      content: [{ type: "text", text: now }],
      details: { timestamp: Date.now() },
    };
  },
};

export const calculateTool = {
  name: "calculate",
  label: "Calculate",
  description: "Evaluates a simple mathematical expression and returns the result.",
  parameters: Type.Object({
    expression: Type.String({ description: "The math expression to evaluate, e.g. '2 + 2 * 3'" }),
  }),
  execute: async (_id, { expression }) => {
    try {
      const result = Function(`"use strict"; return (${expression})`)();
      return {
        content: [{ type: "text", text: String(result) }],
        details: { expression, result },
      };
    } catch {
      throw new Error(`Cannot evaluate: ${expression}`);
    }
  },
};

export const fetchUrlTool = {
  name: "fetch_url",
  label: "Fetch URL",
  description: "Fetches a web page and returns its text content. Use for reading articles, documentation, or any public URL.",
  parameters: Type.Object({
    url: Type.String({ description: "The full URL to fetch, e.g. https://example.com" }),
  }),
  execute: async (_id, { url }) => {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; pi-agent/1.0)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s{2,}/g, " ")
      .trim()
      .slice(0, 8000);

    return {
      content: [{ type: "text", text }],
      details: { url, length: text.length },
    };
  },
};

export const searchWebTool = {
  name: "search_web",
  label: "Search Web",
  description: "Searches the web for current information, news, and any topic. Use this when the user asks for news, current events, or information without specifying a URL. Returns titles, URLs, and snippets of the top results. IMPORTANT: in your final response you MUST copy the exact Markdown links returned by this tool (format: [domain](full_url)). Do NOT paraphrase or drop the URL — the user must be able to click the source. Example: ([ansa.it](https://www.ansa.it/sito/notizie/...)).",
  parameters: Type.Object({
    query: Type.String({ description: "The search query, e.g. 'notizie oggi Italia' or 'latest AI news'" }),
    max_results: Type.Optional(Type.Number({ description: "Max results to return (default 5)" })),
  }),
  execute: async (_id, { query, max_results = 5 }) => {
    let results = [];

    if (process.env.SERPER_API_KEY) {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": process.env.SERPER_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: query, num: max_results, gl: "it", hl: "it" }),
      });
      if (!res.ok) throw new Error(`Serper error: HTTP ${res.status}`);
      const data = await res.json();
      results = (data.organic ?? []).slice(0, max_results).map(r => ({
        title: r.title,
        url: r.link,
        snippet: r.snippet ?? "",
      }));
    } else {
      const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
        },
      });
      if (!res.ok) throw new Error(`Search failed: HTTP ${res.status}`);
      const html = await res.text();
      const titles = [...html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].slice(0, max_results);
      const snippets = [...html.matchAll(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)].slice(0, max_results);
      for (let i = 0; i < titles.length; i++) {
        const href = titles[i][1];
        const title = titles[i][2].replace(/<[^>]+>/g, "").trim();
        const snippet = snippets[i] ? snippets[i][1].replace(/<[^>]+>/g, "").trim() : "";
        let url = href;
        if (href.includes("uddg=")) {
          try { url = decodeURIComponent(href.split("uddg=")[1].split("&")[0]); } catch {}
        } else if (href.startsWith("//")) {
          url = "https:" + href;
        }
        results.push({ title, url, snippet });
      }
    }

    if (results.length === 0) {
      return { content: [{ type: "text", text: "Nessun risultato trovato." }], details: { query } };
    }

    const sources = results.map(r => {
      try { return new URL(r.url).hostname.replace(/^www\./, ""); } catch { return r.url; }
    });

    const uniqueSources = [...new Set(sources)].map((s, i) => `[${s}](${results[sources.indexOf(s)].url})`).join(", ");
    const text = results
      .map((r, i) => `${i + 1}. **${r.title}** [[${sources[i]}](${r.url})]\n   ${r.snippet ?? ""}`)
      .join("\n\n") + `\n\n_Fonti: ${uniqueSources}_`;

    return { content: [{ type: "text", text }], details: { query, count: results.length, sources } };
  },
};

export const tools = [getTimeTool, calculateTool, fetchUrlTool, searchWebTool, ...googleTools];
