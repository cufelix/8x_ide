import { test, before } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
let project;

function hook(name, input) {
  const res = spawnSync(process.execPath, [join(repo, "hooks", name)], {
    input: JSON.stringify(input),
    encoding: "utf8",
    cwd: project,
    env: {
      ...process.env,
      CURSOR_PROJECT_DIR: project,
      MEANWHILE_NO_ENRICH: "1",
      OPENROUTER_API_KEY: "",
      HOME: project,
    },
    timeout: 10000,
  });
  assert.equal(res.status, 0, res.stderr);
  const line = res.stdout.trim();
  return line ? JSON.parse(line) : null;
}

function hookAsync(name, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(repo, "hooks", name)], {
      cwd: project,
      env: { ...process.env, CURSOR_PROJECT_DIR: project, MEANWHILE_NO_ENRICH: "1", OPENROUTER_API_KEY: "", HOME: project },
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("error", reject);
    child.on("close", () => resolve(out.trim() ? JSON.parse(out.trim()) : null));
    child.stdin.end(JSON.stringify(input));
  });
}

function session() {
  return JSON.parse(readFileSync(join(project, ".meanwhile/session.json"), "utf8"));
}

/** What the panel does: write answer.json, never session.json. */
function answer(choiceId) {
  writeFileSync(
    join(project, ".meanwhile/answer.json"),
    JSON.stringify({ sessionId: session().id, choiceId, at: new Date().toISOString() })
  );
}

before(() => {
  project = mkdtempSync(join(tmpdir(), "meanwhile-"));
});

test("a full run: prompt → activity → answer → constraint → stop", () => {
  const conv = { conversation_id: "c1" };
  const started = Date.now();
  assert.deepEqual(hook("before-submit-prompt.mjs", { ...conv, prompt: "Add Stripe checkout to this Next.js site" }), { continue: true });
  assert.ok(Date.now() - started < 3000, "prompt hook stays fast");

  let s = session();
  assert.deepEqual(s.stack, ["Stripe", "Next.js"]);
  assert.equal(s.estimate.label, "~6–10 min");
  assert.equal(s.videos[0].videoId, "7edR32QVp_A");
  assert.equal(s.question.kicker, "Only you can decide");
  assert.equal(s.codingAgent.status, "running");

  hook("after-agent-thought.mjs", { ...conv, text: "Let me look at how the app router is set up." });
  assert.equal(session().activity.line, "looking at how the app router is set up");

  hook("after-file-edit.mjs", {
    ...conv,
    file_path: join(project, "app/api/checkout/route.ts"),
    edits: [{ old_string: "", new_string: 'import Stripe from "stripe";' }],
  });
  hook("after-file-edit.mjs", { ...conv, file_path: "package.json", edits: [{ old_string: "a", new_string: "b" }] });
  s = session();
  assert.equal(s.activity.line, "updating the dependencies");
  assert.deepEqual(s.files, [
    { path: "app/api/checkout/route.ts", isNew: true },
    { path: "package.json", isNew: false },
  ]);

  // Other chats never touch this run.
  hook("after-agent-thought.mjs", { conversation_id: "other", text: "I'll rewrite everything in Rust now" });
  assert.equal(session().activity.line, "updating the dependencies");

  assert.deepEqual(hook("post-tool-use.mjs", conv), {}, "nothing to say before an answer");
  answer("embedded");
  const ctx = hook("post-tool-use.mjs", conv);
  assert.match(ctx.additional_context, /embedded form on our own page/);
  assert.equal(session().question.answer.choiceId, "embedded", "hooks persist the merged answer");
  assert.deepEqual(hook("post-tool-use.mjs", conv), {}, "delivered once");

  assert.deepEqual(hook("stop.mjs", { ...conv, status: "completed", loop_count: 0 }), {});
  s = session();
  assert.equal(s.codingAgent.status, "stopped");
  assert.equal(s.summary, "Checkout route added, 2 files");
});

test("an answer given after the last tool call goes back as a follow-up", () => {
  const conv = { conversation_id: "c2" };
  hook("before-submit-prompt.mjs", { ...conv, prompt: "Add Stripe checkout to this Next.js site" });
  answer("hosted");
  const out = hook("stop.mjs", { ...conv, status: "completed", loop_count: 0 });
  assert.match(out.followup_message, /Stripe-hosted Checkout page/);
  assert.equal(session().codingAgent.status, "running", "the run continues");
  assert.deepEqual(hook("stop.mjs", { ...conv, status: "completed", loop_count: 1 }), {});
  assert.equal(session().codingAgent.status, "stopped");
});

test("an answer for an older run is ignored", () => {
  hook("before-submit-prompt.mjs", { conversation_id: "c4", prompt: "Add Stripe checkout to this Next.js site" });
  writeFileSync(
    join(project, ".meanwhile/answer.json"),
    JSON.stringify({ sessionId: "old-run", choiceId: "hosted", at: new Date().toISOString() })
  );
  assert.deepEqual(hook("post-tool-use.mjs", { conversation_id: "c4" }), {});
});

test("parallel hooks deliver the constraint exactly once and lose no edits", async () => {
  const conv = { conversation_id: "c5" };
  hook("before-submit-prompt.mjs", { ...conv, prompt: "Add Stripe checkout to this Next.js site" });
  answer("links");
  const runs = [];
  for (let i = 0; i < 6; i += 1) {
    runs.push(hookAsync("post-tool-use.mjs", conv));
    runs.push(hookAsync("after-file-edit.mjs", { ...conv, file_path: `src/components/C${i}.tsx`, edits: [] }));
  }
  const outs = await Promise.all(runs);
  assert.equal(outs.filter((o) => o?.additional_context).length, 1);
  const s = session();
  assert.ok(s.question.answer.deliveredAt);
  assert.equal(s.files.length, 6);
  assert.deepEqual(hook("stop.mjs", { ...conv, loop_count: 0 }), {}, "no second delivery via stop");
});

