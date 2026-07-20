# Personal Journal — Architecture Proposal

Produced by the `ai-architect` subagent on branch `3.5.2_ai_architect`, for review and approval before any implementation starts. Not a spec — a structure to react to.

## Goals driving this proposal (in priority order)

1. **Multi-user** — many users, each with their own private journal.
2. **Authenticated** — already satisfied by the existing `app/journal/layout.tsx` `getUser()` gate.
3. **Deployed to Vercel** — the structure should not need retrofitting for a clean deploy.
4. **Provably secure** — the priority requirement. Not "we believe it's isolated" but a repeatable, checked-in way to demonstrate one user's entries are unreachable by another.

## 1. Data model

Start with one table, `journal_entries`:

- `id`
- `user_id uuid not null default auth.uid() references auth.users(id)`
- `title`
- `body`
- `entry_date date`
- `created_at`
- `updated_at`

Whether `entry_date` should be `unique(user_id, entry_date)` depends on the open one-entry-per-day-vs-many question below. Leave it non-unique initially — adding a unique index later is cheaper than removing one and reconciling duplicates.

Lands as two migrations continuing the existing numbered sequence:
- `0015` — table + indexes on `user_id` and `(user_id, entry_date)`
- `0016` — RLS policy

Split in two mirroring the notes app's `0010`/`0011` pattern, so the security-relevant diff (RLS) reviews on its own.

## 2. `app/lib/journal.ts`

One canonical `JournalEntry` interface, plus a lighter list-item shape if entry bodies grow large. First-pass functions: list entries, get one, create, update, delete. No function signature takes a `user_id` — the database stamps it via the column default, the same pattern `createNote()` already relies on in `db.ts`.

## 3. Routes under `app/journal/`

Keep the existing auth-gated layout as-is. Two-pane, matching the notes app's shape:
- `page.tsx` — list / empty state
- `[id]/page.tsx` — single entry, autosave

No `/shared` route (see security section — no anon surface at all for this app).

## 4. Security design (the priority)

**Zero anon surface.** Do not copy the notes app's `/shared` carve-out — a journal has no sharing rationale, so `anon` gets nothing, anywhere, and that absence is itself a demonstrable property. A single policy from the start:

```sql
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id)
```

covering select/insert/update/delete together, per this repo's standing rule.

**"Provable" means a script, not an assertion.** Extend the existing curl-against-REST verification habit (see `docs/REFLECTION.md`, "Validating instead of trusting a scaffold") into a checked-in, repeatable test that:
- signs in as two seeded users
- asserts user B's token returns zero of user A's rows on select
- asserts update/delete against user A's rows fail under user B's token
- asserts insert with a forged `user_id` is rejected
- asserts an unauthenticated call returns empty

Run it in CI, against a non-production Supabase project — never at build time.

## 5. Weak points / risks

- **Feature scope is still unlocked.** Tags, mood, images, and search would each change the schema. Tags/images in particular would reintroduce a join or a Storage-policy surface — including the exact unqualified-`name` trap that broke migration `0013` on its first pass. Defer any of these until scope is actually decided.
- **`entry_date` semantics are undecided.** One-entry-per-day needs a unique index and UI-level conflict handling; retrofitting uniqueness onto a table that already has duplicate `(user_id, entry_date)` rows is painful. Decide before or shortly after the first migration lands, not much later.
- **A malicious client will try inserting with a forged `user_id`.** The `with check` clause blocks it — but only a real test proves that, which is the whole point of the isolation script above.

## 6. Vercel deployment

Nothing new required if the existing conventions are reused: the three Supabase client wrappers, a fresh-per-function server client (Fluid compute compatibility), and the two existing `NEXT_PUBLIC_` env vars.

Two things to actively avoid:
- Pinning any journal route to the edge runtime — the `getUser()`/cookie pattern assumes Node.
- Adding npm packages without asking first (standing repo rule).

The isolation test should run in CI, not as part of the Vercel build step.

## Open product questions this proposal deliberately leaves open

Each of these changes the schema or RLS shape if answered differently — flagging them rather than deciding them:

- One journal entry per day, or many entries per day?
- Tags, mood tracking, or other metadata on an entry?
- Image attachments, same pattern as notes (`note-images` bucket)?
- Can past entries be edited or deleted, or should the journal be append-only?
- Any export capability?
- Full-text search across entries (notes app precedent: generated `tsvector` + GIN index)?

## Reference files consulted

`app/journal/layout.tsx`, `app/journal/page.tsx`, `app/lib/db.ts`, `supabase/migrations/0010_user_scoping_columns.sql`, `supabase/migrations/0011_user_scoped_rls.sql`, `docs/REFLECTION.md`.
