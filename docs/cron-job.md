# Thagaval article fetching

**There is no scheduled fetch any more.** Thagaval refreshes on demand only.

## Why

Fetching became per-tenant. A refresh pulls only the signed-in tenant's
subscribed sources and topics (`user_feed_prefs`) and rebuilds only their own
`articles` rows, so a request with no session has no preferences to fetch against
and nothing sensible to do.

The alternatives were a cron that loops every tenant — which reintroduces the
AppSail request-timeout problem that commit `6f6dcf1` was needed to fix, and
spends outbound budget on dormant accounts — or keeping a second, global fetch
path with different scoping rules from the per-tenant one. Neither was worth it
for a personal dashboard, so scheduled refresh was dropped.

## What this replaced

- `GET /api/refresh` (CRON_SECRET-gated) — **deleted**, along with its
  `SELF_AUTHENTICATED` exemption in `proxy.ts`. Only `POST` remains, and it
  requires a session.
- A ClaudeClaw cron job at
  `~/claudeclaw-workspace/.claude/claudeclaw/jobs/tech-pulse-fetch.md`, which ran
  `bun scripts/fetch.ts` at 08:00 and 20:00 UTC from a laptop. **That file lives
  outside this repo and must be deleted by hand.** Left in place it will fail
  every run, because the CLI now requires a tenant.

## How a refresh happens now

- **In the app:** the Refresh button in Thagaval → `POST /api/refresh`. It loads
  the caller's preferences and fails closed (500) if they cannot be read, rather
  than falling back to fetching the whole catalogue.
- **From a terminal**, for debugging:

  ```bash
  bun scripts/fetch.ts --user you@example.com
  ```

  The `--user` flag is required — there is deliberately no "all tenants" mode, as
  that would quietly reinstate the scheduled behaviour this removed.

## Related

`vercel.json` still declares a cron for `/api/ninaivu/due`. That is a **separate,
pre-existing bug**: the `tech-pulse` Vercel project serves an unrelated
application, so that cron has never fired and Ninaivu reminder pushes do not run.
It is untouched by this change.
