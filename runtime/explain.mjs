/**
 * Live explanation of one edit: what the new code does, in plain language,
 * plus the programming idea behind it (used as a YouTube query).
 * explainFromFacts works offline from the file itself; explainWithLlm is the
 * OpenRouter pass and returns null on no key or any failure.
 */
import { questionModel } from "./question-llm.mjs";

export const EXPLAIN_MAX = 8;
const CHANGE_CHARS = 2400;
const FILE_CHARS = 3200;

const SYSTEM = `You narrate a coding agent's work for the developer watching it. You get the developer's task, one file the agent just edited, the changed code, and part of the file.
Explain what this code now does and how it serves the task, for a developer who has not read it. Plain words, concrete (name the functions, routes, fields), no filler, no praise, no "This code". At most 2 short sentences and 35 words in total.
Also name the one programming concept a short YouTube explainer would teach here (3-6 words, e.g. "Stripe webhook signature verification"), or null if it is trivial.
Return ONLY JSON: {"explanation": "...", "concept": "..." | null}`;

function list(words) {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

function packageOf(spec) {
  if (spec.startsWith(".") || /^[@~#]\//.test(spec)) return null;
  const clean = spec.replace(/^node:/, "");
  return clean.startsWith("@") ? clean.split("/").slice(0, 2).join("/") : clean.split("/")[0];
}

/**
 * A code-grounded sentence from imports/exports, used until (or instead of)
 * the model answers.
 * @param {{ path: string, isNew?: boolean, facts?: { imports?: string[], exports?: string[], lines?: number } | null, added?: number, removed?: number }} input
 */
export function explainFromFacts({ path, isNew, facts, added = 0, removed = 0 }) {
  const name = path.split("/").pop();
  const packages = [...new Set((facts?.imports || []).map(packageOf).filter(Boolean))].slice(0, 3);
  const locals = (facts?.imports || []).filter((s) => !packageOf(s)).length;
  const exports = (facts?.exports || []).filter((e) => e !== "default").slice(0, 3);
  const parts = [];
  parts.push(isNew ? `New file ${name}` : `Changed ${name}${added || removed ? ` (+${added} −${removed} lines)` : ""}`);
  if (exports.length) parts.push(`it defines ${list(exports.map((e) => `\`${e}\``))}`);
  else if (facts?.exports?.includes("default")) parts.push("it has a default export");
  if (packages.length) parts.push(`uses ${list(packages)}`);
  if (locals) parts.push(`imports ${locals} local module${locals === 1 ? "" : "s"}`);
  return `${parts.join("; ")}.`;
}

export function changedCode(edits) {
  return (Array.isArray(edits) ? edits : [])
    .map((e) => String(e?.new_string || ""))
    .filter(Boolean)
    .join("\n…\n")
    .slice(0, CHANGE_CHARS);
}

const TEXT_MAX = 280;

/** Whole sentences up to the limit; a word boundary only if one sentence is already too long. */
function fitText(text) {
  if (text.length <= TEXT_MAX) return text;
  const head = text.slice(0, TEXT_MAX);
  const sentence = head.lastIndexOf(". ");
  if (sentence > 80) return head.slice(0, sentence + 1);
  return `${head.slice(0, head.lastIndexOf(" "))}…`;
}

export function normalizeExplanation(raw) {
  const text = String(raw?.explanation || "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const concept = String(raw?.concept || "").replace(/\s+/g, " ").trim();
  return {
    text: fitText(text),
    concept: concept && concept.toLowerCase() !== "null" && concept.length <= 60 ? concept : null,
  };
}

/** @returns {Promise<{ text: string, concept: string | null } | null>} */
export async function explainWithLlm({ prompt, path, change, source }) {
  const apiKey = (process.env.OPENROUTER_API_KEY || "").trim();
  if (!apiKey) return null;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/cufelix/slop_ide",
        "X-Title": "Meanwhile",
      },
      body: JSON.stringify({
        model: process.env.MEANWHILE_EXPLAIN_MODEL || questionModel(),
        temperature: 0.2,
        max_tokens: 160,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: JSON.stringify({
              task: String(prompt || "").slice(0, 500),
              file: path,
              changed_code: String(change || "").slice(0, CHANGE_CHARS),
              file_excerpt: String(source || "").slice(0, FILE_CHARS),
            }),
          },
        ],
      }),
    });
    if (!res.ok) {
      console.error(`[meanwhile] OpenRouter ${res.status}`);
      return null;
    }
    const data = await res.json();
    return normalizeExplanation(JSON.parse(data.choices?.[0]?.message?.content || "{}"));
  } catch (err) {
    console.error("[meanwhile] explain LLM:", err?.message || err);
    return null;
  }
}

/** Newest first; a newer explanation of the same file replaces the older one. */
export function upsertExplanation(list, entry, max = EXPLAIN_MAX) {
  const rest = (Array.isArray(list) ? list : []).filter((e) => e.id !== entry.id && e.path !== entry.path);
  return [entry, ...rest].slice(0, max);
}

export function patchExplanation(list, id, patch) {
  return (Array.isArray(list) ? list : []).map((e) => (e.id === id ? { ...e, ...patch } : e));
}
