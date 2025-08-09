/**
 * @module proxy/index
 * @description HTTP proxy service to bypass CORS by forwarding client requests to target URLs.
 *  - Supports IPv4-first DNS resolution to avoid IPv6 localhost issues
 *  - Allows GET and POST forwarding
 *  - Disables SSL verification for HTTPS targets (self-signed support)
 */

import * as http from "http";
import * as https from "https";
import express from "express";
import bodyParser from "body-parser";
import dns from "dns";

/** @typedef {Object} ExpressRequest */
/** @typedef {Object} ExpressResponse */

/**
 * Force DNS resolution to prefer IPv4 to avoid IPv6 (::1) binding issues.
 */
dns.setDefaultResultOrder?.("ipv4first");

/**
 * Port the proxy server listens on.
 * @constant {number}
 */
const PORT = Number(process.env.PORT || 8001);

/**
 * Host address the proxy server binds to.
 * @constant {string}
 */
const HOST = process.env.HOST || "0.0.0.0";

const app = express();

// Parse all request bodies as text for proxy forwarding
app.use(bodyParser.text({ type: "*/*" }));

/**
 * Handle incoming proxy requests.
 *
 * Extracts the `url` query parameter, constructs an HTTP(S) request to that URL,
 * and pipes the response back to the client. Supports GET and POST methods.
 *
 * @param {ExpressRequest}  clientReq  - Express request object
 * @param {ExpressResponse} clientRes  - Express response object
 */
const handler = (clientReq, clientRes) => {
  // Build target URL from ?url=...
  const url = new URL(
    new URL(
      clientReq.url || "",
      `https://${clientReq.headers.host}`
    ).searchParams.get("url")
  );

  const isHttps = url.protocol.indexOf("https") === 0;

  const options = {
    host: url.host,
    port: isHttps ? 443 : url.port,
    protocol: url.protocol,
    path: url.href,
    method: clientReq.method,
    headers: clientReq.headers,
  };

  // If HTTPS, disable certificate verification for self-signed targets
  if (isHttps) {
    options.agent = new https.Agent({
      rejectUnauthorized: false,
      servername: url.hostname,
    });
  }

  // Forward request to target
  const proxy = (isHttps ? https : http).request(options, (res) => {
    clientRes.writeHead(res.statusCode, res.headers);
    res.pipe(clientRes, { end: true });
  });

  proxy.on("error", (e) => console.error(e));

  // Forward request body for POST methods
  if (["POST"].includes(options.method)) {
    proxy.write(clientReq.body);
  }

  clientReq.pipe(proxy, { end: true });
};

// Register proxy endpoints
app.post("/proxy", handler);
app.get("/proxy", handler);

/**
 * Start the Express server.
 */
app.listen(PORT, HOST, () => {
  const printableHost =
    HOST === "0.0.0.0" || HOST === "::" ? "127.0.0.1" : HOST;
  console.log(`Proxy listening on http://${printableHost}:${PORT}`);
});
