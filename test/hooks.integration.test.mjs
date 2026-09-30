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

test("/meanwhile commands and empty prompts do not start a run", () => {
  hook("before-submit-prompt.mjs", { conversation_id: "c3", prompt: "/meanwhile status" });
  assert.notEqual(session().source.conversationId, "c3");
});
