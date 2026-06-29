# ClaudeClaw Cron Job Setup

The Tech Pulse article fetcher runs as a scheduled ClaudeClaw cron job.

**Job location:** `/Users/shyam-18219/claudeclaw-workspace/.claude/claudeclaw/jobs/tech-pulse-fetch.md`

**Schedule:** Daily at 8am and 8pm UTC (`0 8,20 * * *`)

**Command:** `cd /Users/shyam-18219/tech-pulse && bun scripts/fetch.ts`

This job refreshes articles from Hacker News, Reddit, Dev.to, and Medium sources.
