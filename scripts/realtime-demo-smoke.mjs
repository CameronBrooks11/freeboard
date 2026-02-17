import net from "node:net";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assertHttpOk = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} responded with ${response.status}`);
  }
};

const assertSseEvent = async (url) => {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 10000);
  let reader = null;

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "text/event-stream",
      },
    });

    if (!response.ok || !response.body) {
      throw new Error(`SSE endpoint failed (${response.status})`);
    }

    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        throw new Error("SSE stream ended before first event");
      }

      buffer += decoder.decode(value, { stream: true });
      while (true) {
        const splitCandidates = [buffer.indexOf("\r\n\r\n"), buffer.indexOf("\n\n")].filter(
          (value) => value >= 0,
        );
        if (splitCandidates.length === 0) {
          break;
        }

        const splitIndex = Math.min(...splitCandidates);
        const delimiterLength = buffer.startsWith("\r\n\r\n", splitIndex) ? 4 : 2;
        const eventBlock = buffer.slice(0, splitIndex);
        buffer = buffer.slice(splitIndex + delimiterLength);

        const dataLines = eventBlock
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice("data:".length).trimStart());
        if (dataLines.length === 0) {
          continue;
        }

        const rawPayload = dataLines.join("\n").trim();
        JSON.parse(rawPayload);
        return;
      }
    }
  } catch (error) {
    if (timedOut && error?.name === "AbortError") {
      throw new Error("SSE smoke check timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    try {
      await reader?.cancel();
    } catch {
      // Ignore cleanup errors.
    }
  }
};

const assertWebSocketEvent = async (url) => {
  if (typeof WebSocket !== "function") {
    console.warn(
      "Skipping WebSocket smoke check: WebSocket client API unavailable in this Node runtime",
    );
    return;
  }

  await new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("WebSocket smoke check timed out"));
    }, 10000);

    socket.addEventListener("message", (event) => {
      clearTimeout(timeout);
      try {
        JSON.parse(String(event.data || "{}"));
      } catch (error) {
        reject(error);
        socket.close();
        return;
      }
      socket.close();
      resolve();
    });

    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("WebSocket smoke check failed"));
    });
  });
};

const assertMqttPort = async (host, port) => {
  await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error(`MQTT port ${host}:${port} timed out`));
    }, 5000);

    socket.on("connect", () => {
      clearTimeout(timeout);
      socket.end();
      resolve();
    });

    socket.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
};

const main = async () => {
  await assertHttpOk("http://127.0.0.1:18081/healthz");
  await assertHttpOk("http://127.0.0.1:18082/healthz");

  await assertSseEvent("http://127.0.0.1:18081/stream");
  await assertWebSocketEvent("ws://127.0.0.1:18082/stream");
  await assertMqttPort("127.0.0.1", 1884);

  console.log("Realtime demo smoke checks passed.");
};

await main();
await wait(0);
