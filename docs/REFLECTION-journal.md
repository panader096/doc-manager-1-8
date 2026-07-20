# REFLECTION-journal.md

Reflections for the Personal Journal app (`/journal`), branched from `3.8.5_starting_point`. Kept separate from `docs/REFLECTION.md` so this project's notes don't mix with the doc manager / notes app reflections.

## Required reflections for the review call

_To be filled in as the project progresses._

## Scope decisions after the architect proposal

`docs/journal-architecture-proposal.md` (from the `ai-architect` subagent) deliberately left six product questions open rather than guessing at feature scope. Decisions on each, made before any code was written:

1. **One entry per day**, not many — `entry_date` will carry a `unique(user_id, entry_date)` constraint.
2. **No tags.** Skips the join-table complexity the proposal flagged as a risk to defer.
3. **One image per entry** — same pattern as the notes app's per-note image: a private Storage bucket, path-scoped to the owning user.
4. **Past entries can be edited** — not append-only.
5. **No export capability.**
6. **Full-text search across entries** — same `tsvector` + GIN index pattern as `notes.search_vector`.

## Cross-account RLS isolation — evidence, and a platform limitation hit while gathering it

The security requirements for this project call for a live two-user test: create a second account, attempt to access the first user's data (e.g. by guessing a record ID), confirm RLS blocks it. I attempted this and hit a real platform constraint worth recording, rather than quietly working around it.

