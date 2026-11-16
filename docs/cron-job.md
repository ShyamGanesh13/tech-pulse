# Thagaval article fetching

**There is no general scheduled fetch any more.** Thagaval refreshes on demand,
with one narrow exception: the morning digest push (last section).

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

## The morning digest (the one scheduled path)

`GET /api/thagaval/digest` sends each opted-in user one push a day listing the
top five stories from their own feed. Per user it runs the normal per-tenant
`runFetch` with their stored preferences, ranks the result with the same
`groupStories` + `topStories` the in-app "Top today" strip uses
(`lib/digest.ts`), and pushes to that user's devices only. Tapping it opens
`/thagaval`.

Why this does not bring back the problems above:

- **No second fetch path.** It loops tenants but calls the same `runFetch`, with
  the same fail-closed preference read as `POST /api/refresh`. There is still no
  global fetch with its own scoping rules.
- **Dormant accounts cost nothing.** Only users holding a push subscription are
  processed — enabling notifications is the opt-in. A subscription the push
  service reports dead (404/410) is deleted, so an abandoned device stops buying
  a daily fetch.
- **Request timeout.** Tenants run sequentially and the handler stops *starting*
  new ones after `BUDGET_MS` (40s; a refresh is ~10s). The response is
  `{ processed, sent, skipped, remaining }`; `remaining > 0` means the run did
  not get to everyone. One tenant failing does not stop the others.
- **No empty or stale pushes.** A refresh that throws, keeps nothing (including
  "every source failed", which leaves yesterday's rows), or has no on-topic
  story is skipped and logged under `[digest]`.

Once per day: the handler remembers, in memory, which users it handled on the
current IST date and skips them, so a repeat call the same morning only picks up
whoever was `remaining` or failed. That memory is per instance and lost on a
restart or redeploy — a repeat call after one sends again (the notification tag
is per-day, so it replaces rather than stacks). The real guarantee is the
schedule: once a day. Making it durable needs a `last_digest_at` column.

### The cron to create (Catalyst Job Scheduling)

| | |
|---|---|
| Schedule | daily at 07:30 IST (`30 7 * * *`, Asia/Kolkata; 02:00 UTC) |
| Method | `GET` |
| URL | `https://techpulse.development.catalystappsail.in/api/thagaval/digest` |
| Header | `Authorization: Bearer <CRON_SECRET>` — the same secret the Ninaivu cron uses |

At roughly four tenants per run, more than that many opted-in users means
`remaining > 0`: add a second run a few minutes later rather than raising the
budget.
