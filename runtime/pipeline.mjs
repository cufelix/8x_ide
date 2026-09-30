import { randomUUID } from "node:crypto";
import { loadMeanwhileEnv } from "./env.mjs";
import { estimateDuration } from "./estimate.mjs";
import { generateLesson, generatorId } from "./generators/index.mjs";
import { projectDir } from "./paths.mjs";
import { extractStack, mergeStack } from "./stack.mjs";
import {
  awardXp,
  emitEvent,
  loadPlayer,
  loadSession,
  savePlayer,
  saveSession,
  appendActivity,
} from "./store.mjs";
import { buildWaitPlan } from "./wait-plan.mjs";
import { researchVideos } from "./youtube.mjs";
import { maybeSpeak } from "./voice.mjs";

loadMeanwhileEnv();

function looksLikeMeanwhilePrompt(prompt) {
  const p = String(prompt || "").trim();
  if (!p) {
    return true;
  }
  return /^\/meanwhile\b/i.test(p);
}

export async function onPromptSubmitted({
  prompt,
  conversationId,
  repoHints = [],
}) {
  if (looksLikeMeanwhilePrompt(prompt)) {
    return { skipped: true, reason: "meanwhile-command" };
  }

  const stack = extractStack(prompt);
  const estimate = estimateDuration(prompt, stack);
  const videos = await researchVideos({ stack, prompt });
  const cards = await generateLesson({
    prompt,
    repoHints,
    stack,
    estimate,
    videos,
  });
  const waitPlan = buildWaitPlan({ estimate, videos, cards, stack });

  const session = {
    version: 1,
    id: randomUUID(),
    status: "queued",
    source: {
      prompt: String(prompt || ""),
      conversationId: conversationId || null,
      projectDir: projectDir(),
      capturedAt: new Date().toISOString(),
    },
    generator: {
      id: generatorId(),
      model:
        process.env.MEANWHILE_MODEL ||
        process.env.OPENROUTER_MODEL ||
        (generatorId() === "llm" ? "openai/gpt-4.1-mini" : null),
    },
    stack,
    estimate,
    videos,
    waitPlan,
    cards,
    cursor: 0,
    answers: [],
    codingAgent: {
      status: "running",
      startedAt: new Date().toISOString(),
      stoppedAt: null,
    },
  };

  saveSession(session);
  appendActivity({
    kind: "session_start",
    excerpt: stack.length
      ? `Stack reaction: ${stack.join(", ")} · ${estimate.label}`
      : `Session started · ${estimate.label}`,
  });
  // Non-blocking voice preview (ElevenLabs when keyed).
  const spoken = stack.length
    ? `Meanwhile. About ${estimate.label.replace("~", "")}. Looking at ${stack.slice(0, 3).join(", ")}.`
    : `Meanwhile. Estimated wait ${estimate.label}.`;
  void maybeSpeak(spoken);
  emitEvent(
    "prompt_submitted",
    { conversationId: session.source.conversationId, stack, estimate },
    session.id
  );
  emitEvent("lesson_queued", { cardCount: cards.length }, session.id);
  return { skipped: false, session };
}

export function onCodingSessionStart({ conversationId }) {
  const session = loadSession();
  if (!session || session.status === "completed") {
    return { skipped: true };
  }
  if (!session.codingAgent?.startedAt) {
    session.codingAgent = {
      ...session.codingAgent,
      status: "running",
      startedAt: new Date().toISOString(),
    };
    saveSession(session);
  }
  emitEvent("coding_session_start", { conversationId }, session.id);
  return { skipped: false, session };
}

export function onCodingAgentStop({ conversationId, status }) {
  const session = loadSession();
  if (!session) {
    return { skipped: true };
  }
  const matches =
    !session.source.conversationId ||
    session.source.conversationId === conversationId;
  if (!matches) {
    return { skipped: true, reason: "other-conversation" };
  }
  session.codingAgent = {
    ...session.codingAgent,
    status: "stopped",
    stoppedAt: new Date().toISOString(),
    stopStatus: status || "completed",
  };
  session.status =
    session.status === "completed" ? "completed" : session.status;
  saveSession(session);
  appendActivity({
    kind: "agent_stop",
    excerpt: "Agent finished — review the diff before you close Meanwhile.",
  });
  emitEvent("coding_agent_stopped", { status }, session.id);
  return { skipped: false, session };
}

