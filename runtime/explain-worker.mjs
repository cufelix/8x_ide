#!/usr/bin/env node
/**
 * Background explanation for one edit (spawned detached by the edit hook).
 * Asks the model what the new code does, then finds a clip for the concept
 * behind it and queues that clip as Up next.
 * Usage: node runtime/explain-worker.mjs <sessionId> <explainId>
 */
import { readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMeanwhileEnv } from "./env.mjs";
import { explainWithLlm, patchExplanation } from "./explain.mjs";
import { meanwhileDir } from "./paths.mjs";
import { updateSession } from "./pipeline.mjs";
import { loadSession } from "./store.mjs";
import { dedupe, researchVideos } from "./youtube.mjs";

loadMeanwhileEnv();

const require = createRequire(import.meta.url);
const { clipIndex } = require("../extension/media/view-model.js");

/** Several quick edits to one file become one explanation of the last. */
const SETTLE_MS = Number(process.env.MEANWHILE_EXPLAIN_SETTLE_MS ?? 1500);
const MAX_VIDEOS = 8;

export function explainJobPath(id) {
  return join(meanwhileDir(), "explain", `${id}.json`);
}

/** Put concept clips right after the clip playing now; never drop the current one. */
export function queueAfterCurrent(videos, found, elapsedSec) {
  const list = Array.isArray(videos) ? videos : [];
  const fresh = dedupe(found).filter((v) => !list.some((x) => x.videoId === v.videoId));
  if (!fresh.length) return list;
  const at = list.length ? clipIndex(list, elapsedSec) + 1 : 0;
  return [...list.slice(0, at), ...fresh, ...list.slice(at)].slice(0, Math.max(MAX_VIDEOS, at + 1));
}

const LANGUAGE = [
  [/\.(m?[jt]sx?|cjs)$/i, "JavaScript"],
  [/\.py$/i, "Python"],
  [/\.s?css$/i, "CSS"],
  [/\.vue$/i, "Vue"],
  [/\.svelte$/i, "Svelte"],
];
const MAX_CONCEPT_CLIPS = 3;

/** "Intl.NumberFormat currency formatting" alone finds Java and Excel clips; name the language. */
export function conceptQuery(concept, path = "") {
  const lang = LANGUAGE.find(([re]) => re.test(path))?.[1];
  const mentions = lang && new RegExp(`\\b${lang}\\b|\\b(typescript|react|next\\.?js|node)\\b`, "i").test(concept);
  return `${concept}${lang && !mentions ? ` ${lang}` : ""} explained`;
}

function words(s) {
  return new Set(String(s).toLowerCase().split(/[^a-z0-9.]+/).filter((w) => w.length > 2));
}

/** Concepts that mostly share their words are the same clip topic. */
export function isKnownConcept(known, concept) {
  const a = words(concept);
  return (known || []).some((k) => {
    const b = words(k);
    const shared = [...a].filter((w) => b.has(w)).length;
    return shared / Math.min(a.size || 1, b.size || 1) >= 0.5;
  });
}

function isCurrent(sessionId, id) {
  const s = loadSession();
  return s?.id === sessionId && s.codingAgent?.status === "running" && (s.explain || []).some((e) => e.id === id);
}

async function main(sessionId, id) {
  const jobPath = explainJobPath(id);
  let job;
  try {
    job = JSON.parse(readFileSync(jobPath, "utf8"));
  } catch {
    return;
  }
  try {
    if (SETTLE_MS > 0) await new Promise((r) => setTimeout(r, SETTLE_MS));
    if (!isCurrent(sessionId, id)) return;

    const result = await explainWithLlm(job);
    const concept = result?.concept || null;
    let known = false;
    updateSession(sessionId, (current) => {
      known =
        !concept ||
        isKnownConcept(current.concepts, concept) ||
        (current.concepts || []).length >= MAX_CONCEPT_CLIPS;
      return {
        ...current,
        explain: patchExplanation(
          current.explain,
          id,
          result ? { text: result.text, concept, source: "llm", status: "done" } : { status: "done" }
        ),
        concepts: concept && !known ? [...(current.concepts || []), concept].slice(-12) : current.concepts || [],
      };
    });
    if (!concept || known) return;

    const found = await researchVideos({ queries: [conceptQuery(concept, job.path)] }).catch(() => []);
    if (!found.length) return;
    const tagged = found.slice(0, 1).map((v) => ({ ...v, concept, forPath: job.path }));
    updateSession(sessionId, (current) => {
      if (current.codingAgent?.status !== "running") return current;
      const started = Date.parse(current.codingAgent.startedAt || "") || Date.now();
      return { ...current, videos: queueAfterCurrent(current.videos, tagged, (Date.now() - started) / 1000) };
    });
  } finally {
    rmSync(jobPath, { force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv[2], process.argv[3]).catch((err) => {
    console.error("[meanwhile] explain:", err?.message || err);
  });
}
