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
