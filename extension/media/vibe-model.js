/** Real services, fixed destinations, and local Vibe preferences. No account data. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MeanwhileVibe = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const interests = [
    { id: "languages", label: "Languages", description: "Keep a language moving." },
    { id: "puzzles", label: "Puzzles", description: "Give your brain a different problem." },
    { id: "coding", label: "Coding", description: "Practice away from your project." },
    { id: "typing", label: "Typing", description: "Find your keyboard rhythm." },
  ];

  // Public response headers checked 2026-09-30. Duolingo, Brilliant and
  // Exercism send X-Frame-Options: SAMEORIGIN; Monkeytype sends DENY plus
  // CSP frame-ancestors 'none'. Their real sites therefore open in a browser.
  // Lichess officially supports its analysis embed at lichess.org/developers;
  // that endpoint returned 200 with no framing restriction on the same date.
  const activities = [
    {
      id: "duolingo", title: "Duolingo", mark: "Du",
      description: "Continue learning a language on Duolingo.",
      url: "https://www.duolingo.com/learn", embedUrl: null, launch: "browser",
      interests: ["languages"], reason: "Continue on the real Duolingo site in your browser.",
    },
    {
      id: "brilliant", title: "Brilliant", mark: "Br",
      description: "Explore interactive math and coding lessons.",
      url: "https://brilliant.org/", embedUrl: null, launch: "browser",
      interests: ["puzzles", "coding"], reason: "Continue on the real Brilliant site in your browser.",
    },
    {
      id: "exercism", title: "Exercism", mark: "Ex",
      description: "Practice a programming language with real exercises.",
      url: "https://exercism.org/tracks", embedUrl: null, launch: "browser",
      interests: ["coding"], reason: "Continue on the real Exercism site in your browser.",
    },
    {
      id: "monkeytype", title: "Monkeytype", mark: "mt",
      description: "Take a typing test and work on accuracy and speed.",
      url: "https://monkeytype.com/", embedUrl: null, launch: "browser",
      interests: ["typing"], reason: "Continue on the real Monkeytype site in your browser.",
    },
    {
      id: "lichess", title: "Lichess", mark: "♞",
      description: "Explore moves on a real chess analysis board.",
      url: "https://lichess.org/analysis",
      embedUrl: "https://lichess.org/embed/analysis?theme=brown&bg=dark", launch: "embed",
      interests: ["puzzles"], reason: "The official Lichess analysis board runs here.",
    },
  ];

  function freeze(value) {
    if (value && typeof value === "object") {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  freeze(interests);
  freeze(activities);

  const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  const knownInterest = (id) => interests.some((interest) => interest.id === id);
  const knownActivity = (id) => activities.some((activity) => activity.id === id);

  function getActivity(id) {
    return typeof id === "string" ? activities.find((activity) => activity.id === id) || null : null;
  }

  function knownIds(value, predicate) {
    return Array.isArray(value) ? [...new Set(value.filter((id) => typeof id === "string" && predicate(id)))] : [];
  }

  /** Saved data can select catalog IDs, but can never add a destination URL. */
  function initialState(raw) {
    const source = isRecord(raw) && raw.version === 2 ? raw : {};
    return {
      version: 2,
      interestIds: knownIds(source.interestIds, knownInterest),
      pinnedIds: knownIds(source.pinnedIds, knownActivity),
      recentIds: knownIds(source.recentIds, knownActivity).slice(0, activities.length),
      selectedActivityId: knownActivity(source.selectedActivityId) ? source.selectedActivityId : null,
    };
  }

  function toggleInterest(raw, id) {
    const state = initialState(raw);
    if (!knownInterest(id)) return state;
    const interestIds = state.interestIds.includes(id) ? state.interestIds.filter((item) => item !== id) : state.interestIds.concat(id);
    return { ...state, interestIds };
  }

  function pin(raw, id, pinned = true) {
    const state = initialState(raw);
    if (!knownActivity(id)) return state;
    const without = state.pinnedIds.filter((item) => item !== id);
    return { ...state, pinnedIds: pinned === true ? (state.pinnedIds.includes(id) ? state.pinnedIds : without.concat(id)) : without };
  }

  function togglePin(raw, id) {
    const state = initialState(raw);
    return pin(state, id, !state.pinnedIds.includes(id));
  }

  function recordRecent(raw, id) {
    const state = initialState(raw);
    if (!knownActivity(id)) return state;
    return { ...state, recentIds: [id, ...state.recentIds.filter((item) => item !== id)].slice(0, activities.length) };
  }

  function choose(raw, id) {
    const state = initialState(raw);
    if (!knownActivity(id)) return state;
    return { ...recordRecent(state, id), selectedActivityId: id };
  }

  function goHome(raw) { return { ...initialState(raw), selectedActivityId: null }; }

  /** Explicit preferences only: pinned first, then interest overlap, then catalog order. */
  function recommendations(raw) {
    const state = initialState(raw);
    const score = (activity) => activity.interests.filter((id) => state.interestIds.includes(id)).length;
    return activities.slice().sort((a, b) => {
      const aPin = state.pinnedIds.indexOf(a.id);
      const bPin = state.pinnedIds.indexOf(b.id);
      if (aPin >= 0 || bPin >= 0) {
        if (aPin < 0) return 1;
        if (bPin < 0) return -1;
        return aPin - bPin;
      }
      return score(b) - score(a) || activities.indexOf(a) - activities.indexOf(b);
    });
  }

  return { interests, activities, getActivity, initialState, toggleInterest, pin, togglePin, choose, recordRecent, goHome, recommendations };
});
