import { estimateMidSeconds } from "./estimate.mjs";

/**
 * Build an ordered wait plan sized to the ETA.
 * @param {{ estimate: object, videos: object[], cards: object[], stack: string[] }} input
 */
export function buildWaitPlan({ estimate, videos, cards, stack }) {
  const mid = estimateMidSeconds(estimate);
  const segments = [];
  let budget = mid;

  const primary = videos[0];
  if (primary) {
    const dur = Math.min(primary.durationSec || 360, Math.max(180, Math.floor(mid * 0.45)));
    segments.push({
      id: "seg-video-0",
      type: "video",
      title: primary.title,
      durationSec: dur,
      payloadRef: primary.videoId,
    });
    budget -= dur;
  }

  for (let i = 1; i < videos.length && budget > 120; i += 1) {
    const v = videos[i];
    const dur = Math.min(v.durationSec || 240, 300);
    segments.push({
      id: `seg-video-${i}`,
      type: "video",
      title: v.title,
      durationSec: dur,
      payloadRef: v.videoId,
    });
    budget -= dur;
  }

  const cardBudget = Math.max(1, Math.min(cards.length, Math.ceil(mid / 90)));
  for (let i = 0; i < cardBudget; i += 1) {
    const c = cards[i];
    if (!c) {
      break;
    }
    const dur = c.kind === "decision" || c.kind === "quiz" ? 45 : 70;
    segments.push({
      id: `seg-card-${c.id}`,
      type: "card",
      title: c.title,
      durationSec: dur,
      payloadRef: c.id,
    });
    budget -= dur;
  }

  segments.push({
    id: "seg-narration",
    type: "narration",
    title: stack.length
      ? `Watch the agent work on ${stack.slice(0, 2).join(" + ")}`
      : "Watch what the agent is doing",
    durationSec: Math.max(60, budget),
    payloadRef: "activity",
  });

  return {
    estimated: estimate,
    cursor: 0,
    segments,
  };
}
