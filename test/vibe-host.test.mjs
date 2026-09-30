import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const vibe = require("../extension/media/vibe-model.js");

function fixture(t) {
  const project = mkdtempSync(join(tmpdir(), "meanwhile-vibe-host-"));
  t.after(() => rmSync(project, { recursive: true, force: true }));
  return project;
}

function writeSession(project, status = "running") {
  mkdirSync(join(project, ".meanwhile"), { recursive: true });
  const session = {
    id: "demo-session",
    codingAgent: { status },
    question: { id: "human-choice", choices: [{ id: "hosted", label: "Hosted", constraint: "Use hosted checkout" }], answer: null },
  };
  writeFileSync(join(project, ".meanwhile/session.json"), JSON.stringify(session));
}

async function host(project, values = new Map(), rejectSave = false, openResult = true) {
  const commands = new Map();
  const messages = [];
  const timers = new Map();
  const executed = [];
  const opened = [];
  let receive;
  let change;
  let dispose;
  let disposed = false;
  let id = 0;
  const panel = {
    active: true,
    visible: true,
    viewColumn: 2,
    webview: {
      cspSource: "https://webview.test",
      asWebviewUri: (value) => ({ toString: () => `https://webview.test${value.fsPath}` }),
      onDidReceiveMessage: (fn) => { receive = fn; },
      postMessage: (msg) => { messages.push(msg); },
    },
    onDidChangeViewState() {},
    onDidDispose: (fn) => { dispose = fn; },
    reveal() {},
    dispose() { disposed = true; dispose?.(); },
  };
  const globalState = {
    get: (key) => values.get(key),
    update: async (key, value) => {
      if (rejectSave && key === "meanwhile.vibe.browser.v1") throw new Error("simulated disk failure");
      values.set(key, structuredClone(value));
    },
  };
  const vscode = {
    workspace: {
      workspaceFolders: [{ uri: { fsPath: project } }],
      createFileSystemWatcher: () => ({ onDidCreate() {}, onDidChange(fn) { change = fn; } }),
    },
    commands: {
      registerCommand: (name, fn) => { commands.set(name, fn); return { dispose() {} }; },
      executeCommand: async (name) => { executed.push(name); },
    },
    window: { createWebviewPanel: () => panel },
    Uri: { file: (fsPath) => ({ fsPath }), parse: (url) => new URL(url) },
    env: { openExternal: async (uri) => { opened.push(uri.href); return openResult; } },
    ViewColumn: { Beside: 2 },
    RelativePattern: class {},
  };
  const sandbox = {
    module: { exports: {} },
    process,
    URL,
    console: { error() {} },
    require(name) {
      if (name === "vscode") return vscode;
      if (name === "./player-server") return { startPlayerServer: async () => ({ base: "http://127.0.0.1:3456", port: 3456, close() {} }) };
      if (name === "./adaptive") return { createAdaptiveLayout: () => ({ exitTheater: async () => {}, onViewState() {}, onPlayer() {}, dispose() {} }) };
      if (name === "./media/vibe-model") return vibe;
      return require(name);
    },
    setTimeout(fn) { timers.set(++id, fn); return id; },
    clearTimeout(key) { timers.delete(key); },
    setInterval() { return 100; },
    clearInterval() {},
  };
  vm.runInNewContext(readFileSync(join(repo, "extension/extension.js"), "utf8"), sandbox);
  await sandbox.module.exports.activate({ extensionPath: join(repo, "extension"), globalState, subscriptions: [] });
  return {
    commands, messages, timers, executed, opened, panel,
    receive: (msg) => receive(msg),
    changed: () => change(),
    get disposed() { return disposed; },
  };
}

