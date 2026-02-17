import http from "node:http";

const port = Number(process.env.PORT || 18081);
const clients = new Set();
let sequence = 0;

const broadcast = (payload) => {
  const serialized = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) {
    client.write(serialized);
  }
};

setInterval(() => {
  sequence += 1;
  const temperature = Number((20 + Math.sin(sequence / 8) * 3).toFixed(2));
  const humidity = Number((52 + Math.cos(sequence / 10) * 4).toFixed(2));

  broadcast({
    sequence,
    timestamp: new Date().toISOString(),
    metrics: {
      temperature,
      humidity,
    },
  });
}, 1000);

const server = http.createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.url !== "/stream") {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
    return;
  }

  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  res.write("retry: 2000\n\n");

  clients.add(res);
  req.on("close", () => {
    clients.delete(res);
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Realtime SSE fixture listening on :${port}`);
});
