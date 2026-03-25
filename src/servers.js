const http = require("http");

let sseClients = new Set();
let scaleConnected = false;

function sseEmit(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) res.write(msg);
}

function setScaleConnected(value) {
  scaleConnected = value;
}

function startSseServer() {
  const port = parseInt(process.env.SSE_PORT || "3000", 10);
  http
    .createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`);

      if (url.pathname === "/scale/status") {
        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify({ connected: scaleConnected }));
        return;
      }

      if (url.pathname !== "/events") {
        res.writeHead(404);
        res.end();
        return;
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      res.write("retry: 3000\n\n");
      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
    })
    .listen(port, () => console.log(`[sse] listening on http://localhost:${port}/events`));
}

function startAuthServer({ getAuthWin, setAuthWin, getWin, sendError }) {
  let authServer;
  try {
    const redirectUri = new URL(process.env.REDIRECT_URI);
    const port = redirectUri.port || 80;
    authServer = http
      .createServer((req, res) => {
        try {
          const url = new URL(req.url, redirectUri.origin);
          if (url.pathname === redirectUri.pathname) {
            const params = url.search.substring(1);
            const authWin = getAuthWin();
            if (authWin) {
              authWin.close();
              setAuthWin(null);
            }
            getWin()?.webContents.send("auth-callback", params);
            if (getWin()) {
              getWin().show();
              getWin().focus();
            }
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end("<html><body><p>Login successful.</p></body></html>");
          } else {
            res.writeHead(404);
            res.end();
          }
        } catch (err) {
          sendError(`[authServer:request] ${err?.stack || err}`);
          res.writeHead(500);
          res.end();
        }
      })
      .listen(port);
    authServer.on("error", (err) => sendError(`[authServer] ${err?.stack || err}`));
  } catch (err) {
    sendError(`[startAuthServer] ${err?.stack || err}`);
  }
  return authServer;
}

module.exports = { startSseServer, startAuthServer, sseEmit, setScaleConnected };
