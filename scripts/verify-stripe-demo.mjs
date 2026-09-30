#!/usr/bin/env node
/**
 * Acceptance check for spec §10: “Add Stripe checkout to this Next.js site.”
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { toActivitySentence } = require(
  join(root, "extension/media/activity-line.js")
);

const dir = mkdtempSync(join(tmpdir(), "meanwhile-stripe-"));
process.env.CURSOR_PROJECT_DIR = dir;
process.env.MEANWHILE_GENERATOR = "stub";
process.env.MEANWHILE_YT_SEARCH = "";
process.env.YOUTUBE_API_KEY = "";
process.env.OPENROUTER_API_KEY = "";
process.env.ELEVENLABS_API_KEY = "";
process.env.ELEVEN_API_KEY = "";

const { estimateDuration } = await import(
  pathToFileURL(join(root, "runtime/estimate.mjs")).href
);
const { extractStack } = await import(
  pathToFileURL(join(root, "runtime/stack.mjs")).href
);
const {
  onAgentThought,
  onCodingAgentStop,
  onFileEdit,
  startDemoSession,
} = await import(pathToFileURL(join(root, "runtime/pipeline.mjs")).href);

process.env.YOUTUBE_API_KEY = "";
process.env.MEANWHILE_GENERATOR = "stub";
process.env.MEANWHILE_YT_SEARCH = "";
process.env.OPENROUTER_API_KEY = "";
process.env.ELEVENLABS_API_KEY = "";
process.env.ELEVEN_API_KEY = "";

const prompt = "Add Stripe checkout to this Next.js site.";

assert.deepEqual(extractStack(prompt), ["Stripe", "Next.js"]);
assert.equal(estimateDuration(prompt, ["Stripe", "Next.js"]).bucket, "medium");
assert.equal(estimateDuration(prompt, ["Stripe", "Next.js"]).label, "~5–10 min");
assert.equal(estimateDuration("Fix the typo in this file").bucket, "short");
assert.equal(estimateDuration("look at this when you can").bucket, "medium");
assert.equal(
  estimateDuration(
    "Refactor the entire billing flow from scratch and migrate all tests"
  ).bucket,
  "marathon"
);
assert.deepEqual(extractStack("Add auth and a database"), ["Auth", "Database"]);

assert.equal(
  toActivitySentence(
    "I'll add the checkout route in app/api/checkout/route.ts"
  ),
  "Adding the checkout route"
);
assert.equal(
  toActivitySentence("Editing app/api/checkout/route.ts"),
  "Editing the checkout route"
);

const started = await startDemoSession(prompt);
assert.equal(started.skipped, false);
const session = started.session;
assert.ok(session);
assert.equal(session.codingAgent.status, "running");
assert.deepEqual(session.stack, ["Stripe", "Next.js"]);
assert.equal(session.estimate.bucket, "medium");
assert.equal(session.estimate.label, "~5–10 min");
assert.ok(session.estimate.secondsMin >= 300 && session.estimate.secondsMax <= 600);
assert.ok(session.videos.length >= 2, "Up next needs more than one clip");
assert.ok(session.videos.every((video) => video.source === "curated" && video.offline));
assert.match(session.videos[0].title, /stripe/i);
assert.ok(session.videos[0].videoId);
assert.ok(session.videos[0].durationSec > 0);
assert.ok(session.videos[0].durationSec <= session.estimate.secondsMax);
assert.ok(session.cards.length >= 1);
assert.match(
  session.cards.map((card) => `${card.title}\n${card.body}`).join("\n"),
  /Stripe/
);
assert.ok(session.waitPlan.segments.some((segment) => segment.type === "video"));
assert.ok(session.waitPlan.segments.length >= 2);

const id = session.id;
const thought = onAgentThought({
  thought: "I'll add the checkout route in app/api/checkout/route.ts and use Prisma",
  conversationId: session.source.conversationId,
});
assert.equal(thought.session.id, id);
assert.deepEqual(thought.session.stack, ["Stripe", "Next.js", "Prisma"]);
onFileEdit({ path: "app/api/checkout/route.ts" });

const activity = readFileSync(join(dir, ".meanwhile/activity.jsonl"), "utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));
const thoughtLine = activity.find((item) => item.kind === "thought");
assert.equal(thoughtLine.line, "Adding the checkout route");
assert.equal(
  activity.find((item) => item.kind === "file_edit").line,
  "Editing the checkout route"
);

const stopped = onCodingAgentStop({
  conversationId: session.source.conversationId,
  status: "completed",
});
assert.equal(stopped.session.codingAgent.status, "stopped");
assert.equal(stopped.session.id, id);
assert.ok(stopped.session.cards.length >= 1);
assert.ok(stopped.session.videos.length >= 1);

const panel = readFileSync(join(root, "extension/media/panel.html"), "utf8");
const extension = readFileSync(join(root, "extension/extension.js"), "utf8");
for (const snippet of [
  "Estimating the wait…",
  "Review the diff",
  "Using the offline set.",
  "Agent finished.",
  "Up next",
  "--vscode-editor-background",
  "--vscode-foreground",
  "--vscode-descriptionForeground",
  "--vscode-button-background",
  "--vscode-widget-border",
  "--vscode-focusBorder",
  "aria-live=\"polite\"",
  "height: 2px",
]) {
  assert.ok(panel.includes(snippet), `panel missing ${snippet}`);
}
assert.equal(panel.includes("radial-gradient"), false);
assert.equal(panel.includes("box-shadow"), false);
for (const label of [">Empty<", ">Video<", ">Ask<", ">Both<"]) {
  assert.equal(panel.includes(label), false, `preview toggle still present: ${label}`);
}
assert.ok(extension.includes("preserveFocus: true"));
assert.ok(extension.includes("preserveFocus"));
assert.ok(extension.includes("workbench.view.scm"));
assert.ok(extension.includes("youtube-nocookie.com"));
assert.equal(extension.includes("panel.reveal(vscode.ViewColumn.Beside);"), false);

rmSync(dir, { recursive: true, force: true });
console.log(
  JSON.stringify(
    {
      ok: true,
      stack: session.stack,
      estimate: session.estimate.label,
      video: session.videos[0].title,
      upNext: session.videos.slice(1).map((video) => video.title),
      card: session.cards[0].title,
      activity: thoughtLine.line,
      stopped: stopped.session.codingAgent.status,
    },
    null,
    2
  )
);
