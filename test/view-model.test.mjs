import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const vm = require("../extension/media/view-model.js");

const T0 = Date.parse("2026-09-30T12:00:00Z");
const at = (sec) => T0 + sec * 1000;

function session(overrides = {}) {
  return {
    id: "s1",
    stack: ["Stripe", "Next.js", "Postgres", "Redis"],
    estimate: { secondsMin: 360, secondsMax: 600, label: "~6–10 min" },
    videos: [
      { videoId: "a", title: "Stripe in 100 Seconds", durationSec: 130, url: "u/a" },
      { videoId: "b", title: "Embedded Checkout", durationSec: 364, url: "u/b" },
      { videoId: "c", title: "Next.js basics", durationSec: 540, url: "u/c" },
    ],
    question: {
      id: "q",
      kicker: "Only you can decide",
      title: "Where should customers pay?",
      body: "…",
      choices: [
        { id: "hosted", label: "Stripe-hosted Checkout", constraint: "Customers pay on a Stripe-hosted Checkout page" },
        { id: "embedded", label: "Embedded form", constraint: "Embedded form" },
        { id: "links", label: "Payment Links", constraint: "Payment Links" },
      ],
      answer: null,
    },
    activity: { line: "wiring the checkout route", at: "2026-09-30T12:01:00Z" },
    codingAgent: { status: "running", startedAt: "2026-09-30T12:00:00Z", stoppedAt: null },
    ...overrides,
  };
}

test("no session: quiet stage, corner mark only", () => {
  const v = vm.buildView(null, T0);
  assert.equal(v.phase, "none");
  assert.equal(v.stageEmpty, true);
  assert.equal(v.headerText, null);
});

test("header is one line: Meanwhile · range · chips (max 3)", () => {
  const v = vm.buildView(session(), at(60));
  assert.equal(v.headerText, "Meanwhile · ~6–10 min · Stripe · Next.js · Postgres");
  assert.equal(v.activityLine, "wiring the checkout route");
});

test("range extends once the run outlives it", () => {
  const v = vm.buildView(session(), at(660));
  assert.equal(v.eta, "~12–14 min");
  assert.equal(v.progressPct < 100, true);
});

test("first clip plays with an Up next line of title and length", () => {
  const v = vm.buildView(session(), at(30));
  assert.equal(v.video.videoId, "a");
  assert.equal(v.video.lengthLabel, "2:10");
  assert.deepEqual(v.upNext, { title: "Embedded Checkout", lengthLabel: "6:04" });
});

test("when the clip ends and the run continues, roll forward to Up next", () => {
  const v = vm.buildView(session(), at(140));
  assert.equal(v.video.videoId, "b");
  assert.equal(v.upNext.title, "Next.js basics");
  const last = vm.buildView(session(), at(5000));
  assert.equal(last.video.videoId, "c");
  assert.equal(last.upNext, null);
});

test("a clip the user is watching is not swapped mid-watch", () => {
  const v = vm.buildView(session(), at(200), { pinnedVideoId: "a" });
  assert.equal(v.video.videoId, "a");
  assert.equal(v.upNext.title, "Embedded Checkout");
});

test("a clip that ended early moves to Up next before the clock does", () => {
  const v = vm.buildView(session(), at(20), { minClip: 1 });
  assert.equal(v.video.videoId, "b");
  assert.equal(vm.buildView(session(), at(20), { minClip: 9 }).video.videoId, "c");
});

test("open question, then the collapsed constraint line", () => {
  const open = vm.buildView(session(), at(30));
  assert.equal(open.question.state, "open");
  assert.equal(open.question.choices.length, 3);
  const s = session();
  s.question = {
    ...s.question,
    answer: { choiceId: "hosted", label: "Stripe-hosted Checkout", constraint: "Customers pay on a Stripe-hosted Checkout page" },
  };
  const set = vm.buildView(s, at(30));
  assert.equal(set.question.state, "set");
  assert.equal(set.question.line, "Customers pay on a Stripe-hosted Checkout page");
  assert.equal(set.question.pickedId, "hosted");
});

test("stage stays empty until a video or a question exists", () => {
  const v = vm.buildView(session({ videos: [], question: null }), at(30));
  assert.equal(v.stageEmpty, true);
  assert.equal(v.phase, "running");
  assert.ok(v.headerText.startsWith("Meanwhile"));
});

test("when the agent stops: Review the diff, one sentence, no video", () => {
  const v = vm.buildView(
    session({
      codingAgent: { status: "stopped", startedAt: "2026-09-30T12:00:00Z", stoppedAt: "2026-09-30T12:05:00Z" },
      summary: "Checkout route added, 4 files",
    }),
    at(400)
  );
  assert.equal(v.phase, "stopped");
  assert.equal(v.headerText, "Review the diff");
  assert.equal(v.summary, "Checkout route added, 4 files");
  assert.equal(v.video, null);
  assert.equal(v.upNext, null);
  assert.equal(v.question, null);
  assert.equal(v.activityLine, null);
});

test("a malformed estimate shows no range instead of NaN", () => {
  const v = vm.buildView(session({ estimate: { label: "~6–10 min" } }), at(60));
  assert.equal(v.eta, null);
  assert.equal(v.headerText, "Meanwhile · Stripe · Next.js · Postgres");
});

test("formatLength", () => {
  assert.equal(vm.formatLength(130), "2:10");
  assert.equal(vm.formatLength(3605), "1:00:05");
  assert.equal(vm.formatLength(null), null);
});

test("choiceForKey maps 1–3 to choices", () => {
  const q = session().question;
  assert.equal(vm.choiceForKey(q, "2"), "embedded");
  assert.equal(vm.choiceForKey(q, "4"), null);
  assert.equal(vm.choiceForKey({ ...q, answer: { choiceId: "hosted" } }, "1"), null);
});
