import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

test("only the same-origin host can send Vibe controls; player messages stay isolated", () => {
  const html = readFileSync(new URL("../extension/media/panel.html", import.meta.url), "utf8");
  const start = html.indexOf('window.addEventListener("message", (event) => {');
  const end = html.indexOf("      function leaveTheater()", start);
  assert.ok(start !== -1 && end > start);
  const received = [];
  const sent = [];
  const playerWindow = {};
  const hostWindow = {}; // Cursor forwards from a parent frame, not window itself.
  const origin = "https://test.vscode-webview.net";
  let listener;
  const context = {
    window: { location: { origin }, addEventListener: (_type, fn) => { listener = fn; } },
    iframe: { contentWindow: playerWindow },
    modes: { receive: (data) => received.push(data) },
    vscode: { postMessage: (data) => sent.push(data) },
    watch: {}, loadedVideoId: "clip", render() {},
  };
  vm.runInNewContext(html.slice(start, end), context);

  const controls = [
    { type: "vibeInit", payload: { state: { version: 1, progress: {} }, mode: "vibe" } },
    { type: "mode", mode: "vibe" },
    { type: "vibeSaved", requestId: 1, ok: true },
    { type: "activityOpened", activityId: "duolingo", ok: true },
  ];
  for (const data of controls) {
    listener({ source: playerWindow, origin: "http://127.0.0.1:3456", data });
    listener({ source: {}, origin: "https://www.youtube.com", data });
    assert.equal(received.length, 0);
  }
  // A child also cannot replace Work's full session payload.
  listener({ source: playerWindow, origin: "http://127.0.0.1:3456", data: { type: "state" } });
  assert.equal(received.length, 0);

  for (const data of controls) listener({ source: hostWindow, origin, data });
  assert.deepEqual(received, controls);

  listener({ source: playerWindow, origin: "http://127.0.0.1:3456", data: { source: "meanwhile-player", type: "state", state: 1 } });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, "player");
  assert.equal(sent[0].playing, true);
  assert.equal(received.length, controls.length, "player events never reach the host-control bridge");
  listener({ source: {}, origin: "https://www.youtube.com", data: { source: "meanwhile-player", type: "state", state: 1 } });
  assert.equal(sent.length, 1, "only the actual player frame can send player status");
});
