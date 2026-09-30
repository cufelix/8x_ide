# Meanwhile — workplace install

Get the waiting room running on real agent prompts (this repo or any work project).

## 1. Install the UI extension

```bash
cd /home/felix/projects/slop_ide/extension
npx @vscode/vsce package --allow-missing-repository --skip-license
cursor --install-extension ./meanwhile-0.2.1.vsix --force
```

Then **Developer: Reload Window**.

## 2. Enable hooks (so prompts write `.meanwhile/`)

### This repo only
Already wired via [`.cursor/hooks.json`](.cursor/hooks.json). Trust the workspace if Cursor asks.

### Any project at work
```bash
node /home/felix/projects/slop_ide/scripts/install-user-hooks.mjs
```
Reload Cursor. Sessions land in that project's `.meanwhile/`.

## 3. Keys (optional but recommended)

Export before launching Cursor (or put in your shell profile):

```bash
export OPENROUTER_API_KEY="sk-or-..."   # smarter cards
export ELEVENLABS_API_KEY="..."         # spoken intro
# export YOUTUBE_API_KEY="..."          # official YT API (optional)
```

YouTube **works without** `YOUTUBE_API_KEY` via yt-dlp / browser-sim / curated — see [`docs/YOUTUBE.md`](docs/YOUTUBE.md).

Restart Cursor after exporting so the GUI process inherits env.
## 4. Try it

1. Open a project in Cursor (with extension installed).
2. Start Agent and send something like: *Add Stripe checkout to this Next.js app*.
3. Meanwhile panel should open beside the editor (~half screen) with ETA, stack, video/question.
4. Or smoke without an agent: **Meanwhile: Start Demo Session** / `node scripts/demo-session.mjs "…"`.

## 5. Verify hooks

```bash
echo '{"prompt":"Add Stripe checkout to this Next.js site"}' | node hooks/before-submit-prompt.mjs
cat .meanwhile/session.json | head
```

Expect JSON `{"continue":true}` on stdout and a fresh `.meanwhile/session.json`.
