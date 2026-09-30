#!/usr/bin/env node
/**
 * Start a demo Meanwhile session without waiting for a Cursor hook.
 * Usage: node scripts/demo-session.mjs ["your prompt"]
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { startDemoSession } = await import(
  pathToFileURL(join(root, "runtime/pipeline.mjs")).href
);

const prompt = process.argv.slice(2).join(" ").trim();
const result = await startDemoSession(prompt || undefined);
console.log(
  JSON.stringify(
    {
      ok: !result.skipped,
      sessionId: result.session?.id,
      stack: result.session?.stack,
      estimate: result.session?.estimate?.label,
      videos: result.session?.videos?.length,
      cards: result.session?.cards?.length,
      path: join(result.session?.source?.projectDir || process.cwd(), ".meanwhile/session.json"),
    },
    null,
    2
  )
);
