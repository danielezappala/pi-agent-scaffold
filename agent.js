import "dotenv/config";
import { Agent } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai";
import * as readline from "node:readline/promises";
import { tools } from "./tools.js";

// --- Agent ---

const PROVIDER = process.env.PROVIDER ?? "anthropic";
const MODEL_ID = process.env.MODEL ?? "claude-sonnet-4-20250514";

const agent = new Agent({
  initialState: {
    systemPrompt: process.env.SYSTEM_PROMPT ?? "Sei un assistente utile e conciso. Rispondi sempre in italiano.",
    model: getModel(PROVIDER, MODEL_ID),
    tools,
  },
});

// Stream text chunks to stdout
agent.subscribe((event) => {
  if (
    event.type === "message_update" &&
    event.assistantMessageEvent.type === "text_delta"
  ) {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
  if (event.type === "tool_execution_start") {
    process.stderr.write(`\n[tool: ${event.toolName}]\n`);
  }
  if (event.type === "agent_end") {
    process.stdout.write("\n");
  }
});

// --- REPL ---

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log('Agente pronto. Digita "exit" per uscire.\n');

while (true) {
  const input = await rl.question("Tu: ");
  if (input.trim().toLowerCase() === "exit") break;
  if (!input.trim()) continue;

  process.stdout.write("Agente: ");
  await agent.prompt(input.trim());
}

rl.close();
console.log("Ciao!");
