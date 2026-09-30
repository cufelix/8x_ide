import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const vibe = require("../extension/media/vibe-model.js");
const roundTrip = (state) => vibe.initialState(JSON.parse(JSON.stringify(state)));

test("catalog contains fixed official destinations and only a verified official embed", () => {
  assert.deepEqual(vibe.activities.map((activity) => activity.id), ["duolingo", "brilliant", "exercism", "monkeytype", "lichess"]);
  const expectedHosts = {
    duolingo: "www.duolingo.com", brilliant: "brilliant.org", exercism: "exercism.org", monkeytype: "monkeytype.com", lichess: "lichess.org",
  };
  for (const activity of vibe.activities) {
    const url = new URL(activity.url);
    assert.equal(url.protocol, "https:");
    assert.equal(url.hostname, expectedHosts[activity.id]);
    assert.ok(activity.interests.every((id) => vibe.interests.some((interest) => interest.id === id)));
    if (activity.id !== "lichess") {
      assert.equal(activity.embedUrl, null);
      assert.equal(activity.launch, "browser");
    }
  }
  assert.equal(vibe.getActivity("lichess").embedUrl, "https://lichess.org/embed/analysis?theme=brown&bg=dark");
  assert.equal(vibe.getActivity("lichess").launch, "embed");
  assert.ok(Object.isFrozen(vibe.activities));
  assert.ok(Object.isFrozen(vibe.getActivity("duolingo")));
});

test("local preferences, pinned services, and recent order resume after reload", () => {
  let state = vibe.initialState({ version: 2, theme: "light" });
  state = vibe.toggleInterest(state, "languages");
  state = vibe.togglePin(state, "duolingo");
  state = vibe.choose(state, "monkeytype");
  state = vibe.choose(state, "duolingo");
  state = vibe.choose(state, "monkeytype");
  const saved = roundTrip(state);
  assert.deepEqual(saved, state);
  assert.equal(saved.theme, "light");
  assert.deepEqual(saved.interestIds, ["languages"]);
  assert.deepEqual(saved.pinnedIds, ["duolingo"]);
  assert.deepEqual(saved.recentIds, ["monkeytype", "duolingo"]);
  assert.equal(saved.selectedActivityId, "monkeytype");
  const home = vibe.goHome(saved);
  assert.equal(home.selectedActivityId, null);
  assert.deepEqual(home.recentIds, saved.recentIds);
});

test("recommendations reflect explicit interests and stable pinned order", () => {
  const state = vibe.initialState({ version: 2, interestIds: ["languages"], pinnedIds: ["monkeytype", "lichess"] });
  assert.deepEqual(vibe.recommendations(state).map((activity) => activity.id), ["monkeytype", "lichess", "duolingo", "brilliant", "exercism"]);
  const unpinned = vibe.pin(vibe.pin(state, "monkeytype", false), "lichess", false);
  assert.equal(vibe.recommendations(unpinned)[0].id, "duolingo");
  const noInterests = vibe.toggleInterest(unpinned, "languages");
  assert.deepEqual(noInterests.interestIds, []);
  assert.deepEqual(roundTrip(noInterests).interestIds, []);
  assert.deepEqual(vibe.recommendations(noInterests).map((activity) => activity.id), vibe.activities.map((activity) => activity.id));
});

test("malformed state discards unknown IDs, duplicate IDs, and all supplied URLs", () => {
  const state = vibe.initialState({
    version: 2,
    interestIds: ["languages", "languages", "unknown", null, {}],
    pinnedIds: ["duolingo", "https://evil.example", "duolingo"],
    recentIds: ["monkeytype", "monkeytype", "unknown", "lichess"],
    selectedActivityId: "javascript:alert(1)",
    url: "https://evil.example", embedUrl: "https://evil.example/embed",
    activities: [{ id: "duolingo", url: "https://evil.example" }],
  });
  assert.deepEqual(state, {
    version: 2, theme: "system", interestIds: ["languages"], pinnedIds: ["duolingo"], recentIds: ["monkeytype", "lichess"], selectedActivityId: null,
  });
  assert.equal(vibe.getActivity("duolingo").url, "https://www.duolingo.com/learn");
  for (const id of [null, {}, "https://evil.example", "__proto__", "constructor"]) {
    assert.equal(vibe.getActivity(id), null);
    assert.deepEqual(vibe.choose(state, id), state);
    assert.deepEqual(vibe.recordRecent(state, id), state);
    assert.deepEqual(vibe.togglePin(state, id), state);
    assert.deepEqual(vibe.toggleInterest(state, id), state);
  }
});

test("discontinued lesson state is not treated as service preferences", () => {
  const defaults = vibe.initialState();
  assert.deepEqual(defaults.interestIds, []);
  assert.equal(vibe.recommendations(defaults)[0].id, "duolingo");
  for (const raw of [null, [], "garbage", { version: 99 }, {
    version: 1, topicId: "spanish", levelId: "starter", screen: "lesson", progress: { secret: "not imported" },
  }]) assert.deepEqual(vibe.initialState(raw), defaults);
  assert.deepEqual(Object.keys(defaults), ["version", "theme", "interestIds", "pinnedIds", "recentIds", "selectedActivityId"]);
});

test("model transitions never mutate snapshots or duplicate recent and pinned entries", () => {
  const original = vibe.initialState();
  const pinned = vibe.pin(vibe.pin(original, "duolingo"), "duolingo");
  assert.deepEqual(original.pinnedIds, []);
  assert.deepEqual(pinned.pinnedIds, ["duolingo"]);
  const selected = vibe.choose(pinned, "duolingo");
  const repeated = vibe.recordRecent(selected, "duolingo");
  assert.deepEqual(repeated.recentIds, ["duolingo"]);
  assert.deepEqual(vibe.togglePin(repeated, "duolingo").pinnedIds, []);
  const copy = vibe.initialState(repeated);
  copy.interestIds.push("puzzles");
  copy.recentIds.push("lichess");
  assert.deepEqual(repeated.interestIds, []);
  assert.deepEqual(repeated.recentIds, ["duolingo"]);
});
