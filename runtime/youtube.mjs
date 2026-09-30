/**
 * YouTube research for Meanwhile:
 * 1) YouTube Data API when YOUTUBE_API_KEY is set (can replace the curated pick)
 * 2) Curated offline clips when the key is missing, so the demo is never empty
 * Optional MEANWHILE_YT_SEARCH=1 tries yt-dlp / a results page before the offline set.
 */
import { spawnSync } from "node:child_process";

const FALLBACKS = {
  Stripe: [
    {
      videoId: "c-1o0TzkdO0",
      title: "Stripe in 100 Seconds",
      channel: "Fireship",
      query: "Stripe checkout tutorial",
      durationSec: 150,
    },
    {
      videoId: "1r-F3FIONl8",
      title: "Payment system design",
      channel: "ByteByteGo",
      query: "Stripe vs alternatives",
      durationSec: 480,
    },
  ],
  "Next.js": [
    {
      videoId: "SklcXCR4TbY",
      title: "Next.js in 100 Seconds",
      channel: "Fireship",
      query: "Next.js App Router",
      durationSec: 150,
    },
  ],
  Postgres: [
    {
      videoId: "qw--VYLpxG4",
      title: "PostgreSQL tutorial",
      channel: "freeCodeCamp",
      query: "Postgres tutorial",
      durationSec: 600,
    },
  ],
  Prisma: [
    {
      videoId: "CY5F45uT1zA",
      title: "Prisma crash course",
      channel: "Traversy Media",
      query: "Prisma tutorial",
      durationSec: 360,
    },
  ],
  Auth: [
    {
      videoId: "X7_LPkuZAqQ",
      title: "Auth.js / NextAuth explained",
      channel: "Fireship",
      query: "web authentication patterns",
      durationSec: 300,
    },
  ],
  React: [
    {
      videoId: "Tn6-PIqc4UM",
      title: "React in 100 seconds",
      channel: "Fireship",
      query: "React overview",
      durationSec: 120,
    },
  ],
  Tailwind: [
    {
      videoId: "mr15Xzb1Ook",
      title: "Tailwind CSS in 100 seconds",
      channel: "Fireship",
      query: "Tailwind CSS",
      durationSec: 120,
    },
  ],
  default: [
    {
      videoId: "DuDz6B4cqVc",
      title: "How AI coding agents work",
      channel: "Fireship",
      query: "AI coding agents",
      durationSec: 360,
    },
  ],
};

function withUrl(item) {
  return {
    ...item,
    url: `https://www.youtube.com/watch?v=${item.videoId}`,
  };
}

function curatedForStack(stack) {
  const videos = [];
  const seen = new Set();
  const keys = stack.length ? stack : ["default"];
  for (const key of keys) {
    for (const item of FALLBACKS[key] || []) {
      if (seen.has(item.videoId)) continue;
      seen.add(item.videoId);
      videos.push(withUrl({ ...item, source: "curated", offline: true }));
    }
  }
  if (!videos.length) {
    return FALLBACKS.default.map((item) =>
      withUrl({ ...item, source: "curated", offline: true })
    );
  }
  return videos;
}

/** Prefer clips that finish inside the wait. Longer ones stay available as Up next. */
function orderForWait(videos, estimate) {
  const max = estimate?.secondsMax;
  if (!max) return videos;
  const fits = [];
  const over = [];
  for (const video of videos) {
    const dur = video.durationSec || 360;
    if (dur <= max) fits.push(video);
    else over.push(video);
  }
  if (!fits.length) return videos;
  return fits.concat(over);
}

function buildQueries(stack, prompt = "") {
  const top = (stack.length ? stack : ["default"]).slice(0, 3);
  const checkoutish = /checkout|payment|billing|stripe/i.test(prompt);
  return top.map((tech) => {
    if (tech === "default") return "AI coding agents explained";
    if (checkoutish && /stripe|next\.?js|lemon/i.test(tech)) {
      return `${tech} vs alternatives checkout comparison`;
    }
    return `${tech} tutorial explained`;
  });
}

async function searchYouTubeApi(query, apiKey) {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", "2");
  url.searchParams.set("q", query);
  url.searchParams.set("key", apiKey);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`YouTube API ${res.status}`);
  }
  const data = await res.json();
  return (data.items || []).map((item) =>
    withUrl({
      videoId: item.id.videoId,
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
      query,
      durationSec: 360,
      source: "youtube-api",
    })
  );
}

