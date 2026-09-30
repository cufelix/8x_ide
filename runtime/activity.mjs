/**
 * Plain-language activity: turn file edits and agent thoughts into one short
 * line ("wiring the checkout route"), and a stop-time summary
 * ("Checkout route added, 4 files").
 */

const MAX_LINE = 60;
const DOUBLING = new Set(["set", "run", "get", "put", "plan", "stop", "map", "wrap", "ship"]);

function segmentsOf(filePath) {
  return String(filePath).replace(/\\/g, "/").split("/").filter(Boolean);
}

function stripExt(name) {
  return name.replace(/\.[^.]+$/, "");
}

function meaningful(segments) {
  return segments.filter((s) => !/^[[(].*[\])]$/.test(s) && s !== "src");
}

/**
 * What a file is, as a noun phrase plus the verb used while working on it.
 * @returns {{ noun: string, verb: string, rank: number } | null}
 */
export function subjectForPath(filePath) {
  if (!filePath) return null;
  const segs = segmentsOf(filePath);
  const base = segs[segs.length - 1] || "";
  const dirs = meaningful(segs.slice(0, -1));
  const lower = base.toLowerCase();

  if (/\.(test|spec)\.[jt]sx?$/.test(lower) || dirs.includes("__tests__")) {
    return { noun: `${base.replace(/\.(test|spec)\.[jt]sx?$/, "")} tests`, verb: "writing", rank: 3 };
  }
  if (/^route\.[jt]s$/.test(lower) && dirs.length) {
    return { noun: `${dirs[dirs.length - 1]} route`, verb: "wiring", rank: 1 };
  }
  const apiIdx = dirs.lastIndexOf("api");
  if (apiIdx !== -1 && /\.[jt]s$/.test(lower)) {
    return { noun: `${stripExt(base)} route`, verb: "wiring", rank: 1 };
  }
  if (/^page\.[jt]sx?$/.test(lower)) {
    const parent = dirs[dirs.length - 1];
    const name = !parent || parent === "app" ? "home" : parent;
    return { noun: `${name} page`, verb: "building", rank: 1 };
  }
  if (dirs.includes("components") && /\.[jt]sx?$|\.vue$|\.svelte$/.test(lower)) {
    return { noun: `${stripExt(base)} component`, verb: "editing", rank: 2 };
  }
  if (lower === "schema.prisma" || dirs.includes("migrations")) {
    return { noun: "database schema", verb: "updating", rank: 2 };
  }
  if (lower === "package.json" || /lock/.test(lower)) {
    return { noun: "dependencies", verb: "updating", rank: 4 };
  }
  if (lower.startsWith(".env")) {
    return { noun: "environment config", verb: "updating", rank: 4 };
  }
  return { noun: base, verb: "editing", rank: 3, bare: true };
}

export function describeEdit(filePath) {
  const subject = subjectForPath(filePath);
  if (!subject) return null;
  return subject.bare
    ? `${subject.verb} ${subject.noun}`
    : `${subject.verb} the ${subject.noun}`;
}

function gerund(verb) {
  const v = verb.toLowerCase();
  if (v.endsWith("ing")) return v;
  if (DOUBLING.has(v)) return `${v}${v.slice(-1)}ing`;
  if (/[^e]e$/.test(v)) return `${v.slice(0, -1)}ing`;
  return `${v}ing`;
}

function clipLine(text) {
  if (text.length <= MAX_LINE) return text;
  const cut = text.slice(0, MAX_LINE - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > 20 ? cut.slice(0, space) : cut).replace(/[\s,;:]+$/, "")}…`;
}

export function describeThought(thought) {
  const raw = String(thought || "").trim();
  if (!raw || /```|[{};]\s*$/m.test(raw)) return null;

  let line = raw.split(/(?<=[.!?])\s+|\n/)[0].replace(/[.!?:]+$/, "").trim();
  line = line.replace(/^((now|next|first|then|okay|ok|so|alright|great)[,]?\s+)+/i, "");

  const intent = line.match(
    /^(let me|let's|i'll|i will|i'm going to|i am going to|i need to|i should|i want to|i must|i can)\s+(\w+)(.*)$/i
  );
  if (intent) {
    line = `${gerund(intent[2])}${intent[3]}`;
  } else {
    line = line.replace(/^(i am|i'm)\s+/i, "");
    if (/^[A-Z][a-z]+ing\b/.test(line)) {
      line = line[0].toLowerCase() + line.slice(1);
    }
  }
  if (line.length < 8) return null;
  return clipLine(line);
}

function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function promptRank(noun, prompt) {
  const word = noun.split(" ")[0].toLowerCase();
  const at = String(prompt || "").toLowerCase().indexOf(word);
  return at === -1 ? Infinity : at;
}

/**
 * The main change: the most central kind of file (route, page, component…);
 * among equals, the one the prompt names first.
 * @param {{ path: string, isNew?: boolean }[]} files
 * @param {string} [prompt]
 */
export function summarizeChanges(files, prompt = "") {
  const list = (files || []).filter((f) => f && f.path);
  if (!list.length) return "No files changed";
  let best = null;
  for (const file of list) {
    const subject = subjectForPath(file.path);
    if (!subject) continue;
    const mention = promptRank(subject.noun, prompt);
    if (
      !best ||
      subject.rank < best.subject.rank ||
      (subject.rank === best.subject.rank && mention < best.mention)
    ) {
      best = { file, subject, mention };
    }
  }
  const count = `${list.length} ${list.length === 1 ? "file" : "files"}`;
  const verb = best.file.isNew ? "added" : "updated";
  return `${capitalize(best.subject.noun)} ${verb}, ${count}`;
}
