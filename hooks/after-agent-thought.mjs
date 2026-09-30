#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseStdin } from "./hook-io.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { appendActivity } = await import(
  pathToFileURL(join(root, "runtime/store.mjs")).href
);

const input = await parseStdin();
const thought =
  input.text || input.thought || input.content || input.summary || null;
appendActivity({
  kind: "thought",
  excerpt: thought ? String(thought).slice(0, 400) : null,
});
process.exit(0);
