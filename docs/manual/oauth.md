# OAuth Proxy Service

## Overview

The OAuth proxy is a lightweight Express application that handles OAuth flows for Freeboard using Grant and `express-session`. It listens on port `9001` (configurable via `PORT`) and dynamically proxies OAuth requests back to the client.

## Server Setup (`src/index.js`)

- Initializes an Express app
- Uses `express-session` with a static secret for session management
- Mounts Grant middleware via `grant.express()` with defaults:
  - `origin`: `http://localhost:9001` (or the value of `PORT`)
  - `dynamic`: `true` (enables dynamic provider configuration)
- Starts listening on `0.0.0.0:9001` and logs a ready message

## Dockerfile

- Base image: `node:18-alpine` for minimal footprint
- Copies all files into `/usr/app` and installs dependencies via `npm install`
- Exposes port `9001`
- Default command: `npm run start`

## Running Locally

1. Install dependencies: `npm install`
2. Start the proxy: `npm run start`
3. (Optional) Build and run in Docker:
   - `docker build -t freeboard-oauth .`
   - `docker run -p 9001:9001 freeboard-oauth`

## Notes

- Session secret is currently hard-coded to `"grant"`; consider externalizing via environment variables for production.
- Grant’s dynamic mode allows per-request provider configuration without static setup.
