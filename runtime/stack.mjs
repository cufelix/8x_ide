const TECH = [
  { id: "Stripe", patterns: [/\bstripe\b/i] },
  { id: "Next.js", patterns: [/\bnext\.?js\b/i, /\bapp router\b/i] },
  { id: "React", patterns: [/\breact\b/i] },
  { id: "Prisma", patterns: [/\bprisma\b/i] },
  { id: "Postgres", patterns: [/\bpostgres(?:ql)?\b/i, /\bpsql\b/i] },
  { id: "Supabase", patterns: [/\bsupabase\b/i] },
  { id: "Tailwind", patterns: [/\btailwind\b/i] },
  { id: "TypeScript", patterns: [/\btypescript\b/i, /\bts\b(?=[\s,.])/i] },
  { id: "Auth", patterns: [/\boauth\b/i, /\bauth(?:entication|orization)?\b/i, /\bclerk\b/i, /\bnextauth\b/i] },
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

const IMPORT_HINTS = [
  { id: "Stripe", re: /from ["'](@stripe\/[\w-]+|stripe)["']|require\(["']stripe["']\)/ },
  { id: "Next.js", re: /from ["']next(\/[\w/-]+)?["']/ },
  { id: "React", re: /from ["']react["']/ },
  { id: "Prisma", re: /from ["']@prisma\/client["']/ },
  { id: "Supabase", re: /from ["']@supabase\/[\w-]+["']/ },
  { id: "Redis", re: /from ["'](ioredis|redis)["']/ },
  { id: "GraphQL", re: /from ["'](graphql|@apollo\/[\w-]+)["']/ },
  { id: "Vue", re: /from ["']vue["']/ },
  { id: "Svelte", re: /from ["']svelte(\/[\w-]+)?["']/ },
];

const PATH_HINTS = [
  { id: "Prisma", re: /(^|\/)schema\.prisma$/ },
  { id: "Docker", re: /(^|\/)(Dockerfile|docker-compose\.ya?ml)$/ },
  { id: "Tailwind", re: /(^|\/)tailwind\.config\.[jt]s$/ },
  { id: "Next.js", re: /(^|\/)next\.config\.[mc]?[jt]s$/ },
  { id: "TypeScript", re: /(^|\/)tsconfig\.json$/ },
];

/**
 * Tech the agent actually touched in one edit: imports in the new text and
 * well-known file names. Allowlist only — nothing outside TECH ids.
 * @param {string | null} filePath
 * @param {{ new_string?: string }[]} edits
 */
export function stackFromEdit(filePath, edits = []) {
  const found = [];
  const path = String(filePath || "").replace(/\\/g, "/");
  for (const hint of PATH_HINTS) {
    if (hint.re.test(path)) found.push(hint.id);
  }
  const text = (Array.isArray(edits) ? edits : [])
    .map((e) => String(e?.new_string || ""))
    .join("\n");
  for (const hint of IMPORT_HINTS) {
    if (hint.re.test(text) && !found.includes(hint.id)) found.push(hint.id);
  }
  return found;
}
