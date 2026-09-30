#!/usr/bin/env node
/**
 * Thin MCP server for Meanwhile status / advance / demo.
 */
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pipeline = await import(
  pathToFileURL(join(root, "runtime/pipeline.mjs")).href
);
const store = await import(pathToFileURL(join(root, "runtime/store.mjs")).href);

const TOOLS = [
  {
    name: "meanwhile_status",
    description: "Current Meanwhile session: stack, estimate, clips, the open question, and the constraint the user set.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "meanwhile_demo",
    description: "Start a demo waiting-room session from a prompt.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string" },
      },
    },
  },
  {
    name: "meanwhile_constraints",
    description: "Constraints the user set in the Meanwhile panel for this run. Follow them.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "meanwhile_answer",
    description: "Answer the open Meanwhile question with one of its choice ids.",
    inputSchema: {
      type: "object",
      properties: {
        choiceId: { type: "string" },
      },
      required: ["choiceId"],
    },
  },
];

function ok(id, result) {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
}

function toolText(obj) {
  return {
    content: [{ type: "text", text: JSON.stringify(obj, null, 2) }],
  };
}

async function handleTool(name, args = {}) {
  if (name === "meanwhile_status") {
    const session = store.loadSession();
    const activity = store.readActivityTail(12);
    return toolText({ session, activity });
  }
  if (name === "meanwhile_demo") {
    const result = pipeline.startDemoSession(args.prompt);
    return toolText(result);
  }
  if (name === "meanwhile_constraints") {
    const answer = store.loadSession()?.question?.answer;
    return toolText({ constraints: answer ? [answer.constraint] : [] });
  }
  if (name === "meanwhile_answer") {
    return toolText(pipeline.answerQuestion({ choiceId: String(args.choiceId || "") }));
  }
  return toolText({ error: "unknown_tool", name });
}

const rl = createInterface({ input: process.stdin, terminal: false });
rl.on("line", async (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  const { id, method, params } = msg;
  if (method === "initialize") {
    process.stdout.write(
      `${JSON.stringify(
        ok(id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "meanwhile", version: "0.2.0" },
        })
      )}\n`
    );
    return;
  }
  if (method === "notifications/initialized") {
    return;
  }
  if (method === "tools/list") {
    process.stdout.write(`${JSON.stringify(ok(id, { tools: TOOLS }))}\n`);
    return;
  }
  if (method === "tools/call") {
    const result = await handleTool(params?.name, params?.arguments || {});
    process.stdout.write(`${JSON.stringify(ok(id, result))}\n`);
    return;
  }
  if (id != null) {
    process.stdout.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      })}\n`
    );
  }
});