test("the same prompt hook installed twice starts one run", async () => {
  const input = { conversation_id: "c6", prompt: "Add Stripe checkout to this Next.js site" };
  await Promise.all([hookAsync("before-submit-prompt.mjs", input), hookAsync("before-submit-prompt.mjs", input)]);
  const first = session().id;
  hook("before-submit-prompt.mjs", input);
  assert.equal(session().id, first);
  const events = readFileSync(join(project, ".meanwhile/events.jsonl"), "utf8")
    .trim().split("\n").map((l) => JSON.parse(l))
    .filter((e) => e.type === "prompt_submitted" && e.sessionId === first);
  assert.equal(events.length, 1);
});

test("our own follow-up message does not start a new run", () => {
  const id = session().id;
  hook("before-submit-prompt.mjs", {
    conversation_id: "c5",
    prompt: "Meanwhile — constraint set by the user for the rest of this run: Use Stripe Payment Links.",
  });
  assert.equal(session().id, id);
});

test("live feed, explanation and schema from real hook payloads", async () => {
  const gen = "7c507a65-e702-41fb-903c-3468ebd69693";
  hook("before-submit-prompt.mjs", { conversation_id: "chat", generation_id: gen, prompt: "Add Stripe checkout to this Next.js site" });
  // Tool and edit hooks of the same turn arrive under another conversation id.
  const tool = { conversation_id: "tool-side", generation_id: gen };

  hook("after-agent-thought.mjs", { conversation_id: "chat", generation_id: `${gen}-3-oncl`, text: "Let me look at how the app router is set up." });
  const shell = { ...tool, tool_name: "Shell", tool_input: { command: "npm ls stripe" }, tool_output: '{"exitCode":0}', tool_use_id: "u1" };
  await Promise.all([hookAsync("post-tool-use.mjs", shell), hookAsync("post-tool-use.mjs", shell)]);
  hook("post-tool-use.mjs", { ...tool, tool_name: "Read", tool_input: { path: join(project, "app/page.tsx") }, tool_use_id: "u2" });

  const { mkdirSync } = await import("node:fs");
  mkdirSync(join(project, "app/api/checkout"), { recursive: true });
  mkdirSync(join(project, "lib"), { recursive: true });
  writeFileSync(join(project, "lib/stripe.ts"), 'import Stripe from "stripe";\nexport const stripe = new Stripe("");\n');
  writeFileSync(
    join(project, "app/api/checkout/route.ts"),
    'import { stripe } from "@/lib/stripe";\nimport { NextResponse } from "next/server";\nexport async function POST() { return NextResponse.json({}); }\n'
  );
  hook("after-file-edit.mjs", { ...tool, file_path: join(project, "lib/stripe.ts"), edits: [{ old_string: "", new_string: "stripe" }] });
  const edit = { ...tool, file_path: join(project, "app/api/checkout/route.ts"), edits: [{ old_string: "", new_string: "route" }] };
  await Promise.all([hookAsync("after-file-edit.mjs", edit), hookAsync("after-file-edit.mjs", edit)]);

  const s = session();
  assert.deepEqual(s.source.aliases, ["tool-side"]);
  assert.deepEqual(
    s.feed.map((e) => `${e.label} ${e.detail}`),
    [
      "Created app/api/checkout/route.ts",
      "Created lib/stripe.ts",
      "Read app/page.tsx",
      "Ran npm ls stripe",
      "Thinking looking at how the app router is set up",
      "Task Add Stripe checkout to this Next.js site",
    ],
    "each event once, newest first"
  );
  assert.equal(s.explain.length, 2);
  assert.equal(s.explain[0].path, "app/api/checkout/route.ts");
  assert.match(s.explain[0].text, /defines `POST`; uses next; imports 1 local module/);
  assert.equal(s.explain[0].status, "done", "no key: the code-derived line is final");
  const byId = Object.fromEntries(s.schema.nodes.map((n) => [n.id, n]));
  assert.equal(byId["app/api/checkout/route.ts"].layer, 0);
  assert.equal(byId["lib/stripe.ts"].layer, 1);
  assert.ok(byId["pkg:stripe"] && byId["pkg:next"]);
  assert.ok(s.schema.edges.some((e) => e.from === "app/api/checkout/route.ts" && e.to === "lib/stripe.ts"));
  assert.deepEqual(s.code["app/api/checkout/route.ts"].resolved, { "@/lib/stripe": "lib/stripe.ts" });

  hook("post-tool-use.mjs", { conversation_id: "someone-else", generation_id: "other", tool_name: "Shell", tool_input: { command: "rm -rf" }, tool_use_id: "x" });
  assert.equal(session().feed.length, 6, "other chats never reach the feed");

  // A whole-file rewrite arrives with an empty old_string; a file the agent read is not new.
  writeFileSync(join(project, "app/page.tsx"), "export default function Page() {}\n");
  hook("after-file-edit.mjs", { ...tool, file_path: join(project, "app/page.tsx"), edits: [{ old_string: "", new_string: "page" }] });
  assert.equal(session().feed[0].label, "Edited");
  assert.equal(session().files.find((f) => f.path === "app/page.tsx").isNew, false);
});

test("/meanwhile commands and empty prompts do not start a run", () => {
  hook("before-submit-prompt.mjs", { conversation_id: "c3", prompt: "/meanwhile status" });
  assert.notEqual(session().source.conversationId, "c3");
});
