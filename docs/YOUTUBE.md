# YouTube for Meanwhile

Meanwhile fills the waiting room with relevant videos. Research is **three tiers**:

| Priority | Mode | Needs |
| --- | --- | --- |
| 1 | YouTube Data API `search.list` | `YOUTUBE_API_KEY` |
| 2a | **yt-dlp** `ytsearchN:…` (browser-like search, no key) | `yt-dlp` on PATH |
| 2b | HTML results scrape (fetch YouTube search page) | network |
| 3 | Curated embed IDs in code | nothing |

You never get an empty player if curated fallbacks exist.

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

Expect `source: "yt-dlp"` (or `browser-sim` / curated) on each video.
