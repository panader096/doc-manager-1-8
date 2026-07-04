# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

This repo now contains two apps sharing one Supabase project:

- **Doc manager** (`/docs`) — the original personal document management app. Documents have a unique URL (e.g. `/docs/abc123`); data was originally localStorage-only and is being migrated to Supabase.
- **Notes app** (`/notes`) — a Supabase-native notes app with collections, tags, search, pinning, archiving, and collection sharing via link. Built from scratch against Supabase; no localStorage involved.
- **Workspace** (`/workspace`) — the only part of this app that requires signing in. A minimal placeholder area proving out Supabase Auth (email/password and Google). `/docs` and `/notes` remain fully public with no login required.

## User experience

**Doc manager** is a two-pane workspace:
- **Left sidebar** — lists all documents; has a search box that filters by title as the user types; a single "New document" button creates a document instantly
- **Right content area** — shows the selected document; the user types a title and body; changes save automatically (no save button)

Each document has its own URL (`/docs/abc123`) so bookmarking or sharing a link takes the user directly to that document.

**Notes app** is also a two-pane workspace:
- **Left sidebar** (`NotesSidebar.tsx`) — collections as expandable, drag-to-reorder groups, an always-visible "Uncollected" group, a collapsible "Archive" section, live server-side search with recent-search suggestions, a tag filter, and a dark/light toggle at the bottom
- **Right content area** (`NoteEditor.tsx`) — title, body (autosaves), a collection picker, and a tag editor
- Notes can be pinned (float to the top of their collection), archived (hidden from the main view without deleting), and moved between collections by dragging
- A collection can be shared read-only via a generated link at `/shared/[token]` — no auth, no sidebar, view-only

## Stack
- Next.js with the App Router
- TypeScript
- Tailwind CSS for all styling
- Supabase (PostgreSQL) — the app is migrating from localStorage to Supabase; both may coexist during the transition

## Running the app
Run `npm run dev`. The app runs at http://localhost:3000.

## Routing
- `/` — document list (home)
- `/docs/[id]` — individual document page, where `id` is a unique identifier
- `/notes` — notes home (empty state / select-a-note prompt)
- `/notes/[id]` — individual note, where `id` is the note's numeric `notes.id`
- `/shared/[token]` — public, read-only view of a collection shared via `collections.share_token`; no sidebar, no auth
- `/login` — sign in with email/password or Google
- `/signup` — create an account with email/password
- `/auth/callback` — OAuth callback route; exchanges the Google auth code for a session, then redirects to `/workspace`
- `/workspace` — signed-in-only placeholder area; every page under it requires a session (see Authentication below)

## Credentials

All Supabase credentials live in `.env.local` and are never hardcoded in source files. The required keys are:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

Do not add, rename, or remove these keys without updating every file that reads them.

## Data access — single source of truth

Each app has exactly one data-access module. **No component or page may import a Supabase client directly** — always go through the relevant module below.

- **Doc manager**: `app/lib/documents.ts`. The `Doc` and `Folder` interfaces there are the canonical shapes; extend them first before touching any other file.
- **Notes app**: `app/lib/db.ts`. The `Note`, `NoteListItem`, `NoteTag`, `Collection`, and `Tag` interfaces there are the canonical shapes; extend them first before touching any other file.

For either app: add a new named function to the relevant module for every new data operation. Schema changes (new tables, columns, indexes, RLS policies) go in `supabase/migrations/` as numbered SQL files.

### Notes app schema

Tables (all lowercase, all with anon select/insert/update/delete RLS policies): `notes` (`id`, `title`, `body`, `created_at`, `updated_at`, `collection_id` → `collections.id` nullable, `pinned` boolean, `archived_at` nullable timestamptz, `search_vector` generated tsvector column with a GIN index), `collections` (`id`, `name`, `created_at`, `position` integer for manual ordering, `share_token` nullable unique text), `tags` (`id`, `name`, `color`), `note_tags` (`note_id`, `tag_id`, composite primary key — join table), `search_history` (`id`, `query` unique, `searched_at`, capped at 5 rows).

A note belongs to at most one collection (`collection_id` is nullable — a note can also belong to none); a collection can contain many notes. A note can carry many tags and a tag can apply to many notes, via `note_tags`.

### Supabase client wrappers

Three thin wrappers own client creation — use the right one, never `createClient()` from `@supabase/ssr` directly:

| File | Use when |
|---|---|
| `app/lib/supabase/client.ts` | Client Components (`'use client'`) |
| `app/lib/supabase/server.ts` | Server Components, Route Handlers, Server Actions |
| `app/lib/supabase/middleware.ts` | Only `proxy.ts` at the project root — refreshes the session cookie on every request (Next.js renamed the `middleware.ts` convention to `proxy.ts`; the exported function is `proxy`, not `middleware`) |

The server client must be created inside each function that needs it — never as a module-level singleton (required for Next.js Fluid compute compatibility).

## Authentication

**Rule for agent:** Every signed-in-only page must verify the user's session with the Supabase Auth server before it loads, and redirect to the sign-in page if the user is not signed in.

- Use Supabase Auth for all sign-in and session handling — never build custom auth or store passwords yourself
- Every page under `/workspace` requires a signed-in user; verify this on the server and redirect to `/login` if they are not signed in
- After a successful sign-in, redirect to `/workspace`
- After sign-out, redirect to `/login`. Do not rely on the browser-side session alone.

