#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { conversationIdFrom, parseStdin, promptFrom } from "./hook-io.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { onPromptSubmitted } = await import(
  pathToFileURL(join(root, "runtime/pipeline.mjs")).href
);

const input = await parseStdin();
await onPromptSubmitted({
  prompt: promptFrom(input),
  conversationId: conversationIdFrom(input),
  repoHints: [],
});
process.exit(0);
