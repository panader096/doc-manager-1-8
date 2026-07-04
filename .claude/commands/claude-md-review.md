---
description: Review a diff against this project's CLAUDE.md data-layer rules (centralised db module, no direct Supabase client use, schema accuracy)
---

# CLAUDE.md rule review

Review a code diff for violations of *this project's specific rules*, not
general code quality. This is not a substitute for `/code-review` — it
only checks the handful of architectural rules this repo's `CLAUDE.md`
sets out for the Supabase data layer.

## Diff to review

$ARGUMENTS

If no argument is given, review `git diff main...HEAD` (this branch against
`main`). If the argument looks like a PR number, use `gh pr diff <number>`
instead.

## Rules to check (from CLAUDE.md)

Read `CLAUDE.md` in full first, then check the diff specifically for:

1. **Centralised data layer bypassed.** Any component or page importing
   `@supabase/supabase-js` directly, or calling `createClient()` /
   `createServerClient()` from anywhere other than
   `app/lib/supabase/client.ts` or `app/lib/supabase/server.ts`. All reads
   and writes must go through `app/lib/db.ts` (notes/collections/tags) or
   `app/lib/documents.ts` (the doc-manager side).

2. **New data operation added without a named helper function.** A
   component doing its own `.from(...).select(...)` / `.insert(...)` /
   etc. inline instead of calling (or adding) a function in the relevant
   `lib` module.

3. **Schema drift.** Table or column names referenced in application code
   that don't match what's actually defined in `supabase/migrations/`.
   Cross-check every `.from('table_name')` and `.select('col, col2')`
   call against the migration files.

4. **Undeclared new dependency.** A new package added to `package.json`
   without it being called out — CLAUDE.md says not to add npm packages
   without asking first.

5. **Wrapper client misuse.** The server client
   (`app/lib/supabase/server.ts`) instantiated as a module-level
   singleton instead of created fresh inside each function that needs it.

## Output

A plain markdown list, most-important first: `file:line — rule violated —
why it matters`. If nothing violates these specific rules, say so plainly
— a clean result is a valid and useful outcome, don't invent findings to
fill space.
