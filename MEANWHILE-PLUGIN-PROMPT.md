You are building Meanwhile as a Cursor plugin: a VS Code extension whose UI is a sidebar or a webview beside the editor, not a website.

## What this plugin is

Meanwhile is the half-tab you sit with while a Cursor coding agent runs. Chat and the agent thread stay where they are. This panel is the waiting room for that one run: how long it might take, which technologies the task actually touches, one clip, one question when the repo cannot answer a constraint, one sentence of what the agent is doing, and a finish state that points at the diff.

The column is narrow on purpose. Each widget has to earn the space. Judges should see the whole wait in under 30 seconds.

Gesture sources are inspiration only. Do not put their names, scores, leagues, pets, tab-closing nudges, or extra windows in the UI. Take the gesture: a range you can glance at that revises when the run slips (Uber, Lyft, Apple Live Activities); a companion that stays quiet until a real choice, then offers a few moves (drifty, One Sec); a mini player with one next title and a fade to silence (Spotify, YouTube, Overcast, Drift); a run that ends on a single review (GitHub, Copilot).

## Install, and where the panel sits

Ship a VS Code extension. Cursor hosts that extension API. Do not ship a Next.js app, a hosted page, or a single HTML file opened in a browser.

- Contribute either a sidebar view or a command that opens a webview in the editor column beside chat (`ViewColumn.Beside`). The beside-editor half-tab is the surface these widgets were drawn for. A sidebar webview is fine when it is this same column and does not replace chat or the agent thread.
- On agent prompt submit, reveal the panel without stealing focus from chat. A command can open it too.
- The webview draws one column. The editor and the agent thread stay on the other side of the split.
- Live state is `.meanwhile/session.json` in the workspace. Agent hooks write it on prompt submit, agent thought, edits, and stop (wait bucket, elapsed time, stack chips, current clip, the next clip, the question and its answer, the activity sentence, and the stop summary). The webview watches that file and renders it. If those hooks are not in the repo yet, add them and write this file. Do not add a server, and do not fake the panel with preview buttons.
- Install by launching the Extension Development Host, or by packaging a `.vsix` and using Cursor’s “Install from VSIX…”. There is no deploy and no public URL.

## The column, top to bottom

While the agent runs: wait and chips, the track, the player, the question, the activity line. When the agent stops, the header’s lead becomes “Review the diff”.

First paint is never a blank frame. Show “Estimating the wait…” until the heuristic and the chips exist. The video and the question stay absent until the session has them.

### Wait range

Shows one header line, `Meanwhile · ~6–10 min`, and a 2px track of elapsed time against that bucket. Buckets are a local heuristic, not a model call: short 2–4, medium 5–10, long 10–20, marathon 20+. Scope words (“refactor”, “migrate”, “from scratch”) lengthen the bucket. A single-file tweak shortens it. An unclear prompt lands in medium.

Before the heuristic lands, the line reads “Estimating the wait…”. When the run passes the top of the range, the label steps to the next bucket (“Running long · ~10–20 min”) and the track takes the new scale.

Nothing to start or edit. Focusing the track speaks the same fact (“About 2 minutes into an estimated 6 to 10”). It lives in the header and stays a glance.

### Stack chips

Technologies this task actually touches, from a small allowlist (Stripe, Next.js, auth, database, and a few neighbors), on that same header line: `Stripe` `Next.js`. They appear on first paint. A later agent thought adds a chip in place beside the ones already there. Do not rebuild the tab.

They are labels. The row is full when it has named the stack. They do not open docs or take typing. The chips are why this clip and this card appeared.

### Player

One 16:9 well, with title and length (“Stripe Checkout vs Lemon Squeezy”, 6:12). Under it, Up next is one row: the following clip’s title and length. The clip matches the chips, and its length sits inside the wait bucket, so a two-minute task does not open a twenty-minute video. If a short estimate was wrong and the run continues, the well advances to Up next.

Curated clip ids cover the demo stacks, so the pitch works with no API key. With no key, the well plays the curated offline clip and one muted line: “Using the offline set.” If a YouTube key is set, search may replace the curated pick. A missing key stays on the offline set.

Play and pause on the well. Controls stay off the picture until hover. One click on Up next swaps the embed. Space toggles playback when the panel is focused and the question card is closed. When the agent stops, playback stops and the audio eases down over about a second.

