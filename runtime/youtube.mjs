/**
 * YouTube research for Meanwhile.
 *
 * Fast path (inside the prompt hook): curated short clips per stack — no network.
 * Enrich path (background, see enrich.mjs):
 *   1) YouTube Data API when YOUTUBE_API_KEY is set
 *   2) yt-dlp search (no key)
 *   3) YouTube results page scrape (no key, best effort)
 * Every list is ordered so the first clip fits the estimate.
 */
import { spawnSync } from "node:child_process";
import { estimateMidSeconds } from "./estimate.mjs";

const CURATED = {
  Stripe: [
    { videoId: "7edR32QVp_A", title: "Get Paid with Stripe in 100 Seconds", channel: "Fireship", durationSec: 130 },
    { videoId: "7WFXl4-aCxs", title: "Build better payment forms using embedded Stripe Checkout", channel: "Beyond Fireship", durationSec: 364 },
  ],
  "Next.js": [
    { videoId: "__mSgDEOyv8", title: "Next.js 13 - The Basics", channel: "Beyond Fireship", durationSec: 540 },
  ],
  React: [{ videoId: "Tn6-PIqc4UM", title: "React in 100 Seconds", channel: "Fireship", durationSec: 128 }],
  Postgres: [
    { videoId: "n2Fluyr3lbc", title: "PostgreSQL in 100 Seconds", channel: "Fireship", durationSec: 157 },
    { videoId: "zsjvFFKOm3c", title: "SQL Explained in 100 Seconds", channel: "Fireship", durationSec: 143 },
  ],
  Prisma: [
    { videoId: "rLRIB6AF2Dg", title: "Prisma in 100 Seconds", channel: "Fireship", durationSec: 154 },
    { videoId: "i_mAHOhpBSA", title: "Drizzle ORM in 100 Seconds", channel: "Fireship", durationSec: 174 },
  ],
  Supabase: [{ videoId: "zBZgdTb-dns", title: "Supabase in 100 Seconds", channel: "Fireship", durationSec: 157 }],
  Tailwind: [{ videoId: "mr15Xzb1Ook", title: "Tailwind in 100 Seconds", channel: "Fireship", durationSec: 141 }],
  TypeScript: [{ videoId: "zQnBQ4tB3ZA", title: "TypeScript in 100 Seconds", channel: "Fireship", durationSec: 145 }],
  Auth: [{ videoId: "ZV5yTm4pT8g", title: "OAuth 2 Explained In Simple Terms", channel: "ByteByteGo", durationSec: 272 }],
  Docker: [
    { videoId: "Gjnup-PuquQ", title: "Docker in 100 Seconds", channel: "Fireship", durationSec: 127 },
    { videoId: "rIrNIzy6U_g", title: "100+ Docker Concepts you Need to Know", channel: "Fireship", durationSec: 508 },
  ],
  Redis: [{ videoId: "G1rOthIU-uo", title: "Redis in 100 Seconds", channel: "Fireship", durationSec: 146 }],
  GraphQL: [
    { videoId: "eIQh02xuVw4", title: "GraphQL Explained in 100 Seconds", channel: "Fireship", durationSec: 142 },
    { videoId: "yWzKJPw_VzM", title: "What Is GraphQL? REST vs. GraphQL", channel: "ByteByteGo", durationSec: 315 },
  ],
  "Node.js": [{ videoId: "BwM1V4_dl14", title: "Node.js Explained In 100 Seconds", channel: "Simplified", durationSec: 134 }],
  Vue: [
    { videoId: "nhBVL41-_Cw", title: "Vue.js Explained in 100 Seconds", channel: "Fireship", durationSec: 124 },
    { videoId: "dCxSsr5xuL8", title: "Nuxt in 100 Seconds", channel: "Fireship", durationSec: 170 },
  ],
  Svelte: [
    { videoId: "rv3Yq-B8qp4", title: "Svelte in 100 Seconds", channel: "Fireship", durationSec: 132 },
    { videoId: "H1eEFfAkIik", title: "SvelteKit in 100 Seconds", channel: "Fireship", durationSec: 166 },
  ],
  default: [
    { videoId: "exjhaHmZk8g", title: "99% of Developers Don't Understand AI Agents", channel: "CodeHead", durationSec: 228 },
    { videoId: "FwOTs4UxQS4", title: "AI Agents, Clearly Explained", channel: "Jeff Su", durationSec: 609 },
  ],
};

function withUrl(item) {
  return { ...item, url: `https://www.youtube.com/watch?v=${item.videoId}` };
}

/** Longest clip that still fits comfortably inside the wait. */
export function fitLimitSeconds(estimate) {
  if (!estimate) return 600;
  return Math.max(150, Math.round(estimateMidSeconds(estimate) * 0.8));
}

/**
 * Keep relevance order among clips that fit; clips that do not fit (or whose
 * length is unknown) go last, shortest first.
 */
export function orderForEstimate(videos, estimate) {
  const limit = fitLimitSeconds(estimate);
  const fits = [];
  const rest = [];
  for (const v of videos || []) {
    if (Number.isFinite(v.durationSec) && v.durationSec <= limit) fits.push(v);
    else rest.push(v);
  }
  rest.sort((a, b) => (a.durationSec ?? Infinity) - (b.durationSec ?? Infinity));
  return [...fits, ...rest];
}

