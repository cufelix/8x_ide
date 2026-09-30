import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { dirname, join, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { describeEdit, describeThought, summarizeChanges } from "./activity.mjs";
import { buildSchema, readCodeFacts } from "./codemap.mjs";
import { loadMeanwhileEnv } from "./env.mjs";
import { estimateDuration } from "./estimate.mjs";
import { changedCode, explainFromFacts, upsertExplanation } from "./explain.mjs";
import {
  appendFeed,
  countEditLines,
  feedEntryForEdit,
  feedEntryForPrompt,
  feedEntryForThought,
  feedEntryFromTool,
  isRepeat,
  wasRead,
} from "./feed.mjs";
import { meanwhileDir, projectDir } from "./paths.mjs";
import {
  answerQuestion as answerQ,
  CONSTRAINT_PREFIX,
  constraintMessage,
  markDelivered,
  questionFor,
} from "./question.mjs";
import { extractStack, mergeStack, stackFromEdit } from "./stack.mjs";
import {
  appendActivity,
  emitEvent,
  loadSession,
  saveAnswer,
  saveSession,
  withSessionLock,
} from "./store.mjs";
import { curatedForStack, orderForEstimate } from "./youtube.mjs";

loadMeanwhileEnv();

const here = dirname(fileURLToPath(import.meta.url));

function isMeanwhileCommand(prompt) {
  const p = String(prompt || "").trim();
  // Our own stop-hook follow-up must not start a new run.
  return !p || /^\/meanwhile\b/i.test(p) || p.startsWith(CONSTRAINT_PREFIX);
}

const DUPLICATE_WINDOW_MS = 15000;

/**
 * The same hook can be installed twice (user-level ~/.cursor/hooks.json and
 * the project's .cursor/hooks.json); one prompt must start one run.
 */
export function isDuplicateSubmit(session, { prompt, conversationId }, now = Date.now()) {
  if (!session?.source) return false;
  const age = now - Date.parse(session.source.capturedAt);
  return (
    age >= 0 &&
    age < DUPLICATE_WINDOW_MS &&
    session.source.prompt === String(prompt || "") &&
    (session.source.conversationId || null) === (conversationId || null)
  );
}

/** Thought hooks append a suffix to the turn's generation id ("<uuid>-31-oncl"). */
function sameGeneration(a, b) {
  if (!a || !b) return false;
  return a.slice(0, 36) === b.slice(0, 36);
}

/**
 * A hook from another chat must not touch this run. Cursor may report a second
 * conversation id for tool and edit hooks within the same turn; the shared
 * generation id links it, and it is remembered as an alias for later turns.
 */
export function belongs(session, conversationId, generationId) {
  const src = session?.source;
  return (
    !src?.conversationId ||
    !conversationId ||
    src.conversationId === conversationId ||
    (src.aliases || []).includes(conversationId) ||
    sameGeneration(src.generationId, generationId)
  );
}

function withAlias(session, conversationId) {
  const src = session.source || {};
  if (!conversationId || src.conversationId === conversationId || (src.aliases || []).includes(conversationId)) {
    return session;
  }
  return { ...session, source: { ...src, aliases: [...(src.aliases || []), conversationId].slice(-4) } };
}

function isRunning(session) {
  return session?.codingAgent?.status === "running";
}

/**
 * Prompt hook: write a complete session from local data only (no network),
 * then hand network work to a detached enrich process.
 */
export function onPromptSubmitted({ prompt, conversationId, generationId }, { enrich = true } = {}) {
  if (isMeanwhileCommand(prompt)) {
    return { skipped: true, reason: "meanwhile-command" };
  }
  const stack = extractStack(prompt);
  const estimate = estimateDuration(prompt, stack);
  const now = new Date().toISOString();
  const session = {
    version: 2,
    id: randomUUID(),
    source: {
      prompt: String(prompt || ""),
      conversationId: conversationId || null,
      generationId: generationId || null,
      aliases: [],
      projectDir: projectDir(),
      capturedAt: now,
    },
    stack,
    estimate,
    videos: orderForEstimate(curatedForStack(stack), estimate),
    question: questionFor({ prompt, stack, estimate }),
    activity: { line: "reading the request", at: now },
    feed: [feedEntryForPrompt(prompt, { now: new Date(now) })],
    explain: [],
    code: {},
    concepts: [],
    files: [],
    summary: null,
    codingAgent: { status: "running", startedAt: now, stoppedAt: null },
  };
  const saved = withSessionLock(() => {
    if (isDuplicateSubmit(loadSession(), { prompt, conversationId })) return false;
    saveSession(session);
    return true;
  });
  if (!saved) return { skipped: true, reason: "duplicate-hook" };
  appendActivity({ kind: "session_start", excerpt: `${estimate.label} · ${stack.join(", ") || "no stack"}` });
  emitEvent("prompt_submitted", { stack, estimate: estimate.label, question: session.question?.id ?? null }, session.id);
  if (enrich) spawnEnrich(session.id);
  return { skipped: false, session };
}

function spawnEnrich(sessionId) {
  spawnWorker("enrich.mjs", [sessionId]);
}

function spawnWorker(script, args) {
  if (process.env.MEANWHILE_NO_ENRICH === "1") return;
  try {
    const child = spawn(process.execPath, [join(here, script), ...args], {
      cwd: projectDir(),
      env: { ...process.env, CURSOR_PROJECT_DIR: projectDir() },
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch (err) {
    console.error(`[meanwhile] ${script} spawn:`, err?.message || err);
  }
}

function updateSessionUnlocked(sessionId, update) {
  const session = loadSession();
  if (!session || session.id !== sessionId) return null;
  const next = update(session);
  if (next && next !== session) saveSession(next);
  return next;
}

export function onCodingSessionStart({ conversationId, generationId }) {
  const session = loadSession();
  if (!session || !belongs(session, conversationId, generationId)) return { skipped: true };
  emitEvent("coding_session_start", { conversationId }, session.id);
  return { skipped: false, session };
}

function onAgentThoughtUnlocked({ thought, conversationId, generationId }) {
  const line = describeThought(thought);
  const session = loadSession();
  if (!session || !isRunning(session) || !belongs(session, conversationId, generationId) || !line) {
    return { skipped: true };
  }
  const entry = feedEntryForThought(line);
  if (isRepeat(session.feed, entry)) return { skipped: true, reason: "duplicate-hook" };
  const next = {
    ...withAlias(session, conversationId),
    activity: { line, at: entry.at },
    feed: appendFeed(session.feed, entry),
  };
  saveSession(next);
  appendActivity({ kind: "thought", excerpt: line });
  return { skipped: false, session: next };
}

function toProjectPath(filePath) {
  if (!filePath) return null;
  return isAbsolute(filePath) ? relative(projectDir(), filePath) || filePath : filePath;
}

function onFileEditUnlocked({ path: filePath, edits = [], conversationId, generationId }) {
  const rel = toProjectPath(filePath);
  const session = loadSession();
  if (!rel || !session || !isRunning(session) || !belongs(session, conversationId, generationId)) {
    return { skipped: true };
  }
  const list = Array.isArray(edits) ? edits : [];
  // Cursor also reports whole-file rewrites of existing files with an empty old_string.
  const isNew =
    list.length > 0 && list.every((e) => !e?.old_string) && !wasRead(session.feed, rel) && !isTracked(rel);
  const files = session.files || [];
  const known = files.find((f) => f.path === rel);
  const change = changedCode(list);
  const { added, removed } = countEditLines(list);
  const entry = feedEntryForEdit({ path: rel, added, removed, isNew: isNew && !known, change });
  if (isRepeat(session.feed, entry)) return { skipped: true, reason: "duplicate-hook" };

  const facts = readCodeFacts(isAbsolute(filePath) ? filePath : join(projectDir(), rel), rel, projectDir());
  const code = { ...(session.code || {}) };
  if (facts) code[rel] = { imports: facts.imports, exports: facts.exports, lines: facts.lines, resolved: facts.resolved };
  const explainId = randomUUID().slice(0, 8);
  const hasLlm = Boolean((process.env.OPENROUTER_API_KEY || "").trim()) && process.env.MEANWHILE_NO_ENRICH !== "1";
  const explanation = {
    id: explainId,
    path: rel,
    text: explainFromFacts({ path: rel, isNew: isNew && !known, facts, added, removed }),
    concept: null,
    source: "code",
    status: hasLlm && facts ? "pending" : "done",
    at: entry.at,
  };
  const line = describeEdit(rel);
  const next = {
    ...withAlias(session, conversationId),
    stack: mergeStack(session.stack || [], stackFromEdit(rel, list)),
    files: known ? files : [...files, { path: rel, isNew }],
    activity: line ? { line, at: entry.at } : session.activity,
    feed: appendFeed(session.feed, entry),
    code,
    schema: buildSchema(code, {
      order: [...files.map((f) => f.path).filter((p) => p !== rel), rel],
      active: rel,
      newFiles: [...files.filter((f) => f.isNew).map((f) => f.path), ...(known || !isNew ? [] : [rel])],
    }),
    explain: upsertExplanation(session.explain, explanation),
    lastEdit: { path: rel, at: entry.at },
  };
  saveSession(next);
  appendActivity({ kind: "file_edit", path: rel, excerpt: line });
  if (explanation.status === "pending") {
    queueExplain(session.id, explainId, {
      prompt: session.source?.prompt,
      path: rel,
      change,
      source: facts.source,
    });
  }
  return { skipped: false, session: next };
}

function isTracked(rel) {
  try {
    const res = spawnSync("git", ["ls-files", "--error-unmatch", "--", rel], {
      cwd: projectDir(),
      stdio: "ignore",
      timeout: 1000,
    });
    return res.status === 0;
  } catch {
    return false;
  }
}

function queueExplain(sessionId, id, job) {
  try {
    const dir = join(meanwhileDir(), "explain");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${id}.json`), JSON.stringify(job));
    spawnWorker("explain-worker.mjs", [sessionId, id]);
  } catch (err) {
    console.error("[meanwhile] explain queue:", err?.message || err);
  }
}

/**
 * postToolUse: hand the user's answer to the agent once, as additional context.
 * @returns {{ additional_context?: string }}
 */
function onPostToolUseUnlocked({ conversationId, generationId, tool }) {
  let session = loadSession();
  if (!session || !isRunning(session) || !belongs(session, conversationId, generationId)) return {};
  const entry = tool ? feedEntryFromTool(tool, { root: projectDir() }) : null;
  if (entry && !isRepeat(session.feed, entry)) {
    session = { ...withAlias(session, conversationId), feed: appendFeed(session.feed, entry) };
    saveSession(session);
  }
  const message = constraintMessage(session.question);
  if (!message || session.question.answer.deliveredAt) return {};
  saveSession({ ...session, question: markDelivered(session.question) });
  emitEvent("constraint_delivered", { via: "postToolUse" }, session.id);
  return { additional_context: message };
}

/**
 * stop: if the user answered after the agent's last tool call, send the
 * constraint as a follow-up once; otherwise switch the panel to "Review the diff".
 * @returns {{ followup_message?: string }}
 */
function onCodingAgentStopUnlocked({ conversationId, generationId, status, loopCount = 0 }) {
  const session = loadSession();
  if (!session || !belongs(session, conversationId, generationId)) return {};
  const message = constraintMessage(session.question);
  if (message && !session.question.answer.deliveredAt && loopCount === 0 && status !== "aborted") {
    saveSession({ ...session, question: markDelivered(session.question) });
    emitEvent("constraint_delivered", { via: "stop" }, session.id);
    return { followup_message: message };
  }
  const summary = summarizeChanges(session.files || [], session.source?.prompt);
  saveSession({
    ...session,
    summary,
    codingAgent: {
      ...session.codingAgent,
      status: "stopped",
      stoppedAt: new Date().toISOString(),
      stopStatus: status || "completed",
    },
  });
  appendActivity({ kind: "agent_stop", excerpt: summary });
  emitEvent("coding_agent_stopped", { status, summary }, session.id);
  return {};
}

/** Record the user's pick (MCP / scripts). The extension writes the same shape. */
export function answerQuestion({ choiceId }) {
  const session = loadSession();
  if (!session?.question) return { ok: false, error: "no_question" };
  const question = answerQ(session.question, choiceId);
  if (question === session.question) {
    return { ok: false, error: session.question.answer ? "already_answered" : "unknown_choice" };
  }
  saveAnswer(session.id, choiceId);
  emitEvent("question_answered", { choiceId }, session.id);
  return { ok: true, constraint: question.answer.constraint };
}

const locked =
  (fn) =>
  (...args) =>
    withSessionLock(() => fn(...args));

/** Save only if the session on disk is still the one the caller started with. */
export const updateSession = locked(updateSessionUnlocked);
export const onAgentThought = locked(onAgentThoughtUnlocked);
export const onFileEdit = locked(onFileEditUnlocked);
export const onPostToolUse = locked(onPostToolUseUnlocked);
export const onCodingAgentStop = locked(onCodingAgentStopUnlocked);

export function startDemoSession(prompt, opts) {
  return onPromptSubmitted(
    {
      prompt: prompt || "Add Stripe checkout to this Next.js site with Postgres for orders.",
      conversationId: `demo-${Date.now()}`,
    },
    opts
  );
}
