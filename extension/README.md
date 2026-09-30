# Meanwhile — UI + live session

Half-screen waiting room for Cursor / VS Code.

## Install

```bash
cd extension
npx @vscode/vsce package --allow-missing-repository --skip-license
cursor --install-extension ./meanwhile-0.2.0.vsix --force
```

Reload Cursor window. Open this repo as the workspace.

## Try it (no agent needed)

1. **Cmd/Ctrl+Shift+P** → **Meanwhile: Start Demo Session**  
   (or **Cmd/Ctrl+Alt+Shift+M**)
2. Panel opens beside the editor with stack chips, ETA, YouTube embed, and a question.
3. Or from terminal:

```bash
node scripts/demo-session.mjs "Add Stripe checkout to this Next.js site"
```

Then **Meanwhile: Open** if the panel did not auto-appear.

## With a real agent run

When the Cursor plugin hooks are enabled for this project, submitting a coding prompt writes `.meanwhile/session.json`. The extension watches that folder and opens the panel automatically.

## Keys

| Shortcut | Command |
| --- | --- |
| Ctrl/Cmd+Alt+M | Meanwhile: Open |
| Ctrl/Cmd+Alt+Shift+M | Meanwhile: Start Demo Session |

Optional: set `YOUTUBE_API_KEY` for live YouTube search (otherwise curated fallbacks).
Set `OPENROUTER_API_KEY` / `ELEVENLABS_API_KEY` for smarter cards and voice (see `WORKPLACE.md`).
