const TECH = [
  { id: "Stripe", patterns: [/\bstripe\b/i] },
  { id: "Next.js", patterns: [/\bnext\.?js\b/i, /\bapp router\b/i] },
  { id: "React", patterns: [/\breact\b/i] },
  { id: "Prisma", patterns: [/\bprisma\b/i] },
  { id: "Postgres", patterns: [/\bpostgres(?:ql)?\b/i, /\bpsql\b/i] },
  { id: "Supabase", patterns: [/\bsupabase\b/i] },
  { id: "Tailwind", patterns: [/\btailwind\b/i] },
  { id: "TypeScript", patterns: [/\btypescript\b/i] },
  { id: "Auth", patterns: [/\boauth\b/i, /\bauth(?:entication|orization)?\b/i, /\bclerk\b/i, /\bnextauth\b/i] },
  { id: "Database", patterns: [/\bdatabase\b/i] },
  { id: "Docker", patterns: [/\bdocker\b/i, /\bdockerfile\b/i] },
  { id: "Redis", patterns: [/\bredis\b/i] },
  { id: "GraphQL", patterns: [/\bgraphql\b/i] },
  { id: "Node.js", patterns: [/\bnode\.?js\b/i, /\bexpress\b/i] },
  { id: "Vue", patterns: [/\bvue(?:\.js)?\b/i, /\bnuxt\b/i] },
  { id: "Svelte", patterns: [/\bsvelte(?:kit)?\b/i] },
];

/**
 * @param {string} text
 * @returns {string[]}
 */
export function extractStack(text) {
  const raw = String(text || "");
  const found = [];
  for (const tech of TECH) {
    if (tech.patterns.some((re) => re.test(raw))) {
      found.push(tech.id);
    }
  }
  return found;
}

/**
 * @param {string[]} current
 * @param {string[]} next
 */
export function mergeStack(current = [], next = []) {
  const out = [...current];
  for (const item of next) {
    if (!out.includes(item)) {
      out.push(item);
    }
  }
  return out;
}
