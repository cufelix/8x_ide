import { mkdirSync } from "node:fs";
import { join } from "node:path";

export function projectDir() {
  return process.env.CURSOR_PROJECT_DIR || process.cwd();
}

export function pluginRoot() {
  return process.env.CURSOR_PLUGIN_ROOT || process.cwd();
}

export function meanwhileDir(root = projectDir()) {
  return join(root, ".meanwhile");
}

export function ensureMeanwhileDir(root = projectDir()) {
  const dir = meanwhileDir(root);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function sessionPath(root = projectDir()) {
  return join(meanwhileDir(root), "session.json");
}

export function playerPath(root = projectDir()) {
  return join(meanwhileDir(root), "player.json");
}

export function eventsPath(root = projectDir()) {
  return join(meanwhileDir(root), "events.jsonl");
}

export function activityPath(root = projectDir()) {
  return join(meanwhileDir(root), "activity.jsonl");
}
