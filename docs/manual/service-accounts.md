# Service Accounts Runbook

Service accounts provide scoped, non-human API access for integrations and operational tooling.

## Scope Model

Available scopes:

- `datasource:mint`: mint datasource session tokens
- `datasource:diagnostics:read`: read datasource diagnostics rollups
- `ops:read`: read runtime operational metrics

## Lifecycle

1. Open Admin Console (`/admin`)
2. Create a service account with least-privilege scopes
3. Issue a token
4. Copy token immediately and store in your secret manager
5. Rotate/revoke tokens as part of routine operations or incident response

Token handling rules:

- token value is displayed once at issue/rotate time
- API stores only hashed token secrets
- revoking a token immediately blocks future authentication

## API Authentication

Use bearer authentication:

```http
Authorization: Bearer fsa_<tokenId>.<secret>
```

## Operational Guidance

- Use one account per integration boundary (not one shared global token).
- Prefer short token expiry for automation where possible.
- Keep scope sets minimal and specific.
- Rotate tokens on schedule and after any suspected exposure.

## Audit Expectations

The following actions emit audit records:

- service account create/update/delete
- token issue/rotate/revoke

Use Admin Console audit events to verify lifecycle activity and incident timelines.
