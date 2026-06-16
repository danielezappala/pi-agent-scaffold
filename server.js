import "dotenv/config";
import http from "node:http";
import { Agent } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai";
import { tools } from "./tools.js";

const PORT = Number(process.env.PORT ?? 3001);
const PROVIDER = process.env.PROVIDER ?? "anthropic";
const MODEL_ID = process.env.MODEL ?? "claude-sonnet-4-20250514";
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT ?? "Sei un assistente utile e conciso. Rispondi sempre in italiano.";

function extractText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.filter(c => c.type === "text").map(c => c.text).join("");
  return "";
}

function buildAgentInput(messages) {
  let systemPrompt = SYSTEM_PROMPT;
  const agentMessages = [];

  for (const msg of messages) {
    const text = extractText(msg.content);
    if (msg.role === "system") {
      systemPrompt = text;
    } else if (msg.role === "user") {
      agentMessages.push({ role: "user", content: text, timestamp: Date.now() });
    } else if (msg.role === "assistant" && text) {
      agentMessages.push({ role: "assistant", content: [{ type: "text", text }], timestamp: Date.now() });
    }
  }

  const last = agentMessages.at(-1);
  if (!last || last.role !== "user") throw new Error("Last message must be from user");

  return { systemPrompt, history: agentMessages.slice(0, -1), lastUserText: last.content };
}

function sseChunk(id, created, delta, finishReason = null) {
  return `data: ${JSON.stringify({
    id,
    object: "chat.completion.chunk",
    created,
    model: MODEL_ID,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  })}\n\n`;
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "GET" && url.pathname === "/v1/models") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      object: "list",
      data: [{ id: "pi-agent", object: "model", created: Math.floor(Date.now() / 1000), owned_by: PROVIDER }],
    }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
    let body = "";
    for await (const chunk of req) body += chunk;

    let parsed;
    try { parsed = JSON.parse(body); } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }

    let systemPrompt, history, lastUserText;
    try {
      ({ systemPrompt, history, lastUserText } = buildAgentInput(parsed.messages ?? []));
    } catch (e) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
      return;
    }

    const agent = new Agent({
      initialState: {
        systemPrompt,
        model: getModel(PROVIDER, MODEL_ID),
        tools,
        messages: history,
      },
    });

    const id = `chatcmpl-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);
    const streaming = parsed.stream !== false;

    if (streaming) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      });

      res.write(sseChunk(id, created, { role: "assistant", content: "" }));

      agent.subscribe((event) => {
        if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
          res.write(sseChunk(id, created, { content: event.assistantMessageEvent.delta }));
        }
        if (event.type === "agent_end") {
          res.write(sseChunk(id, created, {}, "stop"));
          res.write("data: [DONE]\n\n");
          res.end();
        }
      });

      try {
        await agent.prompt(lastUserText);
      } catch (e) {
        res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
        res.end();
      }
    } else {
      let fullText = "";
      agent.subscribe((event) => {
        if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
          fullText += event.assistantMessageEvent.delta;
        }
      });

      try {
        await agent.prompt(lastUserText);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          id,
          object: "chat.completion",
          created,
          model: MODEL_ID,
          choices: [{ index: 0, message: { role: "assistant", content: fullText }, finish_reason: "stop" }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`Pi Agent server → http://localhost:${PORT}/v1`);
  console.log(`Model: ${PROVIDER}/${MODEL_ID}`);
});