The well is the tallest object in the pane. Cap it so the question stays on screen. Up next is a single row. The column stays a player and never becomes a queue.

### One question

One card, and only when the agent is blocked on a constraint the repo cannot answer. Kicker “Meanwhile asks”, title “Only you can decide”, one sentence (“While the agent wires Stripe, pick the constraint it cannot infer from the repo alone.”), three choices:

1. Ship the thinnest vertical slice
2. Preserve existing behavior even if slower
3. Prefer clean internals; polish later

Click a choice, or press 1, 2, or 3 with the panel focused. The picked row marks, then the card collapses to one line (“Constraint: ship the thinnest slice”). That line stays for the rest of the run, and the answer goes back to the agent. One open card. A fourth choice, “Leave it”, collapses to “Left it to the agent”, so a mismatched set of options still exits in one button.

This is the only widget that takes a decision. Three full-width buttons fit the padding. After the collapse, the card is one line and the video still has the room.

### Activity line

One plain sentence for the latest move (“Adding the checkout route”). The previous sentence can sit under it in muted type, then drop. The copy is a verb and an object. Read-only. The line replaces itself in place as the agent moves. The thread on the other side of the split holds the detail. Two lines fit under the card, which keeps the choices on screen.

### Review the diff

When the stop hook fires, the header’s lead becomes “Review the diff”. Under it, one sentence of what changed (“Checkout route added, 4 files”) and a single line, “Agent finished.” Playback has stopped. An answered question remains as its one-line constraint. An unanswered card leaves with the block. The column yields: the diff is the view, and this pane is the pointer.

Activate “Review the diff” and focus moves to the diff in the editor. One action. The finish state is shorter than the wait, and it names the only useful next look.

## Leave out

- Points, XP, scores, leagues, and focus totals. This column is one run. A number in the header wants to be checked. The header should stay a glance.
- Streaks, weekly heatmaps, contribution graphs, and day-count flames. The pane is gone once the diff is open. This surface has no yesterday.
- A second task list: goals, timers, a backlog, or another product’s goal sidebar. The agent thread is already the work in progress. The only list in this column is three choices, once.
- Sounds, confetti, an AI-generated video, a marketplace listing, and ports to editors other than Cursor.
- A second wait estimate from an LLM. The heuristic is enough.
- Preview toggles (Empty / Video / Ask / Both). They are demo chrome, not the product.
- Reference-app names, a tab-closing nudge, and a desktop pet.

## What defines done

Prompt: “Add Stripe checkout to this Next.js site.”

Pass when all of these are true:

- The half-tab opens beside the agent and the agent is not blocked.
- The header shows a wait range and chips for Stripe and Next.js.
- A relevant video is playing or listed, with Up next filling that window.
- One learning card about that stack is visible without scrolling past a giant player.
- The activity line updates while the agent runs.
- When the agent stops, the header offers “Review the diff”.

Ship the widgets in this order, and stop when that demo passes: wait range, one question, activity line, then the player and “Review the diff”. The range is the header of every other widget and needs no video key. The question is the only input, and collapsing it is what keeps the answer from eating the column. The activity line is the proof the agent is moving. The player and the finish state close the demo.

## Theme and layout

One vertical stack, centered, max width 420px, padding 28px, gap 16px. System UI font (`-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `system-ui`, `sans-serif`), 13px, line-height 1.45. Kicker 10px, weight 600, uppercase, tracking 0.1em. Card title 15px, weight 600. Body and choices 13px. Video title and meta 12px. Card padding 16px, radius 10px. Choices stack with a 6px gap, full width, left aligned, radius 7px. Video radius 8px. Children may fade up 10px over 420ms when they appear. A quiet “Meanwhile” mark may sit in the corner. It is not a hero.

Take color from the IDE theme: `editor.background`, `foreground`, `descriptionForeground`, `button.background`, `widget.border`, `focusBorder` (the VS Code CSS variables `--vscode-editor-background` and the matching tokens). Map primary, secondary, and muted text onto `foreground` and `descriptionForeground`. Map borders and focus onto `widget.border` and `focusBorder`.

Do not paint the black marketing stage. No full-bleed `#000` field, no grey radial wash, no vertical gradient to black, no glass blur on a black card, no heavy drop shadows. The panel should look like it belongs in Cursor.
