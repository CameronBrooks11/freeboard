# Credential Key Rotation

Use this runbook to rotate `CREDENTIAL_ENCRYPTION_KEY` without losing stored datasource credential profiles.

For the complete secret lifecycle workflow (setup, bootstrap, non-key rotations, incident response), use:

- [Secrets Operations Runbook](/manual/secrets-operations)

## Scope

- Affects encrypted `CredentialProfile.secret` records in the Postgres datastore (`DB_BACKEND=postgres`).
- Does not rotate JWT signing keys (`JWT_SECRET`, `JWT_GATEWAY_SECRET`) or service tokens.

## Prerequisites

- Confirm current services are healthy and you can access admin credential profile views.
- Ensure the runtime can connect to the target Postgres datastore (`DATABASE_URL` or `FREEBOARD_POSTGRES_URL`).
- Ensure both keys are available in a secure secret store.
- Keep a recent DB backup/snapshot before running rotation.

## Generate a New Key

Generate a base64-encoded 32-byte key:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

## Rotation Procedure

1. Export rotation variables in the shell running the re-encryption:
   - `DB_BACKEND=postgres`
   - `DATABASE_URL=<target-postgres-url>` (or `FREEBOARD_POSTGRES_URL=<target-postgres-url>`)
   - `CREDENTIAL_ENCRYPTION_KEY_OLD=<current-key>`
   - `CREDENTIAL_ENCRYPTION_KEY_NEW=<new-key>`
2. Run re-encryption:

```bash
npm run credentials:reencrypt
```

3. Confirm script output reports completion with expected `scanned`/`updated` counts.
4. Deploy/update runtime secret:
   - Set `CREDENTIAL_ENCRYPTION_KEY=<new-key>`
   - Remove `CREDENTIAL_ENCRYPTION_KEY_OLD` and `CREDENTIAL_ENCRYPTION_KEY_NEW` from runtime env.
5. Restart API instances.
6. Validate:
   - Admin credential profile list loads.
   - Existing dashboards using credential profiles can still fetch via gateway.

## Rollback

If post-rotation validation fails and you need to revert encrypted records, run the same script with keys swapped:

- `CREDENTIAL_ENCRYPTION_KEY_OLD=<new-key>`
- `CREDENTIAL_ENCRYPTION_KEY_NEW=<previous-old-key>`

Then redeploy with the reverted `CREDENTIAL_ENCRYPTION_KEY`.

## Operational Notes

- Rotation is all-records, in-place.
- Run during a planned maintenance window for production.
- Do not leave old/new rotation env vars set after completion.
