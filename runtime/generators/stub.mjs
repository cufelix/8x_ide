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
    media: partial.media ?? { type: "none" },
    durationSec: partial.durationSec ?? 60,
    contextRefs: partial.contextRefs ?? [],
  };
}

/**
 * Stack-aware lesson cards. Count scales with estimate mid-seconds.
 */
export function generateLesson({
  prompt,
  repoHints = [],
  stack = [],
  estimate = null,
  videos = [],
}) {
  const summary = clip(prompt, 240);
  const primary = stack[0] || "this stack";
  const secondary = stack[1] || null;
  const mid = estimate
    ? Math.round((estimate.secondsMin + estimate.secondsMax) / 2)
    : 480;
  const maxCards = Math.max(2, Math.min(6, Math.ceil(mid / 90)));

  const cards = [
    card({
      id: "explain-intent",
      kind: "explain",
      title: "What the agent is doing",
      body: `Working from:\n\n“${summary}”\n\n${
        stack.length
          ? `Detected stack: ${stack.join(", ")}.`
          : "No stack keywords detected yet — watch activity for clues."
      }`,
      xp: 10,
      durationSec: 50,
      media: videos[0]
        ? { type: "video", ref: videos[0].videoId }
        : { type: "none" },
    }),
    card({
      id: "decision-scope",
      kind: "decision",
      title: "Only you can decide",
      body: `While the agent ${
        stack.length ? `wires ${primary}` : "implements"
      }, pick the constraint it cannot infer from the repo alone.`,
      choices: [
        { id: "ship-thin", label: "Ship the thinnest vertical slice" },
        { id: "keep-compat", label: "Preserve existing behavior even if slower" },
        { id: "optimize-later", label: "Prefer clean internals; polish later" },
      ],
      xp: 20,
      durationSec: 45,
    }),
  ];

  if (secondary) {
    cards.push(
      card({
        id: "teach-compare",
        kind: "teach",
        title: `${primary} vs the alternative`,
        body: `You are committing to ${primary}${
          secondary ? ` alongside ${secondary}` : ""
        }. When would you pick something else instead?`,
        choices: [
          {
            id: "simpler",
            label: "When a simpler hosted alternative is enough",
          },
          { id: "scale", label: "Only when you already know you need scale" },
          { id: "never", label: "Never — stick with the agent's first pick" },
        ],
        expectedChoiceId: "simpler",
        xp: 15,
        durationSec: 60,
      })
    );
  }

  cards.push(
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
      durationSec: 45,
    })
  );

  if (maxCards > 4) {
    cards.push(
      card({
        id: "teach-verify",
        kind: "teach",
        title: "Verify first",
        body: `This change will touch ${repoHints[0] || "this repository"}. Which failure mode do you check first?`,
        choices: [
          { id: "happy-path", label: "The happy path the prompt named" },
          { id: "adjacent", label: "An adjacent flow that shares state" },
          { id: "empty-error", label: "Empty / error states" },
        ],
        expectedChoiceId: "adjacent",
        xp: 15,
        durationSec: 55,
      })
    );
  }

  return cards.slice(0, maxCards);
}
