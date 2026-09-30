import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const theme = require("../extension/media/panel-theme.js");
const model = require("../extension/media/vibe-model.js");

test("unset theme follows Cursor, including high contrast; explicit choice stays independent", () => {
  assert.equal(theme.resolve("system", "vscode-light extra", true), "light");
  assert.equal(theme.resolve("system", "vscode-high-contrast-light", true), "light");
  assert.equal(theme.resolve("system", "vscode-high-contrast", false), "dark");
  assert.equal(theme.resolve("system", "", false), "light");
  assert.equal(theme.resolve("light", "vscode-dark", true), "light");
  assert.equal(theme.resolve("dark", "vscode-light", false), "dark");
  assert.equal(model.initialState({ version: 2, theme: "invalid" }).theme, "system");
});

test("theme toggle persists the choice and editor changes do not override it", () => {
  const attrs = {}, events = {}, saved = [];
  const document = { documentElement: { dataset: {} }, body: { className: "vscode-light" } };
  const button = { setAttribute: (key, value) => { attrs[key] = value; }, addEventListener: (key, fn) => { events[key] = fn; } };
  let editorChanged;
  const context = { module: { exports: {} }, document,
    window: { matchMedia: () => ({ matches: true, addEventListener() {} }) },
    MutationObserver: class { constructor(fn) { editorChanged = fn; } observe() {} },
  };
  vm.runInNewContext(readFileSync(new URL("../extension/media/panel-theme.js", import.meta.url), "utf8"), context);
  const control = context.module.exports.mount(button, value => saved.push(value));
  assert.equal(document.documentElement.dataset.panelTheme, "light");
  events.click();
  assert.deepEqual(saved, ["dark"]);
  assert.equal(attrs["aria-label"], "Switch to light theme");
  assert.equal(document.body.className, "vscode-light", "Cursor's theme classes are never rewritten");
  editorChanged();
  assert.equal(document.documentElement.dataset.panelTheme, "dark");
  control.update("light");
  assert.equal(attrs["aria-label"], "Switch to dark theme");
});

test("service logos and the licensed font are packaged locally", () => {
  for (const activity of model.activities) {
    const file = new URL(`../extension/media/${activity.logo}`, import.meta.url);
    const data = readFileSync(file);
    assert.equal(data.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", activity.title);
    assert.ok(data.readUInt32BE(16) >= 64, "logo is large enough for the launcher");
  }
  assert.ok(existsSync(new URL("../extension/media/fonts/Manrope.ttf", import.meta.url)));
  assert.match(readFileSync(new URL("../extension/media/fonts/OFL.txt", import.meta.url), "utf8"), /SIL OPEN FONT LICENSE/);
});
