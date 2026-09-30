# Meanwhile — handoff (2026-09-30)

Read this first if you are picking the project up. Product brief: `Meanwhile_Features` (on main). Setup: `WORKPLACE.md`.

## How it fits together

```
Cursor hooks (hooks/*.mjs) ──write──▶ .meanwhile/session.json ◀──read── extension (webview panel)
      │                                   ▲                              │
      └─ runtime/*.mjs (pure logic)       └── .meanwhile/answer.json ◀───┘ (panel writes only this)
```

- **Hooks** are the only writers of `session.json`. All writes go through `withSessionLock` (`runtime/store.mjs`) because hooks run as parallel processes.
- **beforeSubmitPrompt** writes a full session with no network (curated clip + question bank), then spawns `runtime/enrich.mjs` detached for YouTube research / LLM question.
- **postToolUse** hands the user's answer to the agent once (`additional_context`); **stop** sends it as `followup_message` if the agent never saw it, otherwise marks the run stopped with a one-line summary.
- **Extension** (`extension/`) renders via `media/view-model.js` (pure, tested). YouTube plays through a localhost page (`player-server.js`) because webviews cannot embed YouTube (Error 153).

## Verified live in Cursor (demo project `~/projects/meanwhile-demo`)

Real agent run, prompt "Add Stripe checkout to this Next.js shop…":
- panel opened on prompt submit with `Meanwhile · ~6–10 min · Stripe · Next.js`, clip + Up next, question card
- activity line followed the agent's thoughts and edits
- answer "Stripe-hosted Checkout" reached the agent via postToolUse (agent thought: "The user requires customers to pay via a Stripe-hosted…")
- clip rolled forward on the clock; range extended to ~14–16 min when the run ran long
- stop → "Review the diff · <summary>, 11 files", Source Control opened

## Tests

`npm test` — 54 tests (node:test): estimate, activity phrasing, question, stack, youtube ordering/parsing, view model, layout rules, hook integration (real hook processes, including a race test that fails without the lock).

## In progress — adaptive layout (extension 0.4.0, NOT yet verified in Cursor)

Goal from the user: very minimal UI that resizes with attention.
- Focus in Meanwhile → it widens; focus in the agent pane → Meanwhile narrows (`extension/adaptive.js`, rules in `extension/layout.js`). Uses `workbench.action.increaseViewWidth` (60px steps on the *focused* part). **Unknown:** whether a focused webview counts as the editor part for that command. If not, "widen" does nothing — test it and fall back to focusing the auxiliary bar + `decreaseViewWidth`.
- Video playing → theater: `workbench.action.maximizeEditorHideSidebar`; pause/end/Esc → reopen via `toggleAuxiliaryBar` + `toggleSidebarVisibility`. **Caveat:** VS Code cannot tell an extension which side bars were open, so exit reopens both even if one was closed before.
- Narrow layout (`@container (max-width: 380px)` in `panel.html`) hides Up next, hint, question body, activity.
- Setting `meanwhile.adaptiveLayout` (default on).

To test: install `extension/meanwhile-0.4.0.vsix`, reload, start a session, click the agent input (panel should narrow), click the panel (should widen), press play (theater).

## Known issues / next

1. **User-level hooks are stale.** `~/.cursor/hooks.json` on the dev machine has the old set (no `postToolUse`). Run `node scripts/install-user-hooks.mjs` (changes global Cursor config — ask the user). If both user and project hooks exist, prompts are de-duplicated (`isDuplicateSubmit`), other hooks just run twice harmlessly.
2. Activity line sometimes shows a raw sentence ("The checkout route replacement failed") instead of a phrase — `describeThought` only rewrites intent forms ("Let me…", "I'll…").
3. Agent runs pause on MCP approvals (context7) — not Meanwhile's concern, but it stalls demos.
4. Proposed next product step (discussed, not approved yet): wait-length–based modes — <3 min tip only, 3–10 min learn (clip + 3 generated bullets), >10 min "do something of your own" with an in-panel LLM helper (drafting mail etc.), plus a pre-review checklist near the end. See the conversation summary in the PR.