export function curatedForStack(stack = []) {
  const seen = new Set();
  const out = [];
  const keys = [...stack, "default"];
  for (const key of keys) {
    for (const item of CURATED[key] || []) {
      if (seen.has(item.videoId)) continue;
      seen.add(item.videoId);
      out.push(withUrl({ ...item, query: key, source: "curated" }));
    }
    if (key !== "default" && out.length >= 3) break;
  }
  return out;
}

export function buildQueries(stack, prompt = "") {
  const top = stack.slice(0, 2);
  if (!top.length) return ["AI coding agents explained"];
  const checkoutish = /checkout|payment|billing/i.test(prompt);
  return top.map((tech) =>
    checkoutish && tech === "Stripe" ? "Stripe checkout explained" : `${tech} explained`
  );
}

/** ISO 8601 (PT4M13S) → seconds. */
export function parseIsoDuration(iso) {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(iso || ""));
  if (!m) return null;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}

async function searchYouTubeApi(query, apiKey) {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("videoEmbeddable", "true");
  url.searchParams.set("maxResults", "3");
  url.searchParams.set("q", query);
  url.searchParams.set("key", apiKey);
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`YouTube API ${res.status}`);
  const items = (await res.json()).items || [];
  const ids = items.map((i) => i.id.videoId).filter(Boolean);
  const durations = await fetchDurations(ids, apiKey);
  return items.map((item) =>
    withUrl({
      videoId: item.id.videoId,
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
      query,
      durationSec: durations.get(item.id.videoId) ?? null,
      source: "youtube-api",
    })
  );
}

async function fetchDurations(ids, apiKey) {
  const out = new Map();
  if (!ids.length) return out;
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "contentDetails");
  url.searchParams.set("id", ids.join(","));
  url.searchParams.set("key", apiKey);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return out;
    for (const item of (await res.json()).items || []) {
      out.set(item.id, parseIsoDuration(item.contentDetails?.duration));
    }
  } catch {
    // Unknown durations sort last; nothing else to do.
  }
  return out;
}

function envFlag(name) {
  return ["1", "true"].includes(String(process.env[name] || "").toLowerCase());
}

function searchViaYtDlp(query, limit = 3) {
  if (envFlag("MEANWHILE_DISABLE_YTDLP")) return [];
  const result = spawnSync(
    "yt-dlp",
    [`ytsearch${limit}:${query}`, "--flat-playlist", "--print", "%(id)s|||%(title)s|||%(channel)s|||%(duration)s", "--no-warnings", "--quiet"],
    { encoding: "utf8", timeout: 15000, maxBuffer: 1024 * 1024 }
  );
  if (result.status !== 0 || !result.stdout) return [];
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [videoId, title, channel, duration] = line.split("|||");
      if (!videoId || videoId.length !== 11) return null;
      const durationSec = Number(duration);
      return withUrl({
        videoId,
        title: title || query,
        channel: channel && channel !== "NA" ? channel : "YouTube",
        query,
        durationSec: Number.isFinite(durationSec) && durationSec > 0 ? Math.round(durationSec) : null,
        source: "yt-dlp",
      });
    })
    .filter(Boolean);
}

async function searchViaResultsPage(query, limit = 3) {
  if (envFlag("MEANWHILE_DISABLE_BROWSER_SEARCH")) return [];
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%253D%253D`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) return [];
    return parseResultsPage(await res.text(), query, limit);
  } catch {
    return [];
  }
}

function decodeJsonString(raw) {
  try {
    return JSON.parse(`"${raw}"`);
  } catch {
    return raw;
  }
}

/** Pull id, title and length from each videoRenderer block of a results page. */
export function parseResultsPage(html, query, limit = 3) {
  const out = [];
  const seen = new Set();
  for (const chunk of String(html).split('"videoRenderer":{"videoId":"').slice(1)) {
    const videoId = chunk.slice(0, 11);
    if (!/^[\w-]{11}$/.test(videoId) || seen.has(videoId)) continue;
    const block = chunk.slice(0, 8000);
    const title = /"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)+)"/.exec(block)?.[1];
    const length = /"lengthText":\{.*?"simpleText":"([\d:]+)"/.exec(block)?.[1];
    if (!title || !length) continue;
    seen.add(videoId);
    const durationSec = length.split(":").map(Number).reduce((acc, n) => acc * 60 + n, 0);
    out.push(withUrl({ videoId, title: decodeJsonString(title), channel: "YouTube", query, durationSec, source: "results-page" }));
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Network research. Returns [] when every tier comes back empty; callers keep
 * the curated clips they already have.
 * @param {{ stack: string[], prompt?: string }} input
 */
export async function researchVideos({ stack, prompt = "" }) {
  const apiKey = (process.env.YOUTUBE_API_KEY || "").trim();
  const queries = buildQueries(stack, prompt);
  if (apiKey) {
    const batches = await Promise.all(queries.map((q) => searchYouTubeApi(q, apiKey).catch(() => [])));
    if (batches.flat().length) return dedupe(batches.flat());
  }
  const viaYtDlp = queries.flatMap((q) => searchViaYtDlp(q));
  if (viaYtDlp.length) return dedupe(viaYtDlp);
  const viaPage = (await Promise.all(queries.map((q) => searchViaResultsPage(q)))).flat();
  return dedupe(viaPage);
}

export function dedupe(videos) {
  const seen = new Set();
  return videos.filter((v) => v?.videoId && !seen.has(v.videoId) && seen.add(v.videoId));
}

export function youtubeResearchMode() {
  if ((process.env.YOUTUBE_API_KEY || "").trim()) return "youtube-api";
  return "no-key (curated → yt-dlp → results page)";
}
