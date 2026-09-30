#!/usr/bin/env node
/**
 * postToolUse: once the user answers the Meanwhile question, pass the
 * constraint to the running agent as additional_context (once per run).
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { conversationIdFrom, parseStdin } from "./hook-io.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let out = {};

try {
  const { onPostToolUse } = await import(
    pathToFileURL(join(root, "runtime/pipeline.mjs")).href
  );
  const input = await parseStdin();
  out = onPostToolUse({ conversationId: conversationIdFrom(input) });
} catch (err) {
  console.error("[meanwhile] postToolUse:", err?.message || err);
}
process.stdout.write(`${JSON.stringify(out)}\n`);
process.exit(0);
