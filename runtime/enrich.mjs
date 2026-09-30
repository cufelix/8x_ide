#!/usr/bin/env node
/**
 * Background enrich for one session (spawned detached by the prompt hook).
 * Adds researched clips after the curated first clip, proposes a question
 * when the bank had none, and (opt-in) records a spoken intro.
 * Usage: node runtime/enrich.mjs <sessionId>
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMeanwhileEnv } from "./env.mjs";
import { updateSession } from "./pipeline.mjs";
import { proposeQuestion } from "./question-llm.mjs";
import { loadSession } from "./store.mjs";
import { maybeSpeak } from "./voice.mjs";
import { dedupe, orderForEstimate, researchVideos } from "./youtube.mjs";

loadMeanwhileEnv();

export function mergeResearched(videos, found, estimate) {
  if (!found.length) return videos;
  const [first, ...rest] = videos;
  const tail = orderForEstimate(dedupe([...found, ...rest]), estimate).filter(
    (v) => v.videoId !== first?.videoId
  );
  return first ? [first, ...tail].slice(0, 5) : tail.slice(0, 5);
}

async function main(sessionId) {
  const session = loadSession();
  if (!session || session.id !== sessionId) return;

  const [found, proposed] = await Promise.all([
    researchVideos({ stack: session.stack, prompt: session.source.prompt }).catch(() => []),
    session.question ? null : proposeQuestion({ prompt: session.source.prompt, stack: session.stack }),
  ]);

  updateSession(sessionId, (current) => {
    if (current.codingAgent?.status !== "running") return current;
    return {
      ...current,
      videos: mergeResearched(current.videos || [], found, current.estimate),
      question: current.question || proposed || null,
    };
  });

  if (process.env.MEANWHILE_VOICE === "1") {
    const s = loadSession();
    if (s?.id === sessionId) {
      await maybeSpeak(`Meanwhile. About ${s.estimate.label.replace("~", "")}. ${s.stack.slice(0, 2).join(" and ")}.`);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv[2]).catch((err) => {
    console.error("[meanwhile] enrich:", err?.message || err);
  });
}
