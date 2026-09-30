const BUCKETS = {
  short: { secondsMin: 120, secondsMax: 240, label: "~2–4 min" },
  medium: { secondsMin: 300, secondsMax: 600, label: "~5–10 min" },
  long: { secondsMin: 600, secondsMax: 1200, label: "~10–20 min" },
  marathon: { secondsMin: 1200, secondsMax: 2400, label: "~20+ min" },
};

const HEAVY = ["Stripe", "Auth", "Prisma", "Postgres", "Database", "Supabase"];

/**
 * Fast heuristic ETA from the prompt. Never blocks on network or a model.
 * Unclear prompts land in medium. Scope words lengthen. A single-file tweak shortens.
 * @param {string} prompt
 * @param {string[]} stack
 */
export function estimateDuration(prompt, stack = []) {
  const p = String(prompt || "").toLowerCase();
  const signals = [];
  const scopeHits =
    p.match(/\b(refactor|migrate|from scratch|entire|whole|rewrite|all tests)\b/g) ||
    [];
  const broad = scopeHits.length > 0;
  const narrow = /\b(typo|rename|one line|quick fix|tiny|single file|one file|this file)\b/.test(
    p
  );
  const manyPaths = (p.match(/src\/|\.tsx?|\.jsx?|\.py|\.go/g) || []).length >= 3;
  const integration =
    /\b(integrate|integration|checkout|payments?|auth|database|schema)\b/.test(p) ||
    stack.some((item) => HEAVY.includes(item));

  if (narrow) signals.push("narrow-scope");
  if (broad) signals.push("broad-scope");
  if (manyPaths) signals.push("many-paths");
  if (integration) signals.push("integration");
  if (stack.length >= 3) signals.push("multi-stack");
  if (!signals.length) signals.push("default");

  let bucket = "medium";
  if (broad && (scopeHits.length >= 3 || manyPaths || stack.length >= 4)) {
    bucket = "marathon";
  } else if (broad && narrow && !manyPaths) {
    bucket = "medium";
  } else if (broad || manyPaths) {
    bucket = "long";
  } else if (narrow) {
    bucket = "short";
  }

  const meta = BUCKETS[bucket];
  return {
    bucket,
    secondsMin: meta.secondsMin,
    secondsMax: meta.secondsMax,
    label: meta.label,
    confidence: signals.includes("default") ? "low" : "medium",
    signals,
  };
}

export function estimateMidSeconds(estimate) {
  return Math.round((estimate.secondsMin + estimate.secondsMax) / 2);
}
