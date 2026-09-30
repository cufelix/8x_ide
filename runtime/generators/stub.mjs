function clip(text, max = 280) {
  const trimmed = String(text || "").trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max - 1)}…`;
}

function card(partial) {
  return {
    id: partial.id,
    kind: partial.kind,
    variant: process.env.MEANWHILE_LESSON_VARIANT || "cards-v1",
    title: partial.title,
    body: partial.body,
    choices: partial.choices ?? null,
    expectedChoiceId: partial.expectedChoiceId ?? null,
    xp: partial.xp,
    media: { type: "none" },
    contextRefs: partial.contextRefs ?? [],
  };
}

/**
 * Deterministic cards from the captured prompt. Swap via generators/index.mjs.
 */
export function generateLesson({ prompt, repoHints = [] }) {
  const summary = clip(prompt, 240);
  const hint = repoHints[0] || "this repository";

  return [
    card({
      id: "explain-intent",
      kind: "explain",
      title: "What the agent is doing",
      body: `The coding agent is working from this ask:\n\n“${summary}”\n\nYour job on this card: name the outcome you will own when it comes back.`,
      xp: 10,
    }),
    card({
      id: "decision-scope",
      kind: "decision",
      title: "Only you can decide",
      body: "While the agent implements, pick the constraint it cannot infer from the repo alone.",
      choices: [
        { id: "ship-thin", label: "Ship the thinnest vertical slice" },
        { id: "keep-compat", label: "Preserve existing behavior even if slower" },
        { id: "optimize-later", label: "Prefer clean internals; polish later" },
      ],
      xp: 20,
    }),
    card({
      id: "teach-system",
      kind: "teach",
      title: "The system you are about to own",
      body: `This change will live in ${hint}. Which failure mode should you verify first when the agent stops?`,
      choices: [
        { id: "happy-path", label: "The happy path the prompt named" },
        { id: "adjacent", label: "An adjacent flow that shares state" },
        { id: "empty-error", label: "Empty / error states" },
      ],
      expectedChoiceId: "adjacent",
      xp: 15,
    }),
    card({
      id: "quiz-ownership",
      kind: "quiz",
      title: "Ownership check",
      body: "When the agent finishes, what is *not* a substitute for you reading the diff?",
      choices: [
        { id: "summary", label: "The agent's summary of what it did" },
        { id: "tests", label: "Tests it added that you run yourself" },
        { id: "walkthrough", label: "You walking the user path" },
      ],
      expectedChoiceId: "summary",
      xp: 15,
    }),
    card({
      id: "explain-wait",
      kind: "explain",
      title: "Why this wait exists",
      body: "Long agent runs are a feature, not a loading spinner. Use them to lock decisions and mental models so review is cheap.",
      xp: 10,
    }),
  ];
}
