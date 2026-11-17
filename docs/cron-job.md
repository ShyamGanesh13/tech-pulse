# Thagaval article fetching

**There is no general scheduled fetch any more.** Thagaval refreshes on demand,
with one narrow exception: Urai's morning briefing (last section).

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

Ninaivu reminder pushes run from their own Catalyst cron (`ninaivu_due_sweep`,
every 5 minutes, `GET /api/ninaivu/due` with the same CRON_SECRET bearer). The
old `vercel.json` cron for it never fired — that Vercel project served an
unrelated app — and the file is gone.

## The morning briefing (the one scheduled path)

`GET /api/briefing` gives each opted-in user one Urai chat a day — "Morning
briefing · Wed 18 Nov" — and a push that opens it (`/urai?c=<id>`). It replaced
the Thagaval-only digest push. Per user it:

1. refreshes their feed with the normal per-tenant `runFetch` and their stored
   preferences (best-effort: a failed refresh drops the stories, not the
   briefing, and "kept nothing" never passes yesterday's rows off as today's);
2. gathers today's reminders, open to-dos split into due-today and overdue,
   yesterday's and month-to-date spending against budgets, and the top three
   stories, ranked by the same `groupStories` + `topStories` as the in-app
   "Top today" strip;
3. drafts a "move to today" change for up to three overdue to-dos — in code, not
   by the model — which show as Confirm chips in the chat;
4. has the model write the briefing from those facts (one AI call per user), with
   a plain fallback (`fallbackBriefing`) if no backend answers;
5. pushes one line of counts to that user's devices only.

All the pure parts live in `lib/briefing.ts`.

Why this does not bring back the problems above:

- **No second fetch path.** It loops tenants but calls the same `runFetch`, with
  the same fail-closed preference read as `POST /api/refresh`. There is still no
  global fetch with its own scoping rules.
- **Dormant accounts cost nothing.** Only users holding a push subscription are
  processed — enabling notifications is the opt-in. A subscription the push
  service reports dead (404/410) is deleted, so an abandoned device stops buying
  a daily fetch and AI call.
- **Request timeout.** Tenants run sequentially and the handler stops *starting*
  new ones after `BUDGET_MS` (40s; a refresh is ~10s). The response is
  `{ processed, sent, skipped, remaining }`; `remaining > 0` means the run did
  not get to everyone. One tenant failing does not stop the others.
- **No empty pushes.** A day with nothing scheduled, no money data and no fresh
  stories is skipped and logged under `[briefing]`.

Once per day, durably: the chat's title is the day, and a user who already has
today's chat is skipped. That survives restarts, redeploys and a second cron fire
— unlike the digest's old in-memory guard — so a later run only picks up whoever
was `remaining` or failed before their chat was written.

### The cron to create (Catalyst Job Scheduling)

| | |
|---|---|
| Schedule | daily at 07:30 IST (`30 7 * * *`, Asia/Kolkata; 02:00 UTC) |
| Method | `GET` |
| URL | `https://techpulse.development.catalystappsail.in/api/briefing` |
| Header | `Authorization: Bearer <CRON_SECRET>` — the same secret the Ninaivu cron uses |

At roughly four tenants per run, more than that many opted-in users means
`remaining > 0`: add a second run a few minutes later rather than raising the
budget.