Server-side session checks use `supabase.auth.getClaims()`, not `getUser()` or `getSession()` — Supabase's own docs are explicit that `getSession()` must never be trusted in server code, since it can be spoofed when cookie storage is shared with the client. All auth calls (sign up, sign in, sign in with Google, sign out) go through `app/lib/auth.ts` — the same single-source-of-truth convention as `documents.ts`/`db.ts`, just for auth instead of data.

## Conventions
- New pages go inside `app/`
- Shared UI components go in `app/components/`
- Do not add npm packages without asking first
- Do not put secrets or API keys in source files — use `.env.local`
- Before building a new feature, ask clarifying questions first to align on scope
- Keep all styling within the existing Tailwind CSS + CSS custom-property design system — no new UI libraries
- When adding a new feature that touches data: (1) update the interface in `documents.ts` or `db.ts` (whichever app), (2) add the migration SQL in `supabase/migrations/`, (3) add the function in that same module, (4) wire up the UI last
- New RLS policies: add select **and** insert **and** update **and** delete together for any anon-writable table — every table in this project that shipped with only a select policy needed a follow-up migration once insert was attempted

## Design system

All colours are CSS custom properties defined in `app/globals.css`. `:root` holds the light values; `.dark` (set on `<html>`) holds the dark values. Components use inline `style={{ color: 'var(--text-1)' }}` or Tailwind arbitrary values `bg-[var(--bg-sidebar)]`. Do **not** add `dark:` Tailwind class pairs — they are unreliable here due to CSS cascade layer ordering. See `docs/REFLECTION.md` for the full explanation.

Key tokens: `--bg-app`, `--bg-sidebar`, `--bg-active`, `--bg-hover`, `--bg-input`, `--bg-modal`, `--border`, `--border-focus`, `--text-1`, `--text-2`, `--text-3`, `--accent`, `--active-bar`, `--tag-bg`, `--tag-text`, `--tag-border`, `--shadow-modal`.

## Features already implemented

Do not re-implement these. Check the relevant component before adding anything adjacent.

| Feature | Location |
|---|---|
| Create / edit / delete documents, auto-save | `app/docs/[id]/page.tsx`, `app/lib/documents.ts` |
| Sidebar with live search | `app/components/Sidebar.tsx` |
| Markdown preview (inline parser, no library) | `app/docs/[id]/page.tsx` — `parseMarkdown()` |
| Starred documents (pinned to top) | `toggleStar()` in `documents.ts`; star button in `Sidebar.tsx` |
| Dark / light theme toggle, FOUC prevention | `Sidebar.tsx` — `toggleTheme()`; `app/layout.tsx` — `Script` |
| Live word count | `app/docs/[id]/page.tsx` — `wordCount()` |
| Tags — add, remove, multi-select filter | `updateDocumentTags()` in `documents.ts`; tag UI in `page.tsx` and `Sidebar.tsx` |
| Export / import workspace (JSON) | `exportWorkspace()` / `importWorkspace()` in `documents.ts` |
| Document history — snapshot, preview, restore | `saveSnapshot()` in `documents.ts`; history panel in `page.tsx` |
| Soft delete / trash (collapsible, default collapsed) | `deleteDocument()` / `restoreDocument()` / `emptyTrash()` in `documents.ts` |
| Command palette — Ctrl+K, fuzzy search | `app/components/CommandPalette.tsx` |
| Folder structure — drag-and-drop, create, delete | `getFolders()` / `createFolder()` / `deleteFolder()` in `documents.ts`; folder UI in `Sidebar.tsx` |

### Notes app (`/notes`)

| Feature | Location |
|---|---|
| Note create / edit / delete, autosave | `NoteEditor.tsx`, `NotesSidebar.tsx`; `createNote()` / `updateNote()` / `deleteNote()` in `db.ts` |
| Collections — create, rename, drag-to-reorder, delete-free grouping | `createCollection()` / `renameCollection()` / `reorderCollections()` in `db.ts`; group UI in `NotesSidebar.tsx` |
| Tags — add/remove on a note, colour-coded, multi-select filter | `setNoteTags()` in `db.ts` (case-insensitive get-or-create); filter UI in `NotesSidebar.tsx` |
| Move a note between collections (drag-and-drop) | `setNoteCollection()` in `db.ts`; drop handling in `NotesSidebar.tsx` |
| Pinned notes (float to top of their collection) | `setNotePinned()` in `db.ts`; pin button in `NotesSidebar.tsx` |
| Archive / unarchive (soft hide, not delete) | `archiveNote()` / `unarchiveNote()` in `db.ts`; collapsible Archive section in `NotesSidebar.tsx` |
| Server-side full-text search (prefix matching) | `searchNotes()` in `db.ts` against `notes.search_vector` |
| Search history (last 5, upsert + prune) | `getSearchHistory()` / `recordSearch()` in `db.ts` |
| Collection sharing via read-only link | `generateShareLink()` / `revokeShareLink()` / `getSharedCollection()` in `db.ts`; `app/shared/[token]/page.tsx` |
| Dark / light theme toggle | `NotesSidebar.tsx` — `toggleTheme()` (same `localStorage.theme` mechanism as the doc-manager) |

### Authentication (`/workspace`)

| Feature | Location |
|---|---|
| Email/password sign-up, sign-in, sign-out | `app/lib/auth.ts`; `app/login/page.tsx`, `app/signup/page.tsx` |
| Google sign-in (OAuth/PKCE) | `signInWithGoogleAction()` in `auth.ts`; `app/auth/callback/route.ts` |
| Session refresh on every request | `app/lib/supabase/middleware.ts`, wired up in root `proxy.ts` |
| Server-side route protection for `/workspace` | `app/workspace/layout.tsx` — checks `getClaims()`, redirects to `/login` |
