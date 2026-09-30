#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseStdin } from "./hook-io.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { appendActivity } = await import(
  pathToFileURL(join(root, "runtime/store.mjs")).href
);

const input = await parseStdin();
appendActivity({
  kind: "file_edit",
  path: input.file_path || input.path || input.relative_file_path || null,
  tool: input.tool_name || input.tool || null,
});
process.exit(0);
