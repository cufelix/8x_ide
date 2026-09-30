import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const layout = require("../extension/layout.js");

test("focus in Meanwhile widens it, focus elsewhere narrows it", () => {
  assert.equal(layout.wantFor({ panelVisible: true, panelActive: true }), "wide");
  assert.equal(layout.wantFor({ panelVisible: true, panelActive: false }), "narrow");
  assert.equal(layout.wantFor({ panelVisible: false, panelActive: false }), "rest");
});

test("steps are bounded and never drift", () => {
  const max = layout.MAX_STEPS;
  assert.equal(layout.stepsToward(0, "wide"), max);
  assert.equal(layout.stepsToward(max, "wide"), 0);
  assert.equal(layout.stepsToward(max, "narrow"), -2 * max);
  assert.equal(layout.stepsToward(-max, "rest"), max);
  assert.equal(layout.stepsToward(0, "rest"), 0);
});

test("theater closes only what is open, so it can reopen exactly that", () => {
  assert.deepEqual(layout.theaterPlan({ auxiliaryBar: true, sideBar: true }), ["auxiliaryBar", "sideBar"]);
  assert.deepEqual(layout.theaterPlan({ auxiliaryBar: true, sideBar: false }), ["auxiliaryBar"]);
  assert.deepEqual(layout.theaterPlan({ auxiliaryBar: false, sideBar: false }), []);
});
