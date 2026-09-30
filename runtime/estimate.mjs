const BUCKETS = {
  short: { secondsMin: 120, secondsMax: 240, label: "~2–4 min" },
  medium: { secondsMin: 300, secondsMax: 600, label: "~5–10 min" },
  long: { secondsMin: 600, secondsMax: 1200, label: "~10–20 min" },
  marathon: { secondsMin: 1200, secondsMax: 2400, label: "~20+ min" },
};

/**
 * Fast heuristic ETA from the prompt. Never blocks on network/LLM.
 * @param {string} prompt
 * @param {string[]} stack
 */
export function estimateDuration(prompt, stack = []) {
  const p = String(prompt || "").toLowerCase();
  const signals = [];
  let score = 0;

  if (/\b(typo|rename|rename only|one line|quick fix|tiny)\b/.test(p)) {
    score -= 2;
    signals.push("narrow-scope");
  }
  if (/\b(single file|one file|this file)\b/.test(p)) {
    score -= 1;
    signals.push("single-file");
  }
  if (/\b(refactor|migrate|from scratch|entire|whole|rewrite|all tests)\b/.test(p)) {
    score += 3;
    signals.push("broad-scope");
  }
  if (/\b(integrate|integration|checkout|payments?|auth|database|schema)\b/.test(p)) {
    score += 2;
    signals.push("integration");
  }
  if ((p.match(/src\/|\.tsx?|\.jsx?|\.py|\.go/g) || []).length >= 3) {
    score += 1;
    signals.push("many-paths");
  }
  if (stack.length >= 3) {
    score += 1;
    signals.push("multi-stack");
  }
  if (stack.includes("Stripe") || stack.includes("Auth") || stack.includes("Prisma")) {
    score += 1;
    signals.push("heavy-stack");
  }
  if (signals.length === 0) {
    signals.push("default");
  }

  let bucket = "medium";
  if (score <= -1) {
    bucket = "short";
  } else if (score >= 5) {
    bucket = "marathon";
  } else if (score >= 2) {
    bucket = "long";
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
