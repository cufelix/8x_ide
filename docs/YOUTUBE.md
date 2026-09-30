# YouTube for Meanwhile

Meanwhile shows one clip for the stack in the header, plus an **Up next** line.

The prompt hook writes curated short clips immediately (no network, so the agent is never held up). A detached `runtime/enrich.mjs` then researches more clips for Up next:

| Priority | Mode | Needs |
| --- | --- | --- |
| — | Curated short clips in `runtime/youtube.mjs` (always first) | nothing |
| 1 | YouTube Data API `search.list` + `videos.list` (lengths) | `YOUTUBE_API_KEY` |
| 2a | **yt-dlp** `ytsearchN:…` (no key) | `yt-dlp` on PATH |
| 2b | YouTube results page scrape (no key, best effort) | network |

Clips are ordered to fit the estimate: anything longer than ~80% of the expected wait, or with an unknown length, goes to the back. When a clip ends and the agent is still working, the panel rolls forward to Up next.

## Get a YouTube Data API key (optional)

1. Open [Google Cloud Console](https://console.cloud.google.com/)
2. Create/select a project
3. **APIs & Services → Enable APIs** → enable **YouTube Data API v3**
4. **Credentials → Create credentials → API key**
5. (Recommended) Restrict the key to YouTube Data API v3
6. Export before starting Cursor:

```bash
export YOUTUBE_API_KEY="AIza..."
```

Or add to your shell profile / a file Cursor’s process inherits.

Quota: default free tier is enough for hackathon demos (search units add up; keep queries to 2–3 per prompt).

## No key (default at work)

If `yt-dlp` is installed (`which yt-dlp`), Meanwhile searches YouTube the same way a browser search would, without Google credentials:

```bash
yt-dlp "ytsearch2:Stripe vs Lemon Squeezy" --flat-playlist --print "%(id)s|||%(title)s"
```

Install if missing:

```bash
# Debian/Ubuntu
sudo apt install yt-dlp
# or
pipx install yt-dlp
```

Disable tiers if needed:

```bash
export MEANWHILE_DISABLE_YTDLP=1
export MEANWHILE_DISABLE_BROWSER_SEARCH=1   # curated only
```

## Verify

```bash
# no-key path (uses yt-dlp)
unset YOUTUBE_API_KEY
node --input-type=module -e '
import { researchVideos, youtubeResearchMode } from "./runtime/youtube.mjs";
console.log(youtubeResearchMode());
console.log(await researchVideos({ stack: ["Stripe"], prompt: "checkout" }));
'
```

Expect `source: "yt-dlp"` (or `results-page`) on each researched clip.
