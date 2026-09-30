#!/usr/bin/env node
/**
 * postToolUse: add the tool call to the live feed, and once the user answers
 * the Meanwhile question, pass the constraint to the running agent as
 * additional_context (once per run).
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { identityFrom, parseStdin } from "./hook-io.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let out = {};

try {
  const { onPostToolUse } = await import(
    pathToFileURL(join(root, "runtime/pipeline.mjs")).href
  );
  const input = await parseStdin();
  out = onPostToolUse({
    ...identityFrom(input),
    tool: input.tool_name
      ? {
          tool_name: input.tool_name,
          tool_input: input.tool_input,
          tool_output: typeof input.tool_output === "string" ? input.tool_output.slice(0, 2000) : input.tool_output,
          tool_use_id: input.tool_use_id,
        }
      : null,
  });
} catch (err) {
  console.error("[meanwhile] postToolUse:", err?.message || err);
}
process.stdout.write(`${JSON.stringify(out)}\n`);
process.exit(0);