/**
 * Enrich session from live agent thoughts (stack + activity).
 */
export function onAgentThought({ thought, conversationId }) {
  const excerpt = thought ? String(thought).slice(0, 400) : null;
  appendActivity({ kind: "thought", excerpt });

  const session = loadSession();
  if (!session || session.codingAgent?.status === "stopped") {
    return { skipped: !session, session };
  }
  if (
    session.source.conversationId &&
    conversationId &&
    session.source.conversationId !== conversationId
  ) {
    return { skipped: true, reason: "other-conversation" };
  }

  const found = extractStack(excerpt || "");
  if (found.length) {
    session.stack = mergeStack(session.stack || [], found);
    saveSession(session);
  }
  return { skipped: false, session };
}

export function onFileEdit({ path: filePath, tool }) {
  appendActivity({
    kind: "file_edit",
    path: filePath || null,
    tool: tool || null,
    excerpt: filePath ? `Editing ${filePath}` : "Editing a file",
  });
  return { ok: true };
}

export function startLesson() {
  const session = loadSession();
  if (!session) {
    return { ok: false, error: "no_session" };
  }
  if (session.status === "queued" || session.status === "idle") {
    session.status = "active";
    saveSession(session);
    emitEvent("lesson_started", { cursor: session.cursor }, session.id);
  }
  return { ok: true, session };
}

export function currentCard(session = loadSession()) {
  if (!session) {
    return null;
  }
  return session.cards[session.cursor] ?? null;
}

export function submitAnswer({ choiceId, text }) {
  const session = loadSession();
  if (!session) {
    return { ok: false, error: "no_session" };
  }
  if (session.status === "queued" || session.status === "idle") {
    session.status = "active";
  }
  if (session.status !== "active") {
    return { ok: false, error: "no_active_session" };
  }
  const card = currentCard(session);
  if (!card) {
    return { ok: false, error: "no_card" };
  }

  const correct =
    card.expectedChoiceId == null
      ? null
      : choiceId === card.expectedChoiceId;

  session.answers.push({
    cardId: card.id,
    choiceId: choiceId ?? null,
    text: text ?? null,
    correct,
    at: new Date().toISOString(),
  });
  session.cursor += 1;
  if (session.waitPlan) {
    session.waitPlan.cursor = Math.min(
      (session.waitPlan.cursor || 0) + 1,
      session.waitPlan.segments.length
    );
  }
  saveSession(session);
  emitEvent(
    "card_answered",
    { cardId: card.id, kind: card.kind, correct, xp: card.xp },
    session.id
  );
  return { ok: true, session, card, correct };
}

export function completeSession() {
  const session = loadSession();
  if (!session) {
    return { ok: false, error: "no_session" };
  }
  session.status = "completed";
  saveSession(session);

  const earned = session.answers.reduce((sum, answer) => {
    const card = session.cards.find((item) => item.id === answer.cardId);
    if (!card) {
      return sum;
    }
    if (answer.correct === false) {
      return sum + Math.floor(card.xp / 2);
    }
    return sum + card.xp;
  }, 0);

  const player = awardXp(loadPlayer(), earned);
  player.lessonsCompleted += 1;
  savePlayer(player);
  emitEvent("lesson_completed", { xp: earned }, session.id);
  return { ok: true, session, player, xp: earned };
}

/** Manual / demo entry: same as prompt submit. */
export async function startDemoSession(prompt) {
  return onPromptSubmitted({
    prompt:
      prompt ||
      "Add Stripe checkout to this Next.js site with Postgres for orders.",
    conversationId: `demo-${Date.now()}`,
    repoHints: [],
  });
}
