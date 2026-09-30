/**
 * Meanwhile view model: session.json + clock → what the half-tab shows.
 * Pure; loaded by the webview as a script and by node tests via require.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.MeanwhileView = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  const MAX_CHIPS = 3;
  const UNKNOWN_CLIP_SEC = 360;

  function formatRange(secondsMin, secondsMax) {
    return `~${Math.round(secondsMin / 60)}–${Math.round(secondsMax / 60)} min`;
  }

  /** Push the range out once the run outlives it (never show "0 min"). */
  function liveEstimate(estimate, elapsedSec) {
    if (!estimate || !Number.isFinite(estimate.secondsMin) || !Number.isFinite(estimate.secondsMax)) return null;
    if (elapsedSec <= estimate.secondsMax) return estimate;
    const width = Math.max(120, Math.round((estimate.secondsMax - estimate.secondsMin) / 2));
    const secondsMin = Math.ceil((elapsedSec + 60) / 60) * 60;
    const secondsMax = secondsMin + Math.ceil(width / 60) * 60;
    return { ...estimate, secondsMin, secondsMax, label: formatRange(secondsMin, secondsMax), extended: true };
  }

  function formatLength(sec) {
    if (!Number.isFinite(sec) || sec <= 0) return null;
    const s = Math.round(sec);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = String(s % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
  }

  /** Clip index for this moment: roll forward each time a clip would have ended. */
  function clipIndex(videos, elapsedSec) {
    let end = 0;
    for (let i = 0; i < videos.length; i += 1) {
      end += videos[i].durationSec || UNKNOWN_CLIP_SEC;
      if (elapsedSec < end) return i;
    }
    return videos.length - 1;
  }

  function questionView(question) {
    if (!question || !Array.isArray(question.choices)) return null;
    if (question.answer) {
      return { state: "set", line: question.answer.constraint || question.answer.label, pickedId: question.answer.choiceId };
    }
    return {
      state: "open",
      kicker: question.kicker || "Only you can decide",
      title: question.title,
      body: question.body || "",
      choices: question.choices.slice(0, 3).map((c) => ({ id: c.id, label: c.label })),
    };
  }

  function choiceForKey(question, key) {
    if (!question || question.answer) return null;
    const n = Number(key);
    if (!Number.isInteger(n) || n < 1) return null;
    return question.choices?.[n - 1]?.id ?? null;
  }

  const FEED_SHOWN = 12;
  const EXPLAIN_SHOWN = 4;

  /** "now", "40s", "3m", "1h" since an ISO time. */
  function agoLabel(iso, now) {
    const t = Date.parse(iso || "");
    if (!Number.isFinite(t)) return "";
    const s = Math.max(0, Math.round((now - t) / 1000));
    if (s < 5) return "now";
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    return `${Math.floor(s / 3600)}h`;
  }

  function feedView(session, now) {
    return (Array.isArray(session.feed) ? session.feed : []).slice(0, FEED_SHOWN).map((e) => ({
      key: `${e.id}@${e.at}`,
      kind: e.kind,
      label: e.label,
      detail: e.detail || "",
      status: e.status || null,
      ago: agoLabel(e.at, now),
    }));
  }

  function explainView(session, now) {
    return (Array.isArray(session.explain) ? session.explain : []).slice(0, EXPLAIN_SHOWN).map((e) => ({
      id: e.id,
      path: e.path,
      text: e.text,
      concept: e.concept || null,
      pending: e.status === "pending",
      ago: agoLabel(e.at, now),
    }));
  }

  function schemaView(session) {
    const s = session.schema;
    if (!s || !Array.isArray(s.nodes) || !s.nodes.length) return null;
    return { nodes: s.nodes, edges: Array.isArray(s.edges) ? s.edges : [] };
  }

  const EMPTY = {
    phase: "none",
    headerText: null,
    eta: null,
    chips: [],
    progressPct: 0,
    activityLine: null,
    feed: [],
    explain: [],
    schema: null,
    video: null,
    upNext: null,
    question: null,
    summary: null,
    stageEmpty: true,
  };

  /**
   * @param {object|null} session
   * @param {number} now
   * @param {{ pinnedVideoId?: string|null, minClip?: number }} [watch]
   *   pinnedVideoId: the clip the user is watching (never swapped mid-watch);
   *   minClip: clips the player saw end, so Up next can come early.
   */
  function buildView(session, now, watch = {}) {
    if (!session) return EMPTY;
    const agent = session.codingAgent || {};
    const started = Date.parse(agent.startedAt || session.source?.capturedAt || "") || now;

    if (agent.status === "stopped") {
      return {
        ...EMPTY,
        phase: "stopped",
        headerText: "Review the diff",
        progressPct: 100,
        summary: session.summary || "Agent finished",
        explain: explainView(session, now),
        schema: schemaView(session),
        stageEmpty: false,
      };
    }

    const elapsedSec = Math.max(0, (now - started) / 1000);
    const estimate = liveEstimate(session.estimate, elapsedSec);
    const chips = (session.stack || []).slice(0, MAX_CHIPS);
    const eta = estimate?.label || null;
    const videos = Array.isArray(session.videos) ? session.videos : [];

    let video = null;
    let upNext = null;
    if (videos.length) {
      const pinned = videos.findIndex((v) => v.videoId === watch.pinnedVideoId);
      const i =
        pinned !== -1
          ? pinned
          : Math.min(videos.length - 1, Math.max(clipIndex(videos, elapsedSec), watch.minClip || 0));
      const clip = videos[i];
      video = {
        videoId: clip.videoId,
        title: clip.title,
        url: clip.url || `https://www.youtube.com/watch?v=${clip.videoId}`,
        lengthLabel: formatLength(clip.durationSec),
        index: i,
        why: clip.concept || null,
      };
      const next = videos[i + 1];
      upNext = next ? { title: next.title, lengthLabel: formatLength(next.durationSec), why: next.concept || null } : null;
    }

    const question = questionView(session.question);
    const feed = feedView(session, now);
    const explain = explainView(session, now);
    return {
      phase: "running",
      headerText: ["Meanwhile", eta, ...chips].filter(Boolean).join(" · "),
      eta,
      chips,
      progressPct: estimate ? Math.min(97, Math.max(3, (elapsedSec / estimate.secondsMax) * 100)) : 6,
      activityLine: session.activity?.line || null,
      feed,
      explain,
      schema: schemaView(session),
      video,
      upNext,
      question,
      summary: null,
      stageEmpty: !video && !question && !feed.length && !explain.length,
    };
  }

  return { agoLabel, buildView, choiceForKey, clipIndex, formatLength, liveEstimate, formatRange };
});
