export interface Estimate {
  bucket: "short" | "medium" | "long" | "marathon";
  secondsMin: number;
  secondsMax: number;
  /** "~6–10 min" */
  label: string;
  confidence: "low" | "medium";
  signals: string[];
}

export interface VideoItem {
  videoId: string;
  title: string;
  channel: string;
  url: string;
  query: string;
  /** null when the source did not say; such clips sort last. */
  durationSec: number | null;
  source: "curated" | "youtube-api" | "yt-dlp" | "results-page";
}

export interface QuestionChoice {
  id: string;
  label: string;
  /** The sentence handed to the agent and shown once collapsed. */
  constraint: string;
}

export interface Question {
  id: string;
  kicker: "Only you can decide";
  title: string;
  body: string;
  choices: QuestionChoice[]; // exactly 3
  answer: null | {
    choiceId: string;
    label: string;
    constraint: string;
    at: string;
    /** Set once postToolUse / stop handed it to the agent. */
    deliveredAt: string | null;
  };
}

/** .meanwhile/session.json — written only by hooks. */
export interface Session {
  version: 2;
  id: string;
  source: {
    prompt: string;
    conversationId: string | null;
    projectDir: string;
    capturedAt: string;
  };
  stack: string[];
  estimate: Estimate;
  /** Ordered: first clip fits the estimate; the rest is Up next. */
  videos: VideoItem[];
  question: Question | null;
  activity: { line: string; at: string };
  files: { path: string; isNew: boolean }[];
  /** "Checkout route added, 4 files" once the agent stops. */
  summary: string | null;
  codingAgent: {
    status: "running" | "stopped";
    startedAt: string;
    stoppedAt: string | null;
    stopStatus?: string;
  };
}

/** .meanwhile/answer.json — written only by the panel / MCP. */
export interface AnswerFile {
  sessionId: string;
  choiceId: string;
  at: string;
}
