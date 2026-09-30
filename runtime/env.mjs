import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let loaded = false;

function applyEnvFile(file) {
  if (!file || !existsSync(file)) {
    return;
  }
  const text = readFileSync(file, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") {
      process.env[key] = value;
    }
  }
}

/**
 * Load Meanwhile secrets from local files (never commit these).
 * Safe to call multiple times.
 */
export function loadMeanwhileEnv() {
  if (loaded) return;
  loaded = true;
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const project = process.env.CURSOR_PROJECT_DIR || process.cwd();
  applyEnvFile(join(homedir(), ".config", "meanwhile.env"));
  applyEnvFile(join(repoRoot, ".env"));
  applyEnvFile(join(project, ".env"));
  applyEnvFile(join(project, ".env.local"));
}
