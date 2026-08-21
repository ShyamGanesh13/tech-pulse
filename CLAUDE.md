# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev              # HTTPS dev server (needs ./certificates/*.pem — see below)
npm run build             # next build
npm run start             # next start (prod, off Catalyst)
npm run fetch              # manually run the article-fetch pipeline (scripts/fetch.ts)
npm test                   # bun test (whole suite)
bun test tests/classifier.test.ts        # single file
bun test --test-name-pattern "some name" # single test by name
npm run migrate:tenancy    # scripts/migrate-tenancy.ts
```

- `npm run dev` requires `--experimental-https` certs at `./certificates/localhost-{key,cert}.pem`; generate with `mkcert` or similar if missing.
- Tests run under Bun (`bunfig.toml` preloads `lib/test-setup.ts`), not Vitest/Jest — `bun test <path>` for a single file. The Turso-backed tests force a local throwaway SQLite file (`lib/test-setup.ts` overrides `TURSO_DATABASE_URL` before any import), never the remote DB in `.env.local`.
- No lint script is configured.
- `npm run start:appsail` / `npm run pack:appsail` are the Zoho Catalyst AppSail entry points — not for local use (see Deployment below).

## Architecture

### This is a personal multi-app dashboard, not a single product

`app/(apps)/*` holds independent single-user apps, listed in `app/(apps)/home/page.tsx`:

| Route | Name | Purpose |
|---|---|---|
| `/thagaval` | Thagaval | Tech news feed aggregated from 10 sources, topic-classified |
| `/kuripu` | Kuripu | Rich text notes |
| `/ninaivu` | Ninaivu | Tasks & reminders |
| `/urai` | Urai | AI chat assistant (streaming, web search, Markdown-rendered replies) |
| `/selvam` | Selvam | Budget & finance (transactions, budgets, bank-statement import) |
| `/vault` | Vault | Zero-knowledge password/secrets manager |

Auth is single-user: a signed HMAC session cookie (`lib/session.ts`, cookie `tp_session`), checked optimistically in `proxy.ts` (route-based redirect only — proxy must not touch the DB, per Next 16 rules) and authoritatively per-route via `lib/auth.ts`. Login itself goes through Firebase (`lib/firebase.ts`) plus an `AUTH_EMAIL`/`AUTH_PASSCODE` env gate.

### Dual datastore: migrating from Turso to Zoho Catalyst Cloud Scale, per-domain

The app is mid-migration off Turso/libSQL onto **Zoho Catalyst Cloud Scale** (this project is deployed as a Catalyst AppSail app, not Vercel). `lib/data.ts` is the facade every route must import through — never `lib/db.ts` (Turso) or `lib/*-catalyst.ts` directly:

```
TP_CATALYST_DOMAINS=notes,todos,urai,vault,articles,finance,users   # or "all"
```

Each domain (`notes`, `todos`, `urai`, `vault`, `articles`, `finance`, `users`) can be switched to Catalyst independently via that env var, with no code change — `lib/data.ts` picks the implementation at call time. `lib/db.ts` (the Turso/libSQL implementation) is lazily `require`'d only when a domain still needs it, specifically so the native `@libsql/client` binary (built on macOS in this repo, but AppSail's runtime is Linux) never gets pulled into a Catalyst-only deployment.

Two hard, non-obvious constraints when touching `lib/*-catalyst.ts` or `lib/catalyst.ts`:
1. **ZCQL has no parameter binding.** Any user-authored free text (note content, etc.) must go through the Datastore row API (`getRow`/`updateRow`/`deleteRow`, addressed by ROWID), never be inlined into a ZCQL string. Row-API writes must be preceded by a tenant-scoped ZCQL ownership check, since the row API itself has no tenant filter.
2. **Catalyst SQL quirks with no error on failure**: `LIKE` uses `*`, not `%` (a stray `%` silently matches zero rows — use `likePrefix()` in `lib/catalyst.ts`); ROWIDs are 17-digit bigints that silently corrupt through `Number()` (exceeds `MAX_SAFE_INTEGER`) — keep them as strings; results come back nested under the table name (`[{ articles: {...} }]`). `tests/catalyst-guard.test.ts` guards against regressions in both.

The Catalyst app instance (`lib/catalyst.ts`) is built **per-request** from `x-zc-*` headers (via `next/headers`), not a module singleton — the credential is delivered per-request on Catalyst, and can't be cached across requests. Off-Catalyst (local dev), it falls back to `CATALYST_PROJECT_ID`/`CATALYST_ENVIRONMENT`/etc. from env.

Datastore identity: project `TechPulse` (`51859000000044026`), org `60083086752`, environment `Development`, deployed to AppSail at `techpulse.development.catalystappsail.in`. Table column names sometimes differ from the TS field name where the natural name was reserved (e.g. the `articles` table's source column is `feed_source`, not `source` — check `lib/types.ts` vs. the actual table schema before writing ZCQL).

### Thagaval's fetch → classify → store pipeline

`scripts/fetch.ts`'s `runFetch()` (called from `app/api/refresh/route.ts`, both as an in-app "Refresh" button and as a `CRON_SECRET`-gated cron `GET`) is the whole pipeline:

1. **Fetch** — one function per source in `lib/fetchers/*.ts`, run concurrently via `Promise.allSettled` so one dead source doesn't block the rest. Sources with a native topic/tag API (Dev.to, Medium, arXiv, Reddit) pull per-tag/feed lists straight from `lib/topic-map.ts` (`DEVTO_TAGS`, `MEDIUM_TAGS`, `ARXIV_FEEDS`, `REDDIT_SUBS`); sources with no topic API (HN, Lobsters) pre-filter every title through `matchesTopics()` before even fetching further.
2. **Classify** — `lib/classifier.ts`'s `classifyArticles()` starts every article with cheap local `keywordTopics()`, then tries to upgrade via an LLM (PlatformAI/Zia by default, OpenAI as a configured fallback, keyword-only if neither is configured) batched at `BATCH = 15` articles per call, **run concurrently** (not sequentially — sequential awaits of a remote backend previously blew past the AppSail request timeout and failed refresh outright; see git history around the Ollama→PlatformAI swap). Only ids an LLM batch actually answers for override the keyword guess, so a partial LLM outage degrades accuracy, not availability.
3. **Store** — `clearNonBookmarkedArticles()` then `upsertArticles()`: a refresh **replaces the entire non-bookmarked article pool** each run rather than merging, so adding a broad/noisy tag to a fetcher dilutes the whole feed, not just adds recall.

`lib/topic-map.ts` is the single source of truth for both the fixed `TOPICS` list (what the classifier tags against and what renders as filter pills) and every source's native tag/feed/sub list — update it there when adding a topic or a source, not per-fetcher.

### Vault is zero-knowledge

`lib/vault-crypto.ts` (client-only, Web Crypto) never touches the server with plaintext — encryption/decryption happens in the browser; the server only ever sees ciphertext (`lib/vault-catalyst.ts`/`lib/vault.ts`). Never import `vault-crypto.ts` into a server route.

### Urai (chat) and streaming

`app/api/urai/route.ts` streams a chat completion; `app/(apps)/urai/page.tsx` renders it with a small hand-rolled Markdown renderer (bold + bullet lists + paragraphs only — no library) rather than the raw model output.