/**
 * Browser-like search without an API key — uses yt-dlp's YouTube search
 * extractor (same results a browser search would surface).
 */
function searchViaYtDlp(query, limit = 2) {
  const disable =
    String(process.env.MEANWHILE_DISABLE_YTDLP || "").toLowerCase() === "1" ||
    String(process.env.MEANWHILE_DISABLE_YTDLP || "").toLowerCase() === "true";
  if (disable) {
    return [];
  }

  const result = spawnSync(
    "yt-dlp",
    [
      `ytsearch${limit}:${query}`,
      "--flat-playlist",
      "--print",
      "%(id)s|||%(title)s|||%(channel)s|||%(duration)s",
      "--no-warnings",
      "--quiet",
    ],
    {
      encoding: "utf8",
      timeout: 12000,
      maxBuffer: 1024 * 1024,
    }
  );

  if (result.status !== 0 || !result.stdout) {
    return [];
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [videoId, title, channel, duration] = line.split("|||");
      if (!videoId || videoId.length < 6) return null;
      const durationSec = duration && duration !== "NA" ? Number(duration) : 360;
      return withUrl({
        videoId,
        title: title || query,
        channel: channel && channel !== "NA" ? channel : "YouTube",
        query,
        durationSec: Number.isFinite(durationSec) ? durationSec : 360,
        source: "yt-dlp",
      });
    })
    .filter(Boolean);
}

async function searchViaBrowserPage(query, limit = 2) {
  // Lightweight HTML scrape of YouTube results page (no API key).
  // Used when yt-dlp is unavailable. Best-effort; may break if YT markup changes.
  const disable =
    String(process.env.MEANWHILE_DISABLE_BROWSER_SEARCH || "").toLowerCase() ===
      "1" ||
    String(process.env.MEANWHILE_DISABLE_BROWSER_SEARCH || "").toLowerCase() ===
      "true";
  if (disable) return [];

  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(
      query
    )}&sp=EgIQAQ%253D%253D`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const html = await res.text();
    const ids = [...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)].map(
      (m) => m[1]
    );
    const titles = [
      ...html.matchAll(/"title":\{"runs":\[\{"text":"([^"]+)"\}\]/g),
    ].map((m) => m[1]);
    const unique = [];
    const seen = new Set();
    for (let i = 0; i < ids.length && unique.length < limit; i += 1) {
      const videoId = ids[i];
      if (seen.has(videoId)) continue;
      seen.add(videoId);
      unique.push(
        withUrl({
          videoId,
          title: titles[i] || query,
          channel: "YouTube",
          query,
          durationSec: 360,
          source: "browser-sim",
        })
      );
    }
    return unique;
  } catch {
    return [];
  }
}

function allowLiveSearch() {
  const flag = String(process.env.MEANWHILE_YT_SEARCH || "").toLowerCase();
  return flag === "1" || flag === "true";
}

/**
 * @param {{ stack: string[], prompt?: string, estimate?: object }} input
 */
export async function researchVideos({ stack, prompt = "", estimate = null }) {
  const apiKey = (process.env.YOUTUBE_API_KEY || "").trim();
  const queries = buildQueries(stack, prompt);
  const seen = new Set();
  const collected = [];

  const pushAll = (list) => {
    for (const item of list || []) {
      if (!item?.videoId || seen.has(item.videoId)) continue;
      seen.add(item.videoId);
      collected.push(item);
    }
  };

  if (apiKey) {
    try {
      const batches = await Promise.all(
        queries.map((q) => searchYouTubeApi(q, apiKey).catch(() => []))
      );
      pushAll(batches.flat());
      if (collected.length) {
        return orderForWait(collected, estimate).slice(0, 4);
      }
    } catch {
      // Missing or rejected key: play the offline set.
    }
  }

  if (allowLiveSearch()) {
    for (const q of queries) {
      pushAll(searchViaYtDlp(q, 2));
      if (collected.length >= 4) break;
    }
    if (!collected.length) {
      for (const q of queries) {
        pushAll(await searchViaBrowserPage(q, 2));
        if (collected.length >= 4) break;
      }
    }
    if (collected.length) {
      return orderForWait(collected, estimate).slice(0, 4);
    }
  }

  return orderForWait(curatedForStack(stack), estimate).slice(0, 4);
}

export function youtubeResearchMode() {
  if ((process.env.YOUTUBE_API_KEY || "").trim()) return "youtube-api";
  if (allowLiveSearch()) return "no-key search, then curated";
  return "offline";
}
