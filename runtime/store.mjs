import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { answerQuestion } from "./question.mjs";
import {
  activityPath,
  answerPath,
  ensureMeanwhileDir,
  eventsPath,
  lockPath,
  sessionPath,
} from "./paths.mjs";

export function readJson(path, fallback) {
  if (!existsSync(path)) {
    return fallback;
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJson(path, value) {
  ensureMeanwhileDir();
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

export function appendJsonl(path, value) {
  ensureMeanwhileDir();
  appendFileSync(path, `${JSON.stringify(value)}\n`, "utf8");
}

/**
 * The panel writes the user's pick to answer.json (it never writes
 * session.json), so hooks and the panel cannot overwrite each other.
 */
export function withAnswer(session, answer) {
  if (!session?.question || session.question.answer) return session;
  if (!answer || answer.sessionId !== session.id) return session;
  const at = Date.parse(answer.at);
  const question = answerQuestion(session.question, answer.choiceId, Number.isFinite(at) ? new Date(at) : new Date());
  return question === session.question ? session : { ...session, question };
}

export function loadSession() {
  return withAnswer(readJson(sessionPath(), null), readJson(answerPath(), null));
}

export function saveAnswer(sessionId, choiceId, now = new Date()) {
  writeJson(answerPath(), { sessionId, choiceId, at: now.toISOString() });
}

export function saveSession(session) {
  writeJson(sessionPath(), session);
}

const LOCK_WAIT_MS = 2000;
const LOCK_STALE_MS = 5000;
const pause = new Int32Array(new SharedArrayBuffer(4));

function tryLock(path) {
  try {
    mkdirSync(path);
    return true;
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
    try {
      if (Date.now() - statSync(path).mtimeMs > LOCK_STALE_MS) rmSync(path, { recursive: true, force: true });
    } catch {
      // Another process just released or reclaimed it; retry.
    }
    return false;
  }
}

/**
 * Serialize load→modify→save of session.json across hook processes.
 * Gives up waiting after LOCK_WAIT_MS and runs anyway: a hook must never
 * hold the agent up.
 */
export function withSessionLock(fn) {
  ensureMeanwhileDir();
  const path = lockPath();
  const deadline = Date.now() + LOCK_WAIT_MS;
  let locked = tryLock(path);
  while (!locked && Date.now() < deadline) {
    Atomics.wait(pause, 0, 0, 15);
    locked = tryLock(path);
  }
  if (!locked) console.error("[meanwhile] session lock busy; continuing without it");
  try {
    return fn();
  } finally {
    if (locked) rmSync(path, { recursive: true, force: true });
  }
}

export function emitEvent(type, payload = {}, sessionId) {
  const event = {
    ts: new Date().toISOString(),
    type,
    sessionId: sessionId ?? loadSession()?.id ?? null,
    payload,
  };
  appendJsonl(eventsPath(), event);
  return event;
}

export function appendActivity(entry) {
  appendJsonl(activityPath(), {
    ts: new Date().toISOString(),
    ...entry,
  });
}

export function readActivityTail(limit = 40) {
  if (!existsSync(activityPath())) {
    return [];
  }
  try {
    const lines = readFileSync(activityPath(), "utf8")
      .trim()
      .split("\n")
      .filter(Boolean);
    return lines.slice(-limit).map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return [];
  }
}
