# HTTP Proxy Service

## Overview

The proxy service forwards selected client requests to upstream URLs to bypass browser CORS restrictions.

It is hardened to reduce SSRF risk and unsafe TLS behavior:

- protocol restriction (`http` / `https` only)
- destination host allowlist (required in production)
- destination port allowlist
- private/internal destination blocking (hostname + resolved IP checks)
- minimal outbound request headers (no raw header passthrough)
- TLS verification enabled by default

## Core Handler

- **Endpoints**: `GET /proxy` and `POST /proxy`
- **URL Extraction**: Reads the `url` query parameter from the incoming request
- **Validation**:
  - Rejects non-HTTP(S) protocols
  - Rejects disallowed hosts/ports
  - Resolves DNS and rejects blocked private/internal addresses
- **Request Options**:
  - Uses `hostname`, normalized `path`, explicit `method`, and safe outbound headers
  - HTTPS uses `https.Agent` with certificate validation enabled unless explicit dev override is set
- **Data Flow**:
  - Forwards supported request body content for write methods
  - Streams upstream response with size cap enforcement

## Server Setup (`src/index.js`)

- Applies `bodyParser.text({ type: "*/*" })` to parse all bodies as text
- Registers the `handler` for both `app.post("/proxy", handler)` and `app.get("/proxy", handler)`
- Starts listening on `PORT` (default `8001`) at `0.0.0.0`

## Key Environment Variables

- `PROXY_ALLOWED_HOSTS`: comma-separated destination host allowlist (required in production)
- `PROXY_ALLOWED_PORTS`: comma-separated allowed ports (default: `80,443`)
- `PROXY_TIMEOUT_MS`: upstream timeout in milliseconds
- `PROXY_MAX_RESPONSE_BYTES`: max response payload size in bytes
- `PROXY_ALLOW_PRIVATE_DESTINATIONS`: set `true` only for controlled local/dev use
- `PROXY_ALLOW_INSECURE_TLS`: set `true` only for controlled local/dev use

## Dockerfile

- **Base Image**: `node:18-alpine` for a minimal footprint
- **Workdir**: `/usr/app`
- **Copy & Install**: Copies all files and runs `npm install`
- **Expose**: Port `8001`
- **CMD**: `npm run start`

## Running Locally

1. Install dependencies: `npm install`
2. Start proxy workspace only: `npm run start:proxy`

## Notes

- The `url` parameter must be URL-encoded when calling the proxy
- In production, keep `PROXY_ALLOW_INSECURE_TLS=false` and define a strict `PROXY_ALLOWED_HOSTS` list
- In containerized deployment (`docker-compose.yml`), startup is fail-fast unless `PROXY_ALLOWED_HOSTS` is set
