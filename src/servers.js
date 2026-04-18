const http = require("http");
const { WebSocketServer } = require("ws");

// Danh sách client SSE và WebSocket đang kết nối
let sseClients = new Set();
let wsClients = new Set();
let scaleConnected = false;
// Trạng thái hiện tại của cân, dùng để gửi cho client mới kết nối
let scaleState = { connected: false, weight: null, unit: null, model: null, path: null, baudRate: null, error: null, message: null, event: null };

// Cập nhật một phần trạng thái cân
function updateScaleState(patch) {
  Object.assign(scaleState, patch);
}

// Phát sự kiện tới tất cả client SSE và WebSocket
function sseEmit(event, data) {
  const payload = { ...scaleState, event, ...data };
  const sseMsg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) res.write(sseMsg);

  const wsMsg = JSON.stringify(payload);
  for (const ws of wsClients) if (ws.readyState === ws.OPEN) ws.send(wsMsg);
  return payload;
}

// Cập nhật trạng thái kết nối cân
function setScaleConnected(value) {
  scaleConnected = value;
  scaleState.connected = value;
}

// Khởi động HTTP server phục vụ SSE và WebSocket cho client bên ngoài
function startSseServer() {
  const port = parseInt(process.env.SSE_PORT || "3000", 10);

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);

    // Endpoint trả về trạng thái cân dạng JSON
    if (url.pathname === "/scale/status") {
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify(scaleState));
      return;
    }

    // Chỉ chấp nhận kết nối tới /events
    if (url.pathname !== "/events") {
      res.writeHead(404);
      res.end();
      return;
    }

    // Thiết lập kết nối SSE và gửi trạng thái hiện tại ngay lập tức
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    res.write("retry: 3000\n\n");
    res.write(`event: state\ndata: ${JSON.stringify(scaleState)}\n\n`);
    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
  });

  // WebSocket server dùng chung cổng với HTTP server
  const wss = new WebSocketServer({ server, path: "/events" });
  wss.on("connection", (ws) => {
    wsClients.add(ws);
    // Gửi trạng thái hiện tại cho client mới kết nối
    ws.send(JSON.stringify(scaleState));
    ws.on("close", () => wsClients.delete(ws));
  });

  server.listen(port, () => console.log(`[sse] listening on http://localhost:${port}/events`));
}

// Khởi động HTTP server nhận callback OAuth redirect
function startAuthServer({ getAuthWin, setAuthWin, getWin, sendError }) {
  let authServer;
  try {
    const redirectUri = new URL(process.env.REDIRECT_URI);
    const port = redirectUri.port || 80;
    authServer = http
      .createServer((req, res) => {
        try {
          const url = new URL(req.url, redirectUri.origin);
          // Xử lý callback OAuth: đóng cửa sổ auth và gửi params về renderer
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

module.exports = { startSseServer, startAuthServer, sseEmit, setScaleConnected, updateScaleState };
