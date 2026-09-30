#!/usr/bin/env node
// Development host only. The iframe uses the real panel and real activity sites.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const media = join(root, "extension", "media");
const model = createRequire(import.meta.url)(join(media, "vibe-model.js"));
const assets = {
  VIEW_MODEL: "view-model.js", VIBE_MODEL: "vibe-model.js", VIBE_UI: "vibe-ui.js",
  VIBE_BRIDGE: "vibe-bridge.js", VIBE_CSS: "vibe.css",
};
const allowedFiles = new Set(Object.values(assets));
const frameOrigins = [...new Set(model.activities.filter((a) => a.embedUrl).map((a) => new URL(a.embedUrl).origin))];
const csp = `default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https://i.ytimg.com data:; frame-src ${frameOrigins.join(" ") || "'none'"};`;
const shell = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Meanwhile · Vibe preview</title><style>
*{box-sizing:border-box}body{margin:0;background:#10120f;color:#e7e8e2;font:13px system-ui}header{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 18px;border-bottom:1px solid #35392e}header strong{margin-right:auto}button{font:inherit;background:#23271f;color:inherit;border:1px solid #48513a;border-radius:6px;padding:7px 12px;cursor:pointer}#preview{display:block;width:min(460px,100%);height:calc(100dvh - 95px);min-height:450px;margin:14px auto;border:1px solid #35392e;border-radius:10px;background:#171916}#note{color:#b5bbae;font-size:11px}
</style></head><body><header><strong>Meanwhile / browser preview</strong><span id="note">Agent status is simulated. Activity sites are real.</span><button id="ready">Simulate agent finished</button><button id="size">Narrow panel</button><button id="theme">Light theme</button></header><script src="/vibe-model.js"></script><script src="/preview-host.js"></script></body></html>`;
const host = `(() => {
  const model = window.MeanwhileVibe;
  const key = 'meanwhile.vibe.browser.preview.v1';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(key) || '{}'); } catch {}
  let state = model.initialState(saved?.state), mode = saved?.mode === 'work' ? 'work' : 'vibe';
  let finished = false, light = false;
  const frame = document.createElement('iframe'); frame.id = 'preview'; frame.title = 'Meanwhile Vibe';
  const send = data => frame.contentWindow.postMessage(data, location.origin);
  const session = () => ({ id:'preview-run', source:{capturedAt:new Date().toISOString()}, codingAgent:{status:finished?'stopped':'running'}, summary:finished?'Demo coding task finished.':'', stack:['JavaScript'], estimate:{secondsMin:300,secondsMax:600,label:'~5–10 min'}, videos:[] });
  const push = () => send({type:'state',payload:{session:session(),now:Date.now(),playerBase:null,voiceUri:null}});
  const persist = () => localStorage.setItem(key, JSON.stringify({state,mode}));
  const theme = () => {
    const body = frame.contentDocument?.body; if (!body) return;
    body.className = light ? 'vscode-light' : 'vscode-dark';
    const styles = frame.contentDocument.documentElement.style;
    styles.setProperty('--vscode-editor-background',light?'#fcfcf8':'#171916');
    styles.setProperty('--vscode-editor-foreground',light?'#24291f':'#ecebe6');
    styles.setProperty('--vscode-descriptionForeground',light?'#59604f':'#a6ac9d');
  };
  window.previewHost = {
    dispatch(msg) {
      if (msg.type === 'ready') { theme(); send({type:'vibeInit',payload:{mode,state}}); push(); }
      if (msg.type === 'vibeSave') {
        state = model.initialState(msg.state);
        try { persist(); send({type:'vibeSaved',requestId:msg.requestId,ok:true}); }
        catch { send({type:'vibeSaved',requestId:msg.requestId,ok:false}); }
      }
      if (msg.type === 'setMode') { mode = msg.mode === 'vibe' ? 'vibe' : 'work'; try { persist(); } catch {} send({type:'mode',mode}); push(); }
      if (msg.type === 'openActivity') {
        const activity = model.getActivity(msg.activityId);
        const tab = activity && mode === 'vibe' ? window.open(activity.url, '_blank') : null;
        if (tab) tab.opener = null;
        send({type:'activityOpened',activityId:msg.activityId,ok:!!tab});
      }
      if (msg.type === 'openDiff') document.getElementById('note').textContent = 'In Cursor, this opens Source Control. This preview has no repository connection.';
    }
  };
  document.getElementById('ready').onclick = event => { finished = !finished; event.target.textContent = finished ? 'Simulate agent running' : 'Simulate agent finished'; push(); };
  document.getElementById('size').onclick = event => { const narrow = frame.dataset.narrow !== 'true'; frame.dataset.narrow = narrow; frame.style.width = narrow ? 'min(320px,100%)' : 'min(460px,100%)'; event.target.textContent = narrow ? 'Wider panel' : 'Narrow panel'; };
  document.getElementById('theme').onclick = event => { light = !light; theme(); event.target.textContent = light ? 'Dark theme' : 'Light theme'; };
  frame.src = '/panel.html'; document.body.append(frame);
})();`;
const shim = "window.acquireVsCodeApi = () => ({postMessage: message => window.parent.previewHost.dispatch(message)});";
const server = createServer((req, res) => {
  const pathname = new URL(req.url, "http://127.0.0.1").pathname;
  let body, type = "text/javascript";
  if (pathname === "/") { body = shell; type = "text/html"; }
  else if (pathname === "/preview-host.js") body = host;
  else if (pathname === "/preview-shim.js") body = shim;
  else if (pathname === "/panel.html") {
    type = "text/html";
    body = readFileSync(join(media, "panel.html"), "utf8")
      .replace(/\{\{CSP\}\}/g, csp)
      .replace(/\{\{(VIEW_MODEL|VIBE_MODEL|VIBE_UI|VIBE_BRIDGE|VIBE_CSS)\}\}/g, (_, name) => "/" + assets[name])
      .replace("</head>", '<script src="/preview-shim.js"></script></head>');
  } else if (allowedFiles.has(pathname.slice(1))) {
    body = readFileSync(join(media, pathname.slice(1)), "utf8");
    if (pathname.endsWith(".css")) type = "text/css";
  } else { res.writeHead(404); res.end("Not found"); return; }
  res.writeHead(200, { "Content-Type": type + "; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(body);
});
server.listen(Number(process.env.PORT || 0), "127.0.0.1", () => {
  console.log(`Vibe preview: http://127.0.0.1:${server.address().port}`);
});
server.on("error", error => { console.error(error.message); process.exitCode = 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
