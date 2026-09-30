#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { conversationIdFrom, parseStdin, promptFrom } from "./hook-io.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function respond(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

try {
  const { onPromptSubmitted } = await import(
    pathToFileURL(join(root, "runtime/pipeline.mjs")).href
  );
  const input = await parseStdin();
  // Fire-and-forget heavy work after allowing the prompt through quickly:
  // still await here but always continue:true so the agent is never blocked.
  await onPromptSubmitted({
    prompt: promptFrom(input),
    conversationId: conversationIdFrom(input),
    repoHints: [],
  });
  respond({ continue: true });
} catch (err) {
  // Fail open — never block coding.
  respond({ continue: true });
  console.error("[meanwhile] beforeSubmitPrompt:", err?.message || err);
}
process.exit(0);
