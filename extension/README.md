# Meanwhile — the panel

The half-tab you sit with while a Cursor agent runs. It renders `.meanwhile/session.json`, which the hooks write, and nothing else.

## Install

```bash
cd extension
npx @vscode/vsce package --allow-missing-repository --skip-license
cursor --install-extension ./meanwhile-0.3.0.vsix --force
```

Reload the Cursor window.

## What it shows

| When | Panel |
| --- | --- |
| No run | Empty stage, corner mark |
| Agent running | `Meanwhile · ~6–10 min · Stripe · Next.js`, one activity line, the clip that fits the wait with an **Up next** line, and at most one question |
| Question answered | The card collapses to the constraint you set; the agent gets it on its next tool call |
| Agent stopped | `Review the diff`, one sentence (“Checkout route added, 4 files”), video stops; after 5 s the column closes and Source Control opens |

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

- `extension.js` — watches `.meanwhile/`, writes only `.meanwhile/answer.json`
- `player-server.js` — localhost YouTube player relay
- `media/view-model.js` — session + clock → what to show (tested in `test/view-model.test.mjs`)
- `media/panel.html` — the webview
