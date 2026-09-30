import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildQueries,
  curatedForStack,
  dedupe,
  fitLimitSeconds,
  orderForEstimate,
  parseIsoDuration,
  parseResultsPage,
} from "../runtime/youtube.mjs";
import { estimateDuration } from "../runtime/estimate.mjs";

const short = estimateDuration("fix the typo", []);
const medium = estimateDuration("Add Stripe checkout to this Next.js site", ["Stripe", "Next.js"]);

test("a two-minute task never leads with a twenty-minute video", () => {
  const ordered = orderForEstimate(
    [
      { videoId: "long", durationSec: 1200 },
      { videoId: "unknown", durationSec: null },
      { videoId: "short", durationSec: 130 },
    ],
    short
  );
  assert.deepEqual(ordered.map((v) => v.videoId), ["short", "long", "unknown"]);
});

test("relevance order is kept among fitting clips", () => {
  const ordered = orderForEstimate(
    [
      { videoId: "a", durationSec: 300 },
      { videoId: "b", durationSec: 130 },
    ],
    medium
  );
  assert.deepEqual(ordered.map((v) => v.videoId), ["a", "b"]);
  assert.ok(fitLimitSeconds(medium) >= 300);
});

test("curated clips cover the stack in the header and have lengths", () => {
  const clips = curatedForStack(["Stripe", "Next.js"]);
  assert.equal(clips[0].videoId, "7edR32QVp_A");
  assert.ok(clips.length >= 2);
  for (const c of clips) {
    assert.ok(c.durationSec > 0);
    assert.match(c.url, /^https:\/\/www\.youtube\.com\/watch\?v=/);
    assert.equal(c.source, "curated");
  }
});

test("curated falls back to a short default clip with no stack", () => {
  const clips = curatedForStack([]);
  assert.ok(clips.length >= 1);
  assert.ok(clips[0].durationSec <= 240);
});

test("queries follow the header stack", () => {
  assert.deepEqual(buildQueries(["Stripe", "Next.js"], "add checkout"), [
    "Stripe checkout explained",
    "Next.js explained",
  ]);
  assert.deepEqual(buildQueries([], ""), ["AI coding agents explained"]);
});

test("parseIsoDuration and dedupe", () => {
  assert.equal(parseIsoDuration("PT4M13S"), 253);
  assert.equal(parseIsoDuration("PT1H2S"), 3602);
  assert.equal(parseIsoDuration("bogus"), null);
  assert.deepEqual(
    dedupe([{ videoId: "a" }, { videoId: "a" }, { videoId: "b" }, null]).map((v) => v.videoId),
    ["a", "b"]
  );
});

test("results page parser reads id, title and nested lengthText", () => {
  const block = (id, title, len) =>
    `"videoRenderer":{"videoId":"${id}","thumbnail":{},"title":{"runs":[{"text":"${title}"}]},"lengthText":{"accessibility":{"accessibilityData":{"label":"x"}},"simpleText":"${len}"}}`;
  const html = [
    block("7edR32QVp_A", "Get Paid with Stripe \\u0026 more", "2:10"),
    block("7edR32QVp_A", "dup", "2:10"),
    `"videoRenderer":{"videoId":"LIVELIVE123","title":{"runs":[{"text":"Live now"}]}}`,
    block("XSMfwiZBOvs", "What Is Stripe", "1:06:41"),
  ].join(",");
  const out = parseResultsPage(html, "q", 5);
  assert.deepEqual(
    out.map((v) => [v.videoId, v.title, v.durationSec]),
    [
      ["7edR32QVp_A", "Get Paid with Stripe & more", 130],
      ["XSMfwiZBOvs", "What Is Stripe", 4001],
    ]
  );
});
