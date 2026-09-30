export type CardKind = "explain" | "decision" | "teach" | "quiz" | "video";

export interface Choice {
  id: string;
  label: string;
}

export interface Card {
  id: string;
  kind: CardKind;
  variant: string;
  title: string;
  body: string;
  choices: Choice[] | null;
  expectedChoiceId: string | null;
  xp: number;
  media: { type: "none" | "video"; ref?: string };
  contextRefs: string[];
}

export interface LessonSession {
  version: 1;
  id: string;
  status: "idle" | "queued" | "active" | "completed" | "abandoned";
  source: {
    prompt: string;
    conversationId: string | null;
    projectDir: string;
    capturedAt: string;
  };
  generator: { id: "stub" | "llm"; model: string | null };
  cards: Card[];
  cursor: number;
  answers: Array<{
    cardId: string;
    choiceId: string | null;
    text: string | null;
    correct: boolean | null;
    at: string;
  }>;
  codingAgent: {
    status: "running" | "stopped";
    stoppedAt: string | null;
    stopStatus?: string;
  };
}

export interface Player {
  version: 1;
  xp: number;
  streakDays: number;
  lastActiveDate: string | null;
  lessonsCompleted: number;
}

export interface MeanwhileEvent {
  ts: string;
  type: string;
  sessionId: string | null;
  payload: Record<string, unknown>;
}