test("Vibe opens with no coding session and restores browser preferences after extension reload", async (t) => {
  const project = fixture(t);
  const values = new Map();
  const first = await host(project, values);
  await first.commands.get("meanwhile.vibe")();
  await first.receive({ type: "ready" });
  assert.ok(!first.panel.webview.html.includes("{{"), "all panel assets have webview URIs");
  assert.ok(first.panel.webview.html.includes("https://lichess.org"), "official activity embed is permitted by CSP");
  assert.ok(first.panel.webview.html.includes("font-src https://webview.test"), "bundled font is permitted without remote font hosts");
  assert.equal(first.messages.find((m) => m.type === "vibeInit").payload.mode, "vibe");

  let state = vibe.choose(vibe.initialState({ version: 2, theme: "light" }), "duolingo");
  state = vibe.togglePin(state, "duolingo");
  await first.receive({ type: "vibeSave", state, requestId: 1 });
  assert.equal(first.messages.at(-1).ok, true);
  assert.equal(existsSync(join(project, ".meanwhile/answer.json")), false);

  const reloaded = await host(project, values);
  await reloaded.commands.get("meanwhile.vibe")();
  await reloaded.receive({ type: "ready" });
  const restored = reloaded.messages.find((m) => m.type === "vibeInit").payload;
  assert.equal(restored.mode, "vibe");
  assert.deepEqual(restored.state, state);
  assert.equal(restored.state.pinnedIds.includes("duolingo"), true);
  assert.equal(restored.state.theme, "light");
});

test("switching to Vibe cancels pending auto-close and keeps a stopped run available", async (t) => {
  const project = fixture(t);
  writeSession(project);
  const app = await host(project);
  await app.receive({ type: "ready" });
  writeSession(project, "stopped");
  app.changed();
  assert.equal(app.timers.size, 1);
  await app.receive({ type: "setMode", mode: "vibe" });
  assert.equal(app.timers.size, 0);
  app.changed();
  assert.equal(app.timers.size, 0);
  assert.equal(app.disposed, false);
  assert.equal(app.messages.filter((m) => m.type === "state").at(-1).payload.session.codingAgent.status, "stopped");
  await app.receive({ type: "setMode", mode: "work" });
  assert.equal(app.timers.size, 0, "returning deliberately from Vibe does not auto-close");
});

test("Work still steps aside after completion and Vibe cannot write a coding constraint", async (t) => {
  const project = fixture(t);
  writeSession(project);
  const app = await host(project);
  await app.receive({ type: "ready" });
  await app.receive({ type: "setMode", mode: "vibe" });
  await app.receive({ type: "answer", choiceId: "hosted" });
  assert.equal(existsSync(join(project, ".meanwhile/answer.json")), false);
  await app.receive({ type: "setMode", mode: "work" });
  writeSession(project, "stopped");
  app.changed();
  assert.equal(app.timers.size, 1);
  await [...app.timers.values()][0]();
  assert.equal(app.disposed, true);
  assert.deepEqual(app.executed, ["workbench.view.scm"]);
});

test("failed saves are reported and sanitized preferences remain in memory for retry", async (t) => {
  const project = fixture(t);
  const app = await host(project, new Map(), true);
  await app.commands.get("meanwhile.vibe")();
  await app.receive({ type: "vibeSave", state: { version: 999, topicId: "unknown", progress: "bad" }, requestId: 7 });
  assert.equal(app.messages.at(-1).type, "vibeSaved");
  assert.equal(app.messages.at(-1).ok, false);
  assert.equal(app.messages.at(-1).requestId, 7);
  await app.receive({ type: "ready" });
  const state = app.messages.filter((m) => m.type === "vibeInit").at(-1).payload.state;
  assert.equal(state.version, 2);
  assert.ok(Array.isArray(state.interestIds));
});

test("Vibe opens only known activity URLs and reports browser failures", async (t) => {
  const project = fixture(t);
  const app = await host(project);
  await app.commands.get("meanwhile.vibe")();
  await app.receive({ type: "openActivity", activityId: "duolingo", url: "https://attacker.invalid" });
  assert.deepEqual(app.opened, [vibe.getActivity("duolingo").url]);
  assert.equal(app.messages.at(-1).ok, true);
  await app.receive({ type: "openActivity", activityId: "https://attacker.invalid" });
  assert.equal(app.opened.length, 1);
  assert.equal(app.messages.at(-1).ok, false);
  await app.receive({ type: "setMode", mode: "work" });
  await app.receive({ type: "openActivity", activityId: "duolingo" });
  assert.equal(app.opened.length, 1);

  const failing = await host(project, new Map(), false, false);
  await failing.commands.get("meanwhile.vibe")();
  await failing.receive({ type: "openActivity", activityId: "duolingo" });
  assert.equal(failing.messages.at(-1).ok, false);
});
