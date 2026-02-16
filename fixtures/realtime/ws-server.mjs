import http from "node:http";
import { WebSocketServer } from "ws";

const port = Number(process.env.PORT || 18082);

const server = http.createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
});

const wss = new WebSocketServer({
  server,
  path: "/stream",
});

let sequence = 0;

setInterval(() => {
  sequence += 1;
  const payload = JSON.stringify({
    sequence,
    timestamp: new Date().toISOString(),
    metrics: {
      power: Number((120 + Math.sin(sequence / 6) * 12).toFixed(2)),
      load: Number((0.55 + Math.cos(sequence / 5) * 0.1).toFixed(3)),
    },
  });

  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.send(payload);
    }
  }
}, 1000);

wss.on("connection", (socket) => {
  socket.send(
    JSON.stringify({
      type: "hello",
      timestamp: new Date().toISOString(),
    })
  );
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Realtime WebSocket fixture listening on :${port}`);
});
