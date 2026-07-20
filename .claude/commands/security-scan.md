---
description: Dispatch the three security scanner subagents in parallel and merge their findings into one severity-grouped report
---

# /security-scan

Run all three project security scanners at the same time and produce one merged, deduplicated findings report. Scan-only — none of the three subagents may change any code, and this command itself makes no changes.

## Dispatch

In a single message, launch all three subagents in parallel (do not run them one after another):

1. `@supabase-security-scanner` — Supabase setup: RLS gaps, incomplete policies, exposed service_role keys, public storage buckets, policies trusting client-editable data.
2. `@nextjs-security-scanner` — Next.js data-security guidance: `NEXT_PUBLIC_` secret leaks, over-fetched data reaching Client Components, Server Actions/Route Handlers missing their own auth check, authentication without authorization, scattered data-access logic.
3. `@vercel-security-scanner` — Vercel deployment configuration: env var scoping/sensitivity, Deployment Protection, security headers, stale/un-rotated secrets.

Wait for all three to finish before doing anything else. Do not write the merged report, or any part of it, until every subagent has actually returned its findings — never fabricate or guess at a scanner's output while it's still running.

## Merge

Once all three have reported:

1. Combine every finding from all three scanners into one list.
2. **Deduplicate.** If two or more scanners flag what is substantively the same underlying issue (same location, same root cause — e.g. `nextjs-security-scanner` and `vercel-security-scanner` both flagging the same `NEXT_PUBLIC_` variable from different angles), list it once, noting every scanner that flagged it: `(flagged by: nextjs-security-scanner, vercel-security-scanner)`. Use judgment on "substantively the same" — same file/table/variable and same underlying risk, not merely a similar category.
3. Keep the original severity if scanners agree; if scanners disagree on severity for the same deduplicated finding, use the *highest* of the severities assigned and note the disagreement.
4. Group the merged list by severity, in this order: **Critical**, **High**, **Medium**, **Low**. Within a severity group, order by scanner (Supabase, then Next.js, then Vercel) unless a more natural grouping (e.g. all findings about the same file) reads better.

## Output

A single markdown report:

- A one-line count summary at the top, e.g. "14 findings: 2 critical, 3 high, 6 medium, 3 low — across 3 scanners."
- Each finding as: **location** — **risk** — **what could go wrong**, with the flagging scanner(s) noted.
- If a scanner failed to run or returned nothing, say so explicitly rather than silently omitting its section — a missing or empty result must stay visible, never indistinguishable from "clean."

Findings only. Nothing from this command is ever auto-applied as a fix.
