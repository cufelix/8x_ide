#!/usr/bin/env node
/**
 * Install Meanwhile as user-level Cursor hooks so it runs in ANY workspace.
 * Usage: node scripts/install-user-hooks.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cursorDir = join(homedir(), ".cursor");
const hooksPath = join(cursorDir, "hooks.json");

const commands = {
  beforeSubmitPrompt: [
    {
      command: `node ${join(repoRoot, "hooks/before-submit-prompt.mjs")}`,
      timeout: 20,
    },
  ],
  sessionStart: [
    {
      command: `node ${join(repoRoot, "hooks/session-start.mjs")}`,
      timeout: 5,
    },
  ],
  afterFileEdit: [
    {
      command: `node ${join(repoRoot, "hooks/after-file-edit.mjs")}`,
      timeout: 5,
    },
  ],
  afterAgentThought: [
    {
      command: `node ${join(repoRoot, "hooks/after-agent-thought.mjs")}`,
      timeout: 5,
    },
  ],
  stop: [
    {
      command: `node ${join(repoRoot, "hooks/stop.mjs")}`,
      timeout: 5,
    },
  ],
};

mkdirSync(cursorDir, { recursive: true });
let existing = { version: 1, hooks: {} };
if (existsSync(hooksPath)) {
  try {
    existing = JSON.parse(readFileSync(hooksPath, "utf8"));
  } catch {
    existing = { version: 1, hooks: {} };
  }
}
existing.version = 1;
existing.hooks = existing.hooks || {};

for (const [event, list] of Object.entries(commands)) {
  const prev = Array.isArray(existing.hooks[event])
    ? existing.hooks[event]
    : [];
  const filtered = prev.filter(
    (h) => !String(h.command || "").includes("slop_ide/hooks/")
  );
  existing.hooks[event] = [...filtered, ...list];
}

writeFileSync(hooksPath, `${JSON.stringify(existing, null, 2)}\n`, "utf8");
console.log(`Wrote Meanwhile hooks → ${hooksPath}`);
console.log("Reload Cursor window (Developer: Reload Window) to pick them up.");
console.log(
  "Tip: export OPENROUTER_API_KEY / ELEVENLABS_API_KEY in your shell profile so hooks inherit them."
);
