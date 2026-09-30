#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { identityFrom, parseStdin } from "./hook-io.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let out = {};

try {
  const { onCodingAgentStop } = await import(
    pathToFileURL(join(root, "runtime/pipeline.mjs")).href
  );
  const input = await parseStdin();
  out = onCodingAgentStop({
    ...identityFrom(input),
    status: input.status || "completed",
    loopCount: Number(input.loop_count) || 0,
  });
} catch (err) {
  console.error("[meanwhile] stop:", err?.message || err);
}
process.stdout.write(`${JSON.stringify(out)}\n`);
process.exit(0);
