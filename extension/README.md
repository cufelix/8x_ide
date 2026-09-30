# Meanwhile — the panel

The half-tab you sit with while a Cursor agent runs. **Work** follows the agent's session; **Vibe** opens real learning and practice services.

## Try Vibe locally

From the repository root:

```bash
cursor --new-window --extensionDevelopmentPath="$PWD/extension" "$PWD"
```

In that Extension Development Host, run **Meanwhile: Open Vibe** from the command palette. No running agent or API key is required. Use the **Work / Vibe** buttons to switch modes. Individual services may require their own account.

For a browser-only UI preview, run `npm run preview:vibe` at the repository root and open the printed local URL. The preview toolbar simulates the agent finishing, panel widths, and themes. It uses the actual panel assets and real activity sites, with a simulated extension host. Preferences are stored separately in that browser; the preview does not run a coding agent or modify repository files.

Choose interests, pin favorites, and reopen recent activities. Recommendations use your explicit interests and favorites. The first catalog contains:

| Service | Opens in |
| --- | --- |
| Duolingo | Your browser, for real language lessons and existing progress |
| Brilliant | Your browser, for math and coding lessons |
| Exercism | Your browser, for programming practice |
| Monkeytype | Your browser, for typing practice |
| Lichess | The right-hand pane, using its official interactive analysis-board iframe; also has an Open in browser button |

The first four services block cross-origin iframes through their response headers (checked September 30, 2026). Vibe honors those restrictions. Lichess documents its supported embed at [lichess.org/developers](https://lichess.org/developers). No service is cloned, proxied, or scraped. Logins, subscriptions, streaks, and lesson progress remain with the real service. An embedded board may reset when the panel is closed or the editor reloads.

When the coding agent finishes during Vibe, a **Your code is ready** banner appears. Vibe stays open; **Back to work** opens Source Control. Work retains its existing automatic return to Source Control after an agent finishes.

Interests, favorites, and recent activity IDs use the extension's local `globalState`, shared across workspaces on this device. Vibe does not read service accounts, track lesson progress, or send preferences to the coding agent. Opening a service is an explicit click; restoring a browser-only activity does not automatically open another tab.

OpenRouter and ElevenLabs are optional existing Work integrations. Their keys belong in `~/.config/meanwhile.env` or process environment variables (see `.env.example`), never in the webview, catalog, or Git. Vibe itself does not need or transmit those keys.

## Install

```bash
cd extension
npx @vscode/vsce package --allow-missing-repository --skip-license
cursor --install-extension ./meanwhile-0.5.0.vsix --force
```

Reload the Cursor window. If an older build keeps loading, remove `~/.cursor/extensions/meanwhile.meanwhile-*` first.

## What Work shows

| When | Panel |
| --- | --- |
| No run | Empty stage, corner mark |
| Agent running | `Meanwhile · ~6–10 min · Stripe · Next.js`, one activity line, the clip that fits the wait with an **Up next** line, and at most one question |
| Agent reads, searches, runs, edits | **Live** feed, newest first: `Read app/page.tsx`, `Ran npm test · exit 1`, `Edited lib/db.ts +4 −1`, the agent's own thoughts |
| Agent edits a file | **What the code does**: a line from the file's imports and exports at once, replaced by a plain-language explanation from the model a few seconds later |
| Files change | **How it connects**: the changed files, the unchanged project files they import (faded), and their packages, drawn from the real imports |
| The explanation names a concept | One clip for that concept is queued as **Up next** (`Up next · Stripe webhooks · …`) |
| Question answered | The card collapses to the constraint you set; the agent gets it on its next tool call |
| Agent stopped | `Review the diff`, one sentence (“Checkout route added, 4 files”), **What changed** with the explanations and the diagram, video stops; the column then closes and Source Control opens (5 s, plus 4 s per explanation, at most 21 s) |

The feed, explanations and diagram come from Cursor hooks (`postToolUse`, `afterFileEdit`, `afterAgentThought`). Explanations use OpenRouter when `OPENROUTER_API_KEY` is set (`MEANWHILE_EXPLAIN_MODEL` overrides the model); without a key the code-derived line stays. The model sees the task, the changed code and the first ~3 KB of the file; nothing is sent to the webview except the result. Hooks running twice (user and project `hooks.json`) are deduplicated.

Colors come from the active theme (`--vscode-*` variables).

## Keys

| Shortcut | What it does |
| --- | --- |
| Ctrl/Cmd+Alt+M | Open and focus the panel. Pressed again with a question open, it moves through the choices; **Enter** answers |
| 1 / 2 / 3 | Answer the open question (panel focused) |
| Ctrl/Cmd+Alt+Shift+M | Demo session (Meanwhile repo open) |

## Video

Webviews cannot embed YouTube directly (Error 153: no referrer), so the extension serves a player page on `127.0.0.1:<random port>` and frames it. If that server cannot start, the panel shows a thumbnail that opens YouTube.

## Files

- `extension.js` — watches `.meanwhile/`, writes coding constraints to `.meanwhile/answer.json`, persists Vibe through VS Code local storage
- `player-server.js` — localhost YouTube player relay
- `media/view-model.js` — session + clock → what to show (tested in `test/view-model.test.mjs`)
- `media/panel.html` — the webview
- `media/vibe-model.js` — fixed service catalog, preference validation, and recommendation ordering
- `media/vibe-ui.js` / `media/vibe.css` — activity shelf, real iframe, and scoped styles
- `media/vibe-bridge.js` — mode switching, preference saves, and browser-open messages
- `../scripts/preview-vibe.mjs` — local development preview with the real panel assets

Run `npm test` from the repository root to check the session runtime, Vibe preferences, browser destination validation, and extension-host behavior. Add services to the model's fixed catalog; enable `embedUrl` only for officially supported embeds. The host resolves activity IDs to catalog URLs and derives its iframe CSP allowlist from that catalog.
