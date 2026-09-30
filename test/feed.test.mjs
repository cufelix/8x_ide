import assert from "node:assert/strict";
import { test } from "node:test";
import { appendFeed, countEditLines, feedEntryForEdit, feedEntryFromTool, isRepeat } from "../runtime/feed.mjs";

const now = new Date("2026-09-30T15:00:00Z");

test("real postToolUse payloads become one readable line", () => {
  const shell = feedEntryFromTool(
    {
      tool_name: "Shell",
      tool_input: { command: "npm test", cwd: "" },
      tool_output: '{"output":"ok\\n","exitCode":0}',
      tool_use_id: "t1",
    },
    { now }
  );
  assert.deepEqual(
    { kind: shell.kind, label: shell.label, detail: shell.detail, status: shell.status, id: shell.id },
    { kind: "run", label: "Ran", detail: "npm test", status: "ok", id: "t1" }
  );
  assert.equal(
    feedEntryFromTool({ tool_name: "Shell", tool_input: { command: "false" }, tool_output: '{"exitCode":1}' }).status,
    "exit 1"
  );
  const read = feedEntryFromTool({ tool_name: "Read", tool_input: { path: "/repo/app/page.tsx" } }, { root: "/repo" });
  assert.equal(read.detail, "app/page.tsx");
  assert.equal(feedEntryFromTool({ tool_name: "Grep", tool_input: { pattern: "checkout" } }).detail, "checkout");
});

test("edits and bookkeeping tools stay out of the tool feed", () => {
  for (const tool_name of ["Write", "StrReplace", "TodoWrite", "AwaitShell"]) {
    assert.equal(feedEntryFromTool({ tool_name, tool_input: {} }), null, tool_name);
  }
  assert.equal(feedEntryFromTool({}), null);
});

test("long commands are clipped to one line", () => {
  const e = feedEntryFromTool({ tool_name: "Shell", tool_input: { command: `echo ${"x".repeat(200)}\nls` } });
  assert.ok(e.detail.length <= 72);
  assert.ok(!e.detail.includes("\n"));
});

test("a hook installed twice adds one line; a later real repeat stays", () => {
  const a = feedEntryForEdit({ path: "a.ts", added: 2, removed: 1, change: "x" }, { now });
  let feed = appendFeed([], a);
  feed = appendFeed(feed, { ...a, at: new Date(now.getTime() + 300).toISOString() });
  assert.equal(feed.length, 1);
  const later = { ...a, at: new Date(now.getTime() + 60000).toISOString() };
  assert.equal(isRepeat(feed, later), false);
  assert.equal(appendFeed(feed, later).length, 2);
  assert.equal(appendFeed(feed, later)[0], later, "newest first");
});

test("feed keeps the newest entries only", () => {
  let feed = [];
  for (let i = 0; i < 50; i += 1) {
    feed = appendFeed(feed, { id: `t${i}`, at: now.toISOString(), kind: "run", label: "Ran", detail: String(i) });
  }
  assert.equal(feed.length, 40);
  assert.equal(feed[0].id, "t49");
});

test("edit lines and labels", () => {
  assert.deepEqual(countEditLines([{ old_string: "a\nb", new_string: "a\nb\nc" }]), { added: 3, removed: 2 });
  assert.equal(feedEntryForEdit({ path: "x.ts", isNew: true }).label, "Created");
  assert.equal(feedEntryForEdit({ path: "x.ts", added: 3, removed: 2 }).status, "+3 −2");
});
