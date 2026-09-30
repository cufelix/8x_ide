# Meanwhile — Product Specs

## 1. Problem

Developers send a prompt to a coding agent, then wait minutes with nothing useful to do. Idle agent time is wasted attention.

## 2. Product

**Meanwhile** — a waiting-room half-tab in the IDE that fills agent runtime with personalized stack education.

**One-liner:** While the agent builds, Meanwhile estimates how long you’ll wait and prepares a personalized stack-learning playlist for that window — YouTube research + micro-lessons sized to the run.

## 3. Target user

Developers / technical people using Cursor (or similar) for multi-minute agent runs inside real product work.

## 4. Core experience (must-have)

### 4.1 Stack reaction (hero)

- On prompt submit, detect technologies implied by the ask (and later by agent thoughts).
- Immediately surface that stack in the UI (chips / labels).
- Run a **quick YouTube research** query per top tech (e.g. `Stripe vs Lemon Squeezy`, `Next.js payments tutorial`).
- Show an embedded video (comparison / explainer) in the half-tab without the user leaving the IDE.

### 4.2 Learning layer

- Below / beside the video: short personalized micro-lesson cards tied to the same prompt + stack.
- Card types: explain (what the agent is doing), decision (only human can decide), teach/quiz (stack comparison or ownership check).
- Card count and depth scale with estimated wait (see §4.5), not a fixed number.

### 4.3 Half-tab presentation

- Panel opens as roughly **half of the editor/chat area** (beside the agent).
- Appears as soon as a relevant prompt starts an agent run.
- Stays useful for the duration of the wait; updates if new tech is mentioned.

### 4.4 Live “what it’s doing”

- Lightweight activity strip fed by agent thought/activity hooks.
- Plain language, not raw logs — enough to skim while waiting.

### 4.5 Duration estimate + time-framed activity plan

Right after prompt submit (before the agent finishes):

1. **Estimate run duration** — show a human-readable range in the half-tab header (e.g. “~8–12 min”).
2. **Prepare a wait plan** — a ordered timeline of activities whose total “engagement time” roughly matches the estimate.
3. **Reconcile live** — if the agent stops early, surface “review the diff”; if it runs longer, append more videos/cards or loop related content.

**Estimation (v1 — fast, no blocking hook):**

| Signal | Effect |
| --- | --- |
| Scope words (“refactor”, “entire”, “migrate”, “from scratch”) | +long |
| File/path count or “all tests” | +long |
| Single-file / typo / rename | +short |
| New integration (Stripe, auth, DB) | +medium |
| Default when unclear | medium bucket (~5–8 min) |

Output buckets: **short** (2–4 min), **medium** (5–10 min), **long** (10–20 min), **marathon** (20+ min). Store `estimateSecondsMin`, `estimateSecondsMax`, `confidence`, `signals[]`.

**Activity plan (prepared for the timeframe):**

| Segment type | Typical duration | Scales with |
| --- | --- | --- |
| Primary comparison video | 3–8 min | 1 per hero stack item |
| Related YouTube queue | 2–5 min each | +1 per extra minute over medium |
| Learning cards | ~45–90 sec each | `ceil(estimateMid / 90s)` cards, cap 12 for v1 |
| Decision / quiz beats | ~30 sec | at least 1 per session |
| Live agent narration | continuous | fills gaps between segments |

Plan is stored as `waitPlan: { estimated, segments[] }` where each segment has `type`, `title`, `durationSec`, `payloadRef` (video id or card id).

**UI for the plan:**

- Header: `Meanwhile · ~8 min · Stripe · Next.js` + thin progress bar (elapsed vs estimate).
- “Up next” list below the video so the user sees the full wait path, not one random clip.

**Optional v1.1:** quick LLM or sub-agent call async after hook returns to refine estimate (does not block prompt submit).

## 5. Functional requirements

| ID | Requirement |
| --- | --- |
| FR1 | Capture user prompt when coding agent run starts |
| FR2 | Extract stack keywords from prompt (allowlist OK for v1) |
| FR3 | Refresh/extend stack from agent thoughts when new tech appears |
| FR4 | Build YouTube search queries from detected stack + prompt context |
| FR5 | Fetch video results via YouTube Data API when key present |
| FR6 | Fall back to curated video IDs so demo never shows empty player |
| FR7 | Persist session state under `.meanwhile/` (`session.json`, activity, events) |
| FR8 | Open / reveal half-tab UI when session becomes available |
| FR9 | Render primary YouTube embed + related result list |
| FR10 | Render stack chips, activity feed, and current learning card |
| FR11 | Allow answering / advancing learning cards from the panel |
| FR12 | End or idle the waiting UI when the coding agent stops |
| FR13 | Estimate agent run duration from prompt (heuristic buckets v1) and show range in UI |
| FR14 | Build a ordered wait plan (videos + cards + narration slots) sized to estimated duration |
| FR15 | Advance through wait plan segments; append or shorten when actual run diverges from estimate |

## 6. Non-functional requirements

| ID | Requirement |
| --- | --- |
| NFR1 | First useful content (stack + video or fallback) within ~2s of prompt on a warm machine |
| NFR2 | Works offline for pitch using curated fallbacks |
| NFR3 | No blocking of the coding agent; hooks must exit fast |
| NFR4 | UI dense and IDE-native (not a marketing landing page) |
| NFR5 | Secrets (YouTube API key) via env / user settings, not committed |

## 7. UI layout (half-tab)

1. **Header** — “Meanwhile” + **estimated wait** + stack chips + progress vs estimate
2. **Video** — primary embed + **Up next** queue from wait plan
3. **Activity** — scrolling “agent is…” lines (live) + planned segments (static timeline)
4. **Learn** — current card (title, body, choices / Next)

## 8. Data shapes (v1)

- `stack: string[]`
- `estimate: { secondsMin, secondsMax, bucket, confidence, signals[] }`
- `waitPlan: { segments: { id, type, title, durationSec, payloadRef }[], cursor }`
- `videos: { query, videoId, title, channel, url, durationSec? }[]`
- `cards: { id, kind, title, body, choices?, expectedChoiceId?, xp, media, durationSec? }[]`
- `codingAgent: { status, stoppedAt, startedAt }`
- Activity: append-only JSONL excerpts from thoughts/edits

## 9. System pieces

- **Cursor plugin hooks** — capture prompt, thoughts, stop; write `.meanwhile/` (already started in this repo).
- **Runtime** — stack extract, YouTube research, card generation, session store.
- **Half-tab UI** — VS Code/Cursor **extension webview** (plugins cannot draw UI); watch `.meanwhile/` and render.
- **MCP (thin)** — status / current card for agent-side queries.

## 10. Demo scenario (acceptance)

Prompt: *“Add Stripe checkout to this Next.js site.”*

Pass if all true:

1. Half-tab opens beside the agent.
2. Header shows an estimated wait (e.g. ~6–10 min) and stack chips (Stripe, Next.js).
3. “Up next” lists multiple segments (video + cards) that roughly fill that window.
4. A relevant YouTube comparison/explainer is playing or listed.
5. At least one learning card about that stack is visible.
6. Activity updates while the agent runs.
7. Coding agent continues unblocked in the other half.

## 11. Out of scope (hackathon v1)

- AI-generated video (Remotion / avatar)
- Full Duolingo XP / streaks / leaderboards UI
- Parsing every tool call beyond thoughts
- Marketplace publish (local install for demo)
- Non-Cursor IDEs

## 12. Success metric (hackathon)

Judges understand in under 30 seconds: *agent wait time → estimated duration → a pre-built learning path for that window (stack reaction + YouTube + cards) in a half-tab.*
