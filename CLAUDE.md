# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev              # HTTPS dev server (needs ./certificates/*.pem — see below)
npm run build             # next build
npm run start             # next start (prod, off Catalyst)
npm run fetch -- --user <email>   # manually run one tenant's fetch pipeline (scripts/fetch.ts)
npm test                   # bun test (whole suite)
bun test tests/classifier.test.ts        # single file
bun test --test-name-pattern "some name" # single test by name
npm run migrate:tenancy    # scripts/migrate-tenancy.ts
npm run migrate:feed-prefs -- --yes-drop-articles   # DESTRUCTIVE: per-tenant articles
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
| `/aran` | Aran | Zero-knowledge password/secrets manager |

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

`scripts/fetch.ts`'s `runFetch({ userId, sources, topics })` is the whole pipeline. It is **per-tenant and on-demand only** — called from `POST /api/refresh` (the in-app Refresh button) or `bun scripts/fetch.ts --user <email>`. There is no scheduled fetch and no `GET /api/refresh`; see `docs/cron-job.md` for why.

Preferences come from `user_feed_prefs` via the facade, are passed *in* rather than loaded inside `runFetch`, and the route **fails closed** if they cannot be read rather than falling back to the full catalogue.

1. **Fetch** — one function per source in `lib/fetchers/*.ts`, run concurrently via `Promise.allSettled` so one dead source doesn't block the rest, and only for the tenant's *subscribed* sources. `lib/source-registry.ts` splits sources into two tiers: `native` (Dev.to, Medium, arXiv, Reddit) get the tags that `resolveTags()` maps their subscribed topics onto; `keyword` (HN, Lobsters, HuggingFace, Pragmatic, Simon Willison, GitHub Blog) have no topic API, so HN and Lobsters pre-filter titles through `matchesTopics(title, topics)`.

   A source whose `topicTags` match none of the subscribed topics falls back to its `defaultTags`. That is **load-bearing, not defensive**: Transformers, Latest Models and Reinforcement Learning map to no native tag on any source, so without it those subscriptions would return nothing from every native source.
2. **Classify** — `lib/classifier.ts`'s `classifyArticles()` starts every article with cheap local `keywordTopics()`, then tries to upgrade via an LLM (PlatformAI/Zia by default, OpenAI as a configured fallback, keyword-only if neither is configured) batched at `BATCH = 15` articles per call, **run concurrently** (not sequentially — sequential awaits of a remote backend previously blew past the AppSail request timeout and failed refresh outright; see git history around the Ollama→PlatformAI swap). Only ids an LLM batch actually answers for override the keyword guess, so a partial LLM outage degrades accuracy, not availability.
3. **Filter** — articles whose classified topics miss the subscription are dropped. This is the actual guarantee behind "only my topics get fetched", since tag mappings are best-effort. It is **conditional on classifier health**, and that subtlety matters: commit `931395f` fixed a bug where an unreachable model host made every article look off-topic, and hard-filtering would turn those dimmed articles into deleted ones. So `mode: 'llm'` filters everything, `'partial'` filters only articles an LLM actually gave a verdict on, and `'keyword'`/`backend: 'none'` filters nothing — accuracy degrades, availability does not. `GET /api/feed` applies the same untagged allowance for the same reason.

4. **Store** — `clearNonBookmarkedArticles(userId)` then `upsertArticles(userId, ...)`: a refresh replaces **that tenant's** non-bookmarked rows. The clear is gated on "did any source answer", not "did we keep anything", so a narrow subscription can legitimately empty a feed while a total network failure preserves the previous one.

### Articles are per-tenant; summaries and embeddings are not

`articles` and `article_topics` carry a `user_id` (composite PK on Turso; a synthetic `uk` column of `user_id|article_id` on Catalyst, since Cloud Scale has no composite unique). `summary` and `embedding` are **not** columns on those rows — they live in global `article_summaries` / `article_embeddings` keyed on `article_id` alone, because both derive purely from public article text and are identical for every reader. So the tenant who triggers an LLM call pays for it once on everyone's behalf, and every feed read joins the summary back in (a second query plus a JS merge on Catalyst, a `LEFT JOIN` on Turso).

### `lib/source-registry.ts` is the source catalog

It owns each source's label, colour, tier, and topic→tag map, and the `Source` type is derived from it. That list used to be spelled out in four places — the union in `lib/types.ts`, a `validSources` array in the feed route, and `SOURCES` plus `SOURCE_CONFIG` in the Thagaval page (which also redeclared the union locally). `lib/topic-map.ts` still owns `TOPICS` and the keyword tables, and must **not** import the registry — the registry imports `TOPICS` from it.

`tests/source-registry.test.ts` asserts every `topicTags` key is a real member of `TOPICS`; a typo there was previously invisible, because the topic a tag served was only ever a trailing comment.

### Two-level preference UI

The gear panel (`app/(apps)/thagaval/FeedSettings.tsx`, `GET`/`PUT /api/articles/preferences`) edits the durable subscription that drives the fetch, committing on an explicit Save. The left rail stays a *transient* view filter over whatever is enabled, and renders only subscribed entries. The rail's `localStorage` selection is **pruned against the subscription** on load and after every save — unpruned, it filters on a pill that is no longer rendered and the feed reads as mysteriously empty.

### Aran is zero-knowledge

Aran (`/aran`, formerly branded "Vault" — the internal lib files, types, and Catalyst/Turso table names still use the `vault` prefix; only the route and on-screen name changed) is zero-knowledge: `lib/vault-crypto.ts` (client-only, Web Crypto) never touches the server with plaintext — encryption/decryption happens in the browser; the server only ever sees ciphertext (`lib/vault-catalyst.ts`/`lib/vault.ts`). Never import `vault-crypto.ts` into a server route.

### Urai (chat) and streaming

`app/api/urai/route.ts` streams a chat completion; `app/(apps)/urai/page.tsx` renders it with a small hand-rolled Markdown renderer (bold + bullet lists + paragraphs only — no library) rather than the raw model output.
