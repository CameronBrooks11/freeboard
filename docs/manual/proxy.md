# HTTP Proxy Service

## Overview

The proxy service forwards client requests to arbitrary URLs to bypass CORS restrictions. It uses Express and Node’s built-in `http` and `https` modules to proxy both `GET` and `POST` requests.

## Core Handler

- **Endpoints**: `GET /proxy` and `POST /proxy`
- **URL Extraction**: Reads the `url` query parameter from the incoming request
- **Protocol Detection**: Checks `url.protocol` to choose `http` or `https`
- **Request Options**:
  - `host`, `port`, `protocol`, `path`, `method`, and original `headers`
  - For HTTPS, uses `new https.Agent({ rejectUnauthorized: false, servername: url.hostname })` to disable certificate verification
- **Data Flow**:
  - Pipes request body for `POST` methods
  - Streams the upstream response back to the client

## Server Setup (`src/index.js`)

- Applies `bodyParser.text({ type: "*/*" })` to parse all bodies as text
- Registers the `handler` for both `app.post("/proxy", handler)` and `app.get("/proxy", handler)`
- Starts listening on `PORT` (default `8001`) at `0.0.0.0`

## Dockerfile

- **Base Image**: `node:18-alpine` for a minimal footprint
- **Workdir**: `/usr/app`
- **Copy & Install**: Copies all files and runs `npm install`
- **Expose**: Port `8001`
- **CMD**: `npm run start`

## Running Locally

1. Install dependencies: `npm install`
2. Start the service: `npm run start`

## Notes

- The `url` parameter must be URL-encoded when calling the proxy
- Certificate verification is disabled for HTTPS targets—consider enabling `rejectUnauthorized` in production for security