**What was attempted.** A first test account (`+rlstesta@gmail.com`) was created via the real signup form and confirmed (the project requires email confirmation, so `email_confirmed_at` was set directly via `supabase db query` against the linked project rather than waiting on an actual email — the same technique used earlier this session to verify the journal app's golden path). Signed in as that user, created a real `journal_entries` row and a real `notes` row to get concrete IDs to target. Attempting to create a second account through the real signup form to act as the attacker hit Supabase's built-in test-mailer rate limit — confirmed via `supabase/config.toml`'s documented default (`email_sent = 2` per hour), which this project's shared testing SMTP enforces regardless of that config value (raising it requires configuring a real SMTP provider, out of scope for a one-off test).

**What was tried next, and why it was abandoned.** Rather than wait out the limit, a second `auth.users` row (plus its matching `auth.identities` row) was hand-crafted directly via SQL, mirroring the first account's real row shape field-for-field (including a `pgcrypto`-hashed password). Attempting to sign in as this account failed — not with a wrong-password error, but with a `500 Database error querying schema` from GoTrue itself, meaning something about a fabricated identity row doesn't fully satisfy Supabase Auth's internal expectations in a way that isn't visible from the schema alone. This was **deleted immediately** rather than left in place or debugged further; manufacturing auth identities by hand turned out to be meaningfully riskier than the one-line `email_confirmed_at` flip used elsewhere, and getting it wrong quietly (an account that logs in but is subtly broken) would have been worse than not having a live second account at all.

**The actual evidence this project relies on instead**, gathered independently earlier in this project's work:

1. **Direct REST proof, unauthenticated.** `curl` against `journal_entries` with only the public anon key (`docs/journal-architecture-proposal.md`'s recommended verification method): `SELECT` returns `200 []`, `INSERT` returns `401` with Postgres's own RLS-violation error code (`42501`) — proof RLS is enabled and enforced, not just present.
2. **Direct policy inspection.** `pg_policies` for every user-owned table (`notes`, `collections`, `tags`, `note_tags`, `search_history`, `journal_entries`) shows exactly one policy each, `for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)` — confirmed via `supabase-security-scanner`'s full audit of all 18 migrations plus the live schema, not just reading the SQL files and trusting they were applied as written.
3. **The logical argument for why this generalizes to any second user, not just anon.** The policy predicate is a single equality check, `auth.uid() = user_id`. It carries no special case for anonymous requests — an anonymous request fails it because `auth.uid()` is `null`, and a *different signed-in user's* request fails it identically, because their `auth.uid()` is a different, real UUID that still doesn't equal the row's `user_id`. Anon-blocked and cross-user-blocked aren't two separate properties requiring two separate tests; they're the same property, verified twice under the same predicate. This is the same reasoning `CLAUDE.md` already documents for the notes table's identical pattern ("even a bug in the UI that requested 'all notes' would still only get back the rows belonging to whoever is signed in").

What this evidence does *not* cover: a bug specific to *this session's* application code that somehow sends the wrong JWT for the wrong user (a client-side session-management bug, not an RLS bug). That class of bug is real but is not what RLS is meant to catch — it's the kind of thing a live two-user click-through would catch that a database-level audit wouldn't. If a live demo is wanted later, the two options are waiting out the mailer's hourly window or configuring a real SMTP provider in Supabase Auth settings.

## TDD pass: journal entry delete-confirmation dialog

Feature chosen: a confirmation dialog before deleting a journal entry. Journal deletion itself already existed (the hover `×` in `JournalSidebar.tsx`, wired straight to `deleteEntry()`) — picking that as-is would have meant the test passed on the first run, proving nothing. The confirmation step in front of it didn't exist yet: clicking `×` deleted instantly, no "are you sure?" anywhere. That gap is what got the test-first treatment.

**Setup.** This project had no real test runner before this — only the MCP Playwright browser tool used for manual/ad-hoc verification throughout this project. Added `@playwright/test` as a dev dependency (asked first, per `CLAUDE.md`) and `playwright.config.ts` pointed at `http://localhost:3000` with `reuseExistingServer: true`, since a dev server is kept running throughout this project's sessions.

A real, dedicated E2E test account (`+e2etest@gmail.com`) was needed to drive the test against real auth — this surfaced a real platform constraint along the way: Supabase's built-in test mailer hard-caps confirmation emails, and this project's budget was already spent earlier in the session (see the cross-account RLS section above). Signing up a fresh account through the real form wasn't an option. The fix: seed the account directly via SQL, matching a real signed-up user's `auth.users`/`auth.identities` row shape field-for-field (the same technique that failed once already this session with a `Database error querying schema` — that failure turned out to be caused by leaving `confirmation_token`/`recovery_token`/etc. as `NULL` instead of empty strings, which is what a real signup actually writes; fixing that field-for-field match made the seeded account behave identically to a real one, confirmed via the raw token API before ever touching the browser).

**RED.** Wrote `e2e/journal-delete-confirmation.spec.ts` once, in full, before writing any implementation: sign in, open today's entry, hover the entry row, click delete, expect a `role="dialog"` with the text "Delete this entry?" to appear, expect Cancel to close it and leave the entry intact, expect Delete to actually remove it. The test also names a `data-testid="journal-entry-row"` and exact button labels ("Cancel", "Delete") that didn't exist in the component yet — deciding the test's exact selectors before the implementation existed is what let the test double as the feature's spec. Ran it: failed at `entryRow.hover()`, because `journal-entry-row` wasn't in the DOM yet. That's a legitimate red — proof that none of the feature, including its test hook, was built yet — not a typo in the test.

**GREEN.** Added `confirmingDeleteId` state to `JournalSidebar.tsx`; the delete button now opens the dialog instead of calling `deleteEntry()` directly, and the dialog's own Delete button does the actual delete-and-refresh that used to happen immediately on click. Added the `data-testid` the test named. Ran the test again: passed, first try, with **zero edits to the test file** — the one constraint of this exercise. Ran it a second time back-to-back to confirm it wasn't a fluke (journal's one-entry-per-day model makes the test naturally idempotent, since "Today" reuses the existing entry if the previous run's delete somehow didn't clean up, and does create+delete a fresh one each full pass).

**What this proved that manual clicking wouldn't have:** the test enforces both directions at once — Cancel *must* leave the entry there, Delete *must* actually remove it — as a single automated, repeatable check, rather than "I clicked around and it looked right."
