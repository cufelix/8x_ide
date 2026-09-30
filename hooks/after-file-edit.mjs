#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { conversationIdFrom, parseStdin } from "./hook-io.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

try {
  const { onFileEdit } = await import(
    pathToFileURL(join(root, "runtime/pipeline.mjs")).href
  );
  const input = await parseStdin();
  onFileEdit({
    path: input.file_path || input.path || input.relative_file_path || null,
    edits: Array.isArray(input.edits) ? input.edits : [],
    conversationId: conversationIdFrom(input),
  });
} catch (err) {
  console.error("[meanwhile] afterFileEdit:", err?.message || err);
}
process.exit(0);
