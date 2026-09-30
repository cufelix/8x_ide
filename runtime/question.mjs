/**
 * One question per run: a constraint the repo cannot answer.
 * The answer is handed back to the agent (see hooks/post-tool-use.mjs).
 */

export const KICKER = "Only you can decide";
export const CONSTRAINT_PREFIX = "Meanwhile — constraint set by the user";

const BANK = [
  {
    id: "stripe-surface",
    when: ({ stack, prompt }) =>
      stack.includes("Stripe") || /\b(checkout|payments?|billing)\b/i.test(prompt),
    title: "Where should customers pay?",
    body: "The repo does not say whether checkout leaves your site.",
    choices: [
      { id: "hosted", label: "Stripe-hosted Checkout", constraint: "Customers pay on a Stripe-hosted Checkout page" },
      { id: "embedded", label: "Embedded form on our page", constraint: "Customers pay in an embedded form on our own page" },
      { id: "links", label: "Payment Links, no code", constraint: "Use Stripe Payment Links, no custom checkout code" },
    ],
  },
  {
    id: "auth-methods",
    when: ({ stack, prompt }) => stack.includes("Auth") || /\b(login|sign[ -]?in|sign[ -]?up)\b/i.test(prompt),
    title: "Who can sign in, and how?",
    body: "Sign-in methods are a product call, not something in the code.",
    choices: [
      { id: "email", label: "Email and password", constraint: "Sign-in is email and password" },
      { id: "social", label: "Google and GitHub only", constraint: "Sign-in is Google and GitHub OAuth only" },
      { id: "magic", label: "Magic link only", constraint: "Sign-in is passwordless magic link only" },
    ],
  },
  {
    id: "data-safety",
    when: ({ stack, prompt }) =>
      stack.some((s) => ["Postgres", "Prisma", "Supabase"].includes(s)) &&
      /\b(schema|migrat\w*|table|column|model)\b/i.test(prompt),
    title: "What happens to existing data?",
    body: "The agent cannot tell whether the data in this database matters.",
    choices: [
      { id: "migrate", label: "Keep it, write a migration", constraint: "Keep existing data; ship a forward migration" },
      { id: "reset", label: "Dev data, reset is fine", constraint: "Existing data is disposable dev data; resetting is fine" },
      { id: "additive", label: "Only add, never alter", constraint: "Only add new tables or columns; never alter existing ones" },
    ],
  },
  {
    id: "scope-care",
    when: ({ estimate }) => estimate?.signals?.includes("broad-scope"),
    title: "How careful should this change be?",
    body: "Pick the constraint the agent cannot infer from the repo alone.",
    choices: [
      { id: "keep-compat", label: "Keep behavior identical", constraint: "Preserve existing behavior exactly, even if slower" },
      { id: "ship-thin", label: "Thinnest working slice", constraint: "Ship the thinnest working slice first" },
      { id: "clean", label: "Clean internals first", constraint: "Prefer clean internals; polish the surface later" },
    ],
  },
];

function fresh(entry) {
  return {
    id: entry.id,
    kicker: KICKER,
    title: entry.title,
    body: entry.body,
    choices: entry.choices.map((c) => ({ ...c })),
    answer: null,
  };
}

/**
 * @param {{ prompt: string, stack: string[], estimate: object }} input
 */
export function questionFor({ prompt = "", stack = [], estimate = null }) {
  if (estimate?.bucket === "short") return null;
  const hit = BANK.find((entry) => entry.when({ prompt, stack, estimate }));
  return hit ? fresh(hit) : null;
}

/** Validate a model-proposed question; exactly three choices. */
export function normalizeQuestion(raw) {
  if (!raw || typeof raw !== "object" || !raw.title) return null;
  const choices = (Array.isArray(raw.choices) ? raw.choices : [])
    .filter((c) => c && c.label)
    .slice(0, 3)
    .map((c, i) => {
      const label = String(c.label).slice(0, 40);
      return {
        id: String(c.id || `c${i + 1}`).slice(0, 40),
        label,
        constraint: String(c.constraint || label).slice(0, 160),
      };
    });
  if (choices.length !== 3) return null;
  return {
    id: String(raw.id || "llm-question").slice(0, 40),
    kicker: KICKER,
    title: String(raw.title).slice(0, 80),
    body: String(raw.body || "").slice(0, 200),
    choices,
    answer: null,
  };
}

export function answerQuestion(question, choiceId, now = new Date()) {
  if (!question || question.answer) return question;
  const choice = question.choices.find((c) => c.id === choiceId);
  if (!choice) return question;
  return {
    ...question,
    answer: {
      choiceId: choice.id,
      label: choice.label,
      constraint: choice.constraint,
      at: now.toISOString(),
      deliveredAt: null,
    },
  };
}

export function markDelivered(question, now = new Date()) {
  if (!question?.answer) return question;
  return { ...question, answer: { ...question.answer, deliveredAt: now.toISOString() } };
}

export function constraintMessage(question) {
  if (!question?.answer) return null;
  return [
    `${CONSTRAINT_PREFIX} for the rest of this run:`,
    `${question.answer.constraint}.`,
    `(They were asked: "${question.title}")`,
    "Follow it; adjust anything already written that conflicts with it.",
  ].join(" ");
}
