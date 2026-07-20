---
description: Scan only the files changed on this branch vs. main, dispatching all three security scanners in parallel
---

# /security-scan-changed

A narrower, faster sibling of `/security-scan`: instead of auditing the whole app, scope all three scanners to just what changed on this branch. Scan-only — none of the three subagents may change any code, and this command itself makes no changes.

## 1. Identify changed files

Diff the current branch against `main`:

```
git diff --name-only main...HEAD
```

If that fails (e.g. no local `main` ref, or the current branch *is* main), fall back to `git diff --name-only main...HEAD` against the appropriate remote-tracking ref (e.g. `origin/main` or `sprint-3/main` — check `git remote -v` and this repo's actual push history to pick the right one), or tell the user you can't determine a changed-file set and stop rather than silently scanning everything.

If the resulting list is empty, say so and stop — there is nothing to scan.

## 2. Dispatch, scoped to those files

In a single message, launch all three subagents in parallel (do not run them one after another), passing each the same changed-file list and telling it to focus only on those files rather than the whole codebase:

1. `@supabase-security-scanner` — scope to changed files under `supabase/migrations/`, the Supabase client wrappers, and data-access modules (`app/lib/db.ts`, `app/lib/documents.ts`, `app/lib/journal.ts`). If none of the changed files fall in its domain, it should say so rather than auditing the full schema anyway.
2. `@nextjs-security-scanner` — scope to changed files under `app/` (Server Actions, Route Handlers, Server/Client Components). If none of the changed files fall in its domain, it should say so rather than auditing the full app anyway.
3. `@vercel-security-scanner` — note explicitly that most of its checks (env var scoping, Deployment Protection, live security headers, git-history secret scanning) are about deployment *state*, not any single file, so they don't scope down the same way. It should still run those deployment-state checks in full, but limit any file-based checks (`next.config.ts`, `vercel.json`) to whether they appear in the changed-file list, and say plainly which parts of its check were skipped because nothing relevant changed.

Wait for all three to finish before doing anything else. Do not write any part of the merged report until every subagent has actually returned its findings — never fabricate or guess at a scanner's output while it's still running.

## 3. Merge and report

Combine every finding from all three scanners into one report, grouped by severity in this order: **Critical**, **High**, **Medium**, **Low**.

- A one-line count summary at the top, e.g. "5 findings: 0 critical, 1 high, 3 medium, 1 low — across 3 scanners, N changed files."
- Each finding as: **location** — **risk** — **what could go wrong**, noting which scanner flagged it.
- If a scanner found nothing (either because nothing relevant changed, or the changed files were clean), say so explicitly rather than omitting its section.

Findings only. Nothing from this command is ever auto-applied as a fix.
