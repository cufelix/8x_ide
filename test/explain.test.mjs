import assert from "node:assert/strict";
import { test } from "node:test";
import { changedCode, explainFromFacts, normalizeExplanation, patchExplanation, upsertExplanation } from "../runtime/explain.mjs";
import { conceptQuery, isKnownConcept, queueAfterCurrent } from "../runtime/explain-worker.mjs";

test("concept queries name the language unless the concept already does", () => {
  assert.equal(conceptQuery("Intl.NumberFormat currency formatting", "lib/format-price.ts"), "Intl.NumberFormat currency formatting JavaScript explained");
  assert.equal(conceptQuery("React useEffect cleanup", "a.tsx"), "React useEffect cleanup explained");
  assert.equal(conceptQuery("SQLAlchemy sessions", "db.py"), "SQLAlchemy sessions Python explained");
  assert.equal(conceptQuery("Stripe webhooks", "README"), "Stripe webhooks explained");
});

test("near-duplicate concepts do not queue a second clip", () => {
  assert.equal(isKnownConcept(["Intl.NumberFormat usage"], "Intl.NumberFormat currency formatting"), true);
  assert.equal(isKnownConcept(["Stripe checkout session creation"], "Stripe webhook signature verification"), false);
  assert.equal(isKnownConcept([], "anything"), false);
});

test("code-grounded explanation names what the file defines and uses", () => {
  const text = explainFromFacts({
    path: "app/api/checkout/route.ts",
    isNew: true,
    facts: { imports: ["stripe", "next/server", "@/lib/db"], exports: ["POST", "runtime"] },
  });
  assert.equal(text, "New file route.ts; it defines `POST` and `runtime`; uses stripe and next; imports 1 local module.");
  assert.equal(explainFromFacts({ path: "package.json", facts: null, added: 1, removed: 1 }), "Changed package.json (+1 −1 lines).");
});

test("model output is trimmed and a missing concept is null", () => {
  assert.deepEqual(normalizeExplanation({ explanation: "  Adds a POST route.  ", concept: "null" }), {
    text: "Adds a POST route.",
    concept: null,
  });
  assert.equal(normalizeExplanation({ explanation: "" }), null);
  assert.equal(normalizeExplanation({ explanation: "x", concept: "Stripe webhooks" }).concept, "Stripe webhooks");
  const long = `${"Creates a Stripe session for the product and redirects to it".repeat(3)}. ${"word ".repeat(60)}`;
  const fit = normalizeExplanation({ explanation: long }).text;
  assert.ok(fit.length <= 280 && fit.endsWith("."), "cut at a sentence end");
});

test("a newer explanation of the same file replaces the older one", () => {
  let list = upsertExplanation([], { id: "1", path: "a.ts", text: "one" });
  list = upsertExplanation(list, { id: "2", path: "b.ts", text: "two" });
  list = upsertExplanation(list, { id: "3", path: "a.ts", text: "three" });
  assert.deepEqual(list.map((e) => e.id), ["3", "2"]);
  assert.equal(patchExplanation(list, "2", { text: "better" })[1].text, "better");
});

test("changed code joins new_string parts", () => {
  assert.equal(changedCode([{ new_string: "a" }, { old_string: "x" }, { new_string: "b" }]), "a\n…\nb");
});

test("concept clips queue right after the clip playing now", () => {
  const videos = [
    { videoId: "aaaaaaaaaaa", durationSec: 100 },
    { videoId: "bbbbbbbbbbb", durationSec: 100 },
  ];
  const found = [{ videoId: "ccccccccccc" }, { videoId: "aaaaaaaaaaa" }];
  assert.deepEqual(queueAfterCurrent(videos, found, 10).map((v) => v.videoId), ["aaaaaaaaaaa", "ccccccccccc", "bbbbbbbbbbb"]);
  assert.deepEqual(queueAfterCurrent(videos, found, 150).map((v) => v.videoId), ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"]);
  assert.deepEqual(queueAfterCurrent([], found, 0).map((v) => v.videoId), ["ccccccccccc", "aaaaaaaaaaa"]);
});
