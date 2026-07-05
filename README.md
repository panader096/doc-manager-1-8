# Document Manager & Notes

A Turing College "Building with AI / Claude Code" course project (Sprint 1.8 → Sprint 2). Started as a single-user, browser-only document manager and grew into two apps sharing one Supabase project, plus a small Supabase Auth workspace.

## What's in this repo

- **Doc manager** (`/docs`) — the original document workspace. Documents have a unique URL (`/docs/[id]`), autosave, markdown preview, tags, starring, history/snapshots, soft delete, a command palette (`Ctrl+K`), and folders. Still fully public, no login required, no Supabase involved — everything lives in the browser's `localStorage`.
- **Notes app** (`/notes`) — a Supabase-native rebuild with collections, tags, server-side full-text search, pinning, archiving, one image per note (Supabase Storage, not base64), and read-only collection sharing via link (`/shared/[token]`). **Requires signing in** — every note, collection, tag, and search-history row belongs to exactly one user, enforced by Postgres Row Level Security, so signed-in users only ever see their own data.
- **Workspace** (`/workspace`) — a small placeholder area behind Supabase Auth, proving out sign-up/sign-in via email+password, Google OAuth, and GitHub OAuth.

## Screenshot

_Add a screenshot of the running app here (e.g. `docs/screenshot.png`) before submitting — none is committed yet._

## Running locally

```bash
npm install
npm run dev
```

Opens at [http://localhost:3000](http://localhost:3000).

### Environment variables

Create a `.env.local` file in the project root with:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

Both values come from your Supabase project dashboard: **Project Settings → Data API** for the Project URL, and **Project Settings → API Keys** for the publishable (anon) key. Never use the `service_role`/secret key here — only the publishable key belongs in this app, and only in `.env.local`, never committed.

You'll also need the SQL migrations in `supabase/migrations/` applied to that project (via the Supabase CLI or dashboard SQL editor) for the notes app and auth to work — they create the `notes`/`collections`/`tags`/`search_history` tables, their RLS policies, and the `note-images` Storage bucket.

## Features

**Doc manager — Core**
- Create, edit, and delete documents with auto-save (400 ms debounce)
- Each document has a unique URL (`/docs/[id]`) — bookmarkable and shareable
- Live title search in the sidebar
- Markdown preview (`# h1`, `**bold**`, `*italic*`, `- list`)

**Doc manager — optional tiers (branches `1.8.6`–`1.8.9`)**
- Starred documents, dark/light theme toggle, live word count
- Tags, export/import workspace as JSON, document history (up to 3 snapshots)
- Soft delete/trash, command palette (`Ctrl+K`), drag-and-drop folders
- Apple Pro visual redesign, CSS custom-property design tokens

**Notes app** (`/notes`)
- Collections (create, rename, drag-to-reorder), tags (colour-coded, multi-select filter), drag-and-drop note organization
- Pin / archive notes, server-side full-text search with recent-search suggestions
- One image per note via Supabase Storage, visible in shared links too
- Read-only collection sharing via `/shared/[token]`
- Export a note as Markdown

**Authentication** (`/workspace`, delivered as the "hard" optional task — see below)
- Email/password sign-up and sign-in, Google OAuth, GitHub OAuth
- Password reset via email
- Server-side session verification (`getUser()`) protecting every page under `/workspace` and `/notes`

**Optional task delivered — Hard: Supabase Auth + a fully user-scoped notes app**, across `feature/add-auth` ([PR #7](https://github.com/panader096/doc-manager-1-8/pull/7)) and the `v2.8.1`–`v2.8.5-hard` sprints ([PR #8](https://github.com/panader096/doc-manager-1-8/pull/8)): email/password + Google + GitHub sign-in, every notes-app table scoped to `auth.uid()` via RLS, and Supabase Storage for per-note images.

## Stack

- [Next.js 16](https://nextjs.org/docs) — App Router
- TypeScript
- Tailwind CSS v4
- Supabase (Postgres, Auth, Storage) for the notes app and auth; `localStorage` for the doc manager

## Project structure

```
app/
  docs/                    # doc manager (localStorage)
  notes/                   # Supabase-backed notes app (auth-gated)
  workspace/, login/, signup/, forgot-password/, reset-password/  # Supabase Auth
  components/              # Sidebar.tsx, NotesSidebar.tsx, NoteEditor.tsx, CommandPalette.tsx, ...
  lib/
    documents.ts           # doc manager data access
    db.ts                  # notes app data access
    auth.ts                # all Supabase Auth calls
    supabase/               # client/server/middleware wrappers
supabase/
  migrations/              # numbered SQL migrations (schema, RLS, Storage)
docs/
  REFLECTION.md            # architectural decisions and lessons learned
CLAUDE.md                  # full project conventions and architecture notes for Claude Code
```
