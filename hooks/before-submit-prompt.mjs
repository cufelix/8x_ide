#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { identityFrom, parseStdin, promptFrom } from "./hook-io.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function respond(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

try {
  const { onPromptSubmitted } = await import(
    pathToFileURL(join(root, "runtime/pipeline.mjs")).href
  );
  const input = await parseStdin();
  // Local-only write; network research runs in a detached enrich process.
  onPromptSubmitted({
    prompt: promptFrom(input),
    ...identityFrom(input),
  });
  respond({ continue: true });
} catch (err) {
  // Fail open — never block coding.
  respond({ continue: true });
  console.error("[meanwhile] beforeSubmitPrompt:", err?.message || err);
}
process.exit(0);
