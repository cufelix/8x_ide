/**
 * Fast heuristic ETA: how much work is in front of the agent.
 * Never blocks on network/LLM. Output is a minute range, e.g. "~6–10 min".
 */

const BROAD_WORDS = /\b(refactor|migrate|from scratch|entire|whole|rewrite|all tests|every)\b/g;

export function formatRange(secondsMin, secondsMax) {
  const lo = Math.round(secondsMin / 60);
  const hi = Math.round(secondsMax / 60);
  return `~${lo}–${hi} min`;
}

function bucketFor(midMinutes) {
  if (midMinutes <= 4) return "short";
  if (midMinutes <= 10) return "medium";
  if (midMinutes <= 20) return "long";
  return "marathon";
}

function scorePrompt(prompt, stack) {
  const p = String(prompt || "").toLowerCase();
  const signals = [];
  let score = 0;

  if (/\b(typo|rename|one line|quick fix|tiny|small tweak)\b/.test(p)) {
    score -= 2;
    signals.push("narrow-scope");
  }
  if (/\b(single file|one file|this file)\b/.test(p)) {
    score -= 1;
    signals.push("single-file");
  }
  const broad = new Set(p.match(BROAD_WORDS) || []);
  if (broad.size) {
    score += Math.min(6, broad.size * 2);
    signals.push("broad-scope");
  }
  if (/\b(integrate|integration|checkout|payments?|auth|login|database|schema|webhooks?)\b/.test(p)) {
    score += 2;
    signals.push("integration");
  }
  if ((p.match(/src\/|\.tsx?\b|\.jsx?\b|\.py\b|\.go\b/g) || []).length >= 3) {
    score += 1;
    signals.push("many-paths");
  }
  if (stack.length >= 3) {
    score += 1;
    signals.push("multi-stack");
  }
  if (stack.some((s) => ["Stripe", "Auth", "Prisma"].includes(s))) {
    score += 1;
    signals.push("heavy-stack");
  }
  if (!signals.length) {
    signals.push("default");
  }
  return { score, signals };
}

/**
 * @param {string} prompt
 * @param {string[]} stack
 */
export function estimateDuration(prompt, stack = []) {
  const { score, signals } = scorePrompt(prompt, stack);
  // Each point is ~1 min up to a medium task, then work compounds.
  const mid = Math.max(3, score <= 3 ? 5 + score : 8 + 2 * (score - 3));
  const secondsMin = Math.max(1, Math.floor(mid * 0.75)) * 60;
  const secondsMax = Math.ceil(mid * 1.25) * 60;
  return {
    bucket: bucketFor(mid),
    secondsMin,
    secondsMax,
    label: formatRange(secondsMin, secondsMax),
    confidence: signals.includes("default") ? "low" : "medium",
    signals,
  };
}

export function estimateMidSeconds(estimate) {
  return Math.round((estimate.secondsMin + estimate.secondsMax) / 2);
}
