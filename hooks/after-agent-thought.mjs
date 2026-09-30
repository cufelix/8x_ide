#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { conversationIdFrom, parseStdin } from "./hook-io.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

try {
  const { onAgentThought } = await import(
    pathToFileURL(join(root, "runtime/pipeline.mjs")).href
  );
  const input = await parseStdin();
  const thought =
    input.text || input.thought || input.content || input.summary || null;
  onAgentThought({
    thought,
    conversationId: conversationIdFrom(input),
  });
} catch (err) {
  console.error("[meanwhile] afterAgentThought:", err?.message || err);
}
process.exit(0);
