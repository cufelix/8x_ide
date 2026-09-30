/**
 * Live feed: every step the agent takes (read, search, run, edit, think),
 * as one short line. Pure; the pipeline stores the result in session.feed.
 */
import { createHash } from "node:crypto";
import { isAbsolute, relative } from "node:path";

export const FEED_MAX = 40;
const DETAIL_MAX = 72;

/** Edits arrive through afterFileEdit with the diff; postToolUse would repeat them. */
const EDIT_TOOLS = new Set(["Write", "StrReplace", "Edit", "MultiEdit", "ApplyPatch", "EditNotebook"]);

function clip(text, max = DETAIL_MAX) {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function shortPath(filePath, root) {
  if (!filePath) return null;
  const p = String(filePath);
  if (root && isAbsolute(p)) {
    const rel = relative(root, p);
    if (rel && !rel.startsWith("..")) return rel;
  }
  return p.replace(/^\/home\/[^/]+\//, "~/");
}

function exitCode(toolOutput) {
  try {
    const parsed = typeof toolOutput === "string" ? JSON.parse(toolOutput) : toolOutput;
    return Number.isInteger(parsed?.exitCode) ? parsed.exitCode : null;
  } catch {
    return null;
  }
}

export function entryId(...parts) {
  return createHash("sha1").update(parts.map((p) => String(p ?? "")).join("\u0000")).digest("hex").slice(0, 12);
}

/**
 * One feed line for a postToolUse payload, or null when the tool is not worth a
 * line (edits come from afterFileEdit; bookkeeping tools are noise).
 * @param {{ tool_name?: string, tool_input?: object, tool_output?: string, tool_use_id?: string, duration?: number }} input
 * @param {{ root?: string, now?: Date }} [opts]
 */
export function feedEntryFromTool(input, { root, now = new Date() } = {}) {
  const name = String(input?.tool_name || "");
  const args = input?.tool_input || {};
  if (!name || EDIT_TOOLS.has(name)) return null;
  const id = input.tool_use_id || entryId(name, JSON.stringify(args));
  const base = { id, at: now.toISOString() };

  switch (name) {
    case "Shell": {
      const code = exitCode(input.tool_output);
      return {
        ...base,
        kind: "run",
        label: "Ran",
        detail: clip(args.command),
        status: code === null ? null : code === 0 ? "ok" : `exit ${code}`,
      };
    }
    case "Read": {
      const path = shortPath(args.path || args.file_path, root);
      return { ...base, kind: "read", label: "Read", detail: clip(path), path };
    }
    case "Grep":
      return { ...base, kind: "search", label: "Searched for", detail: clip(args.pattern) };
    case "Glob":
      return { ...base, kind: "search", label: "Looked for files", detail: clip(args.glob_pattern || args.pattern) };
    case "Delete":
      return { ...base, kind: "edit", label: "Deleted", detail: clip(shortPath(args.path, root)) };
    case "WebSearch":
      return { ...base, kind: "web", label: "Searched the web for", detail: clip(args.search_term || args.query) };
    case "WebFetch":
      return { ...base, kind: "web", label: "Opened", detail: clip(args.url) };
    case "Task":
      return { ...base, kind: "think", label: "Started a helper", detail: clip(args.description || args.prompt) };
    case "TodoWrite":
    case "AwaitShell":
    case "ReadLints":
      return null;
    default: {
      if (/^mcp/i.test(name) || name === "CallDynamicTool") {
        const tool = args.toolName || name.replace(/^mcp[_:]*/i, "");
        return { ...base, kind: "tool", label: "Used", detail: clip(tool) };
      }
      return { ...base, kind: "tool", label: "Used", detail: clip(name) };
    }
  }
}

export function feedEntryForEdit({ path, added, removed, isNew, change: code = "" }, { now = new Date() } = {}) {
  const change = isNew ? "new file" : [added ? `+${added}` : null, removed ? `−${removed}` : null].filter(Boolean).join(" ");
  return {
    id: entryId("edit", path, code),
    at: now.toISOString(),
    kind: "edit",
    label: isNew ? "Created" : "Edited",
    detail: clip(path),
    status: change || null,
  };
}

export function feedEntryForPrompt(prompt, { now = new Date() } = {}) {
  return { id: entryId("prompt", prompt), at: now.toISOString(), kind: "prompt", label: "Task", detail: clip(prompt, 120) };
}

export function feedEntryForThought(line, { now = new Date() } = {}) {
  return { id: entryId("think", line), at: now.toISOString(), kind: "think", label: "Thinking", detail: clip(line) };
}

const REPEAT_WINDOW_MS = 10000;

/**
 * Hooks can be installed twice (user + project), so the same event arrives
 * twice within moments. The same id later on is a real repeat and stays.
 */
export function isRepeat(feed, entry) {
  const at = Date.parse(entry?.at || "");
  return (Array.isArray(feed) ? feed : []).some(
    (e) => e.id === entry.id && Math.abs(Date.parse(e.at) - at) < REPEAT_WINDOW_MS
  );
}

/** Newest first. */
export function appendFeed(feed, entry, max = FEED_MAX) {
  const list = Array.isArray(feed) ? feed : [];
  if (!entry || isRepeat(list, entry)) return list;
  return [entry, ...list].slice(0, max);
}

export function wasRead(feed, path) {
  return (Array.isArray(feed) ? feed : []).some((e) => e.kind === "read" && e.path === path);
}

/** Line counts for an afterFileEdit payload. */
export function countEditLines(edits) {
  let added = 0;
  let removed = 0;
  for (const e of Array.isArray(edits) ? edits : []) {
    added += e?.new_string ? String(e.new_string).split("\n").length : 0;
    removed += e?.old_string ? String(e.old_string).split("\n").length : 0;
  }
  return { added, removed };
}
