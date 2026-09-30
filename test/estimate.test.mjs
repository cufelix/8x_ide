import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estimateDuration,
  estimateMidSeconds,
  formatRange,
} from "../runtime/estimate.mjs";

test("Stripe checkout in Next.js lands around 6–10 min", () => {
  const e = estimateDuration("Add Stripe checkout to this Next.js site", [
    "Stripe",
    "Next.js",
  ]);
  assert.equal(e.label, "~6–10 min");
  assert.equal(e.secondsMin, 360);
  assert.equal(e.secondsMax, 600);
});

test("a typo fix is a short wait", () => {
  const e = estimateDuration("fix the typo in the README", []);
  assert.ok(e.secondsMax <= 240, `got ${e.label}`);
  assert.equal(e.bucket, "short");
});

test("a broad migration is long", () => {
  const e = estimateDuration(
    "migrate the entire app from Prisma to Drizzle and rewrite all tests",
    ["Prisma"]
  );
  assert.ok(e.secondsMin >= 600, `got ${e.label}`);
});

test("unclear prompt falls back to a medium range with low confidence", () => {
  const e = estimateDuration("make it better", []);
  assert.equal(e.confidence, "low");
  assert.equal(e.bucket, "medium");
});

test("formatRange rounds to minutes", () => {
  assert.equal(formatRange(360, 600), "~6–10 min");
  assert.equal(formatRange(1500, 2100), "~25–35 min");
});

test("estimateMidSeconds is the midpoint", () => {
  assert.equal(estimateMidSeconds({ secondsMin: 360, secondsMax: 600 }), 480);
});
