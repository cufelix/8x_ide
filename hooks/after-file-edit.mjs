#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseStdin } from "./hook-io.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

try {
  const { onFileEdit } = await import(
    pathToFileURL(join(root, "runtime/pipeline.mjs")).href
  );
  const input = await parseStdin();
  onFileEdit({
    path: input.file_path || input.path || input.relative_file_path || null,
    tool: input.tool_name || input.tool || null,
  });
} catch (err) {
  console.error("[meanwhile] afterFileEdit:", err?.message || err);
}
process.exit(0);
