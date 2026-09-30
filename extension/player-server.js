/**
 * Localhost page that hosts the YouTube player.
 * Webviews have no http(s) origin, so YouTube embeds fail there (Error 153).
 * Framing this page gives the embed a real referrer, and it relays
 * play/stop/load commands from the webview to the YouTube IFrame API.
 */
const http = require("http");

const ID_RE = /^[\w-]{11}$/;

function playerPage(videoId, origin) {
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="referrer" content="strict-origin-when-cross-origin">
<style>html,body{margin:0;height:100%;background:transparent;overflow:hidden}#p{width:100%;height:100%}</style>
</head><body><div id="p"></div>
<script>
  var player, ready = false, queued = [];
  function send(msg) { parent.postMessage(Object.assign({ source: "meanwhile-player" }, msg), "*"); }
  function run(cmd) {
    if (!ready) { queued.push(cmd); return; }
    if (cmd.cmd === "stop") player.stopVideo();
    else if (cmd.cmd === "pause") player.pauseVideo();
    else if (cmd.cmd === "load" && /^[\\w-]{11}$/.test(cmd.videoId || "")) {
      cmd.autoplay ? player.loadVideoById(cmd.videoId) : player.cueVideoById(cmd.videoId);
    }
  }
  window.addEventListener("message", function (e) {
    if (e.source === parent && e.data && e.data.target === "meanwhile-player") run(e.data);
  });
  window.onYouTubeIframeAPIReady = function () {
    player = new YT.Player("p", {
      videoId: ${JSON.stringify(videoId)},
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1, origin: ${JSON.stringify(origin)} },
      events: {
        onReady: function () { ready = true; queued.splice(0).forEach(run); send({ type: "ready" }); },
        onStateChange: function (e) { send({ type: "state", state: e.data }); },
        onError: function (e) { send({ type: "error", code: e.data }); }
      }
    });
  };
</script>
<script src="https://www.youtube.com/iframe_api"></script>
</body></html>`;
}

/**
 * @returns {Promise<{ base: string, port: number, close: () => void }>}
 */
function startPlayerServer() {
  return new Promise((resolve, reject) => {
    let origin = "";
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const videoId = url.searchParams.get("v") || "";
      if (url.pathname !== "/player" || !ID_RE.test(videoId)) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("not found");
        return;
      }
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "strict-origin-when-cross-origin",
      });
      res.end(playerPage(videoId, origin));
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      origin = `http://127.0.0.1:${port}`;
      resolve({ base: origin, port, close: () => server.close() });
    });
  });
}

module.exports = { startPlayerServer, playerPage };
