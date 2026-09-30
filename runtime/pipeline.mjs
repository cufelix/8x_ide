import { randomUUID } from "node:crypto";
import { generateLesson, generatorId } from "./generators/index.mjs";
import { projectDir } from "./paths.mjs";
import {
  awardXp,
  emitEvent,
  loadPlayer,
  loadSession,
  savePlayer,
  saveSession,
} from "./store.mjs";

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

  const cards = await generateLesson({ prompt, repoHints });
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
      model: process.env.MEANWHILE_MODEL || null,
    },
    cards,
    cursor: 0,
    answers: [],
    codingAgent: {
      status: "running",
      stoppedAt: null,
    },
  };

  saveSession(session);
  emitEvent(
    "prompt_submitted",
    { conversationId: session.source.conversationId },
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
    status: "stopped",
    stoppedAt: new Date().toISOString(),
    stopStatus: status || "completed",
  };
  saveSession(session);
  emitEvent("coding_agent_stopped", { status }, session.id);
  return { skipped: false, session };
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
  if (!session || session.status !== "active") {
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
