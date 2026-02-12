# HTTP Proxy Service

## Purpose

The proxy forwards selected datasource calls to avoid browser CORS limits while enforcing outbound security policy.

## Security controls

- Allows only `http` and `https` targets
- Rejects URL credentials (`user:pass@host`)
- Enforces host allowlist in production (`PROXY_ALLOWED_HOSTS`)
- Enforces port allowlist (`PROXY_ALLOWED_PORTS`)
- Blocks private/internal hostnames and resolved IP ranges by default
- Uses DNS-pinned upstream routing:
  - resolve once
  - validate resolved destination
  - connect by pinned IP
  - preserve original host header and TLS SNI
- Drops upstream `set-cookie` headers
- Enforces request timeout and max response size

## Endpoint

- `GET /proxy?url=<encoded-url>`
- `POST /proxy?url=<encoded-url>`
- In default compose deployment, proxy is reached via UI reverse proxy at `http://<host>:8080/proxy`.

## Key environment variables

- `PROXY_ALLOWED_HOSTS` (required in production)
- `PROXY_ALLOWED_PORTS` (default: `80,443`)
- `PROXY_TIMEOUT_MS` (default: `15000`)
- `PROXY_MAX_RESPONSE_BYTES` (default: `5242880`)
- `PROXY_ALLOW_PRIVATE_DESTINATIONS` (default: `false`)
- `PROXY_ALLOW_INSECURE_TLS` (default: `false`)

## Operational notes

- Keep `PROXY_ALLOW_INSECURE_TLS=false` in production.
- Keep `PROXY_ALLOW_PRIVATE_DESTINATIONS=false` unless on a trusted local-only network.
- Review `PROXY_ALLOWED_HOSTS` as part of deployment change control.
