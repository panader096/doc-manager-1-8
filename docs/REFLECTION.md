# REFLECTION.md

## Persistence

At the start of the sprint I asked Claude Code what storage mechanism to use for a single-user, localhost-only app with no backend. It recommended `localStorage` immediately: the 5 MB limit comfortably covers plain-text documents, the synchronous read/write API keeps the data layer simple, and there are no relational queries that a database would make easier. It surfaced four alternatives — `IndexedDB` (async, better for binary or large structured data), `sessionStorage` (clears on tab close), cookies (4 KB limit, designed for server communication), and the File System Access API (requires a permission prompt each session, patchy browser support). I chose `localStorage` because every constraint pointed the same way: small text data, no server, no async needed, and the pattern was already familiar from the to-do app earlier in the sprint.

## Search → paste → cite

While setting up routing for individual document pages, I pasted the Next.js App Router documentation on layouts and pages — the file saved in `docs/nextjs-layouts-and-pages.md` (source: `https://nextjs.org/docs/app/getting-started/layouts-and-pages`). Without it, the agent was drifting toward a Pages Router mental model, reaching for `getServerSideProps` to handle route parameters. Once I pasted the App Router reference, it correctly used `useParams()` from `next/navigation` for the dynamic `[id]` segment and `useSearchParams()` for the `?new=1` flag that opens a fresh document in edit mode. The citation changed both the hook choices and the resulting file structure.

## CLAUDE.md catching a drift

When building the drag-and-drop folder feature (branch `1.8.8-hard`), the agent's first instinct was to suggest a third-party library. The CLAUDE.md rule — "Do not add npm packages without asking first" — intercepted this before any install. The feature was instead built with the HTML5 native Drag and Drop API: `draggable`, `onDragStart`, `onDragOver`, and `onDrop`. No new dependency was added and the behaviour matched the spec exactly.

## Design pass

I described the visual direction as Apple's pro-application aesthetic — Xcode and Final Cut Pro, not the marketing website. Instructions covered typography (system font stack, monospace for metadata and timestamps), spacing (28 px sidebar rows, 32 px content padding, dense layout), colour (near-black `#1E1E1E` dark background, `#F2F2F2` light sidebar, `#007AFF` accent), and components (4 px radius everywhere, 2 px left-border active indicator, neutral tag pills). The scaffolded default was Geist font with generous padding and coloured pill tags. Three options were presented; Option C was chosen. The iteration that finally felt right was when the font switched to the native system stack — the app stopped looking like a web project and started feeling like a local tool.

## Harder than expected

Nothing in the implementation was harder than expected compared to the plain-HTML sprint. The main friction was waiting time — each Claude Code prompt took noticeably longer to process than a typical static-site iteration, which slowed the feedback loop considerably.

## Validating instead of trusting a scaffold

Before extending the notes feature, I asked Claude Code to validate a Supabase-backed notes scaffold that had already been built (list + editor CRUD, single `notes.ts` helper module) rather than take it on faith. Instead of screenshotting the UI, it hit the same Supabase REST endpoint the browser client uses directly with `curl`, which surfaced a blocking bug a visual check would have missed: Row Level Security had a `SELECT` policy but no `INSERT` policy, so the "+ New" button would have failed silently. It also caught two smaller issues by cross-checking the live schema against the TypeScript types — `notes.id` was declared as `string` but is actually an integer column, and `updated_at` wasn't being set on insert, which broke the "most recently updated" sort order because Postgres sorts `NULL` first in `DESC` order. The env file also turned out to be missing entirely from this project directory (it only existed in an unrelated scratch folder), which would have failed silently as a "can't reach Supabase" error with no obvious cause.

Two of the fixes touched the live database directly — a new RLS policy migration and a data backfill (`updated_at = created_at` for three pre-existing rows) — and Claude Code asked for confirmation before applying either, since both were schema/data changes to a shared system rather than local file edits.

## A custom rule-checking slash command

`skill-creator` wasn't available in the session, so instead of a formal skill I asked Claude Code to write a plain custom slash command, `.claude/commands/claude-md-review.md`, that checks a diff against this project's specific CLAUDE.md rules rather than general code quality — is every database call going through `app/lib/db.ts`, do table/column references in code actually match `supabase/migrations/`, was a new dependency added without asking first. This is narrower than the built-in `/code-review` skill on purpose: it only knows about the handful of architectural rules this repo cares about.

I ran it against the uncommitted working-tree diff for this branch (v2.5.3 — collection rename, tag colours, count badge) since nothing had been pushed as a real PR yet. Result: no violations — every new Supabase call went through `db.ts`, the new `tags.color` column and `collections`/`tags` table names matched the migration files, and no new npm packages were added. A clean result from a custom-scoped review tool is still useful to see recorded once, if only to confirm the tool itself works before trusting it on a diff that isn't clean.

## docs/ folder: keep or change

Keep: starting each feature with a round of clarifying questions before building. This scoped the output, reduced re-dos, and produced more predictable results. Also keep: a separate named branch per feature step with descriptive naming — the version history made comparison and rollback straightforward.

Change next time: document the clarifying-questions exchange itself, not just the outcome. A log of what was asked and how ambiguities were resolved would be more instructive than a reference document the model can retrieve on its own.
