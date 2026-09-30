import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { dirname, join, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { describeEdit, describeThought, summarizeChanges } from "./activity.mjs";
import { loadMeanwhileEnv } from "./env.mjs";
import { estimateDuration } from "./estimate.mjs";
import { projectDir } from "./paths.mjs";
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

/** A hook from another chat must not touch this run. */
function belongs(session, conversationId) {
  return (
    !session?.source?.conversationId ||
    !conversationId ||
    session.source.conversationId === conversationId
  );
}

function isRunning(session) {
  return session?.codingAgent?.status === "running";
}

/**
 * Prompt hook: write a complete session from local data only (no network),
 * then hand network work to a detached enrich process.
 */
export function onPromptSubmitted({ prompt, conversationId }, { enrich = true } = {}) {
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
      projectDir: projectDir(),
      capturedAt: now,
    },
    stack,
    estimate,
    videos: orderForEstimate(curatedForStack(stack), estimate),
    question: questionFor({ prompt, stack, estimate }),
    activity: { line: "reading the request", at: now },
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
  if (process.env.MEANWHILE_NO_ENRICH === "1") return;
  try {
    const child = spawn(process.execPath, [join(here, "enrich.mjs"), sessionId], {
      cwd: projectDir(),
      env: { ...process.env, CURSOR_PROJECT_DIR: projectDir() },
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch (err) {
    console.error("[meanwhile] enrich spawn:", err?.message || err);
  }
}

function updateSessionUnlocked(sessionId, update) {
  const session = loadSession();
  if (!session || session.id !== sessionId) return null;
  const next = update(session);
  if (next && next !== session) saveSession(next);
  return next;
}

export function onCodingSessionStart({ conversationId }) {
  const session = loadSession();
  if (!session || !belongs(session, conversationId)) return { skipped: true };
  emitEvent("coding_session_start", { conversationId }, session.id);
  return { skipped: false, session };
}

function onAgentThoughtUnlocked({ thought, conversationId }) {
  const line = describeThought(thought);
  const session = loadSession();
  if (!session || !isRunning(session) || !belongs(session, conversationId) || !line) {
    return { skipped: true };
  }
  const next = { ...session, activity: { line, at: new Date().toISOString() } };
  saveSession(next);
  appendActivity({ kind: "thought", excerpt: line });
  return { skipped: false, session: next };
}

function toProjectPath(filePath) {
  if (!filePath) return null;
  return isAbsolute(filePath) ? relative(projectDir(), filePath) || filePath : filePath;
}

function onFileEditUnlocked({ path: filePath, edits = [], conversationId }) {
  const rel = toProjectPath(filePath);
  const session = loadSession();
  if (!rel || !session || !isRunning(session) || !belongs(session, conversationId)) {
    return { skipped: true };
  }
  const list = Array.isArray(edits) ? edits : [];
  const isNew = list.length > 0 && list.every((e) => !e?.old_string);
  const files = session.files || [];
  const known = files.find((f) => f.path === rel);
  const line = describeEdit(rel);
  const next = {
    ...session,
    stack: mergeStack(session.stack || [], stackFromEdit(rel, list)),
    files: known ? files : [...files, { path: rel, isNew }],
    activity: line ? { line, at: new Date().toISOString() } : session.activity,
  };
  saveSession(next);
  appendActivity({ kind: "file_edit", path: rel, excerpt: line });
  return { skipped: false, session: next };
}

/**
 * postToolUse: hand the user's answer to the agent once, as additional context.
 * @returns {{ additional_context?: string }}
 */
function onPostToolUseUnlocked({ conversationId }) {
  const session = loadSession();
  if (!session || !isRunning(session) || !belongs(session, conversationId)) return {};
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
function onCodingAgentStopUnlocked({ conversationId, status, loopCount = 0 }) {
  const session = loadSession();
  if (!session || !belongs(session, conversationId)) return {};
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
