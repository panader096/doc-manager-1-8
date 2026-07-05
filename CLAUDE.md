# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

This repo now contains two apps sharing one Supabase project:

- **Doc manager** (`/docs`) — the original personal document management app. Documents have a unique URL (e.g. `/docs/abc123`); data was originally localStorage-only and is being migrated to Supabase. Still fully public, no login required.
- **Notes app** (`/notes`) — a Supabase-native notes app with collections, tags, search, pinning, archiving, and collection sharing via link. **Requires signing in** — every note, collection, tag, and search-history row belongs to exactly one user (`user_id`, enforced by RLS), so each signed-in user only ever sees their own data. The one deliberate exception: `/shared/[token]` stays anonymously readable, since that's the point of a share link.
- **Workspace** (`/workspace`) — a minimal placeholder area proving out Supabase Auth (email/password, Google, and GitHub). Requires signing in, same as `/notes`.

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
- `/forgot-password` — request a password-reset email
- `/reset-password` — set a new password; only reachable via a valid recovery link/session
- `/auth/callback` — OAuth callback route; exchanges the Google or GitHub auth code for a session, then redirects to `/workspace`
- `/auth/confirm` — email-link verification route (`token_hash` + `type`); used by the password-recovery email, redirects to `?next=` (default `/workspace`) on success or `/login` with an error on failure
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

Tables (all lowercase): `notes` (`id`, `title`, `body`, `created_at`, `updated_at`, `collection_id` → `collections.id` nullable, `pinned` boolean, `archived_at` nullable timestamptz, `search_vector` generated tsvector column with a GIN index, `image_path` nullable text, `user_id`), `collections` (`id`, `name`, `created_at`, `position` integer for manual ordering, `share_token` nullable unique text, `user_id`), `tags` (`id`, `name`, `color`, `user_id`), `note_tags` (`note_id`, `tag_id`, composite primary key — join table, no `user_id` of its own), `search_history` (`id`, `query`, `searched_at`, `user_id`, unique on `(user_id, query)`, capped at 5 rows per user).

A note belongs to at most one collection (`collection_id` is nullable — a note can also belong to none); a collection can contain many notes. A note can carry many tags and a tag can apply to many notes, via `note_tags`.

**Every table is scoped to the signed-in user.** `notes`/`collections`/`tags`/`search_history` each have a `user_id uuid not null default auth.uid() references auth.users(id)`; RLS policies are `for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)` — one policy per table covering select/insert/update/delete, not four separate ones (a deliberate simplification once the predicate is identical across all four commands). `note_tags` has no `user_id` column of its own; its policy checks ownership through the referenced `notes` row (and, in `WITH CHECK`, the referenced `tags` row too, so a user can't link their own note to someone else's tag).

**Exception:** `/shared/[token]` (`getSharedCollection()` in `db.ts`) needs to keep working for anonymous visitors. Rather than any blanket anon access, there are four narrow, explicit anon `SELECT`-only policies — `collections` where `share_token is not null`, and `notes`/`note_tags`/`tags` cascading through that same collection. This is the *only* anon access anywhere in the notes schema (Storage aside — see below); don't broaden it when adding new tables — anon gets nothing by default, and any new anon exception should be this same narrow, explicit shape.

**What happens when a note is created** (for the review call): `createNote()` in `db.ts` inserts a row with no explicit `user_id` value. Postgres fills it in itself, from the column default `auth.uid()` — a function that reads the caller's ID out of the JWT the Supabase client sent with the request. Nothing in the application code ever passes `user_id` around; ownership is stamped on by the database at insert time, not decided by a page or component. From then on, that same `user_id` is what every RLS policy checks (`auth.uid() = user_id`) to decide whether the signed-in user is allowed to see, update, or delete that row — so even a bug in the UI that requested "all notes" would still only get back the rows belonging to whoever is signed in.

### Note images (Supabase Storage)

One optional image per note, stored in the private `note-images` Storage bucket — never as base64 in the database. `notes.image_path` holds the Storage object path (not a public URL); rendering always goes through a signed URL from `getNoteImageUrl()`.

Path shape: `{user_id}/{note_id}/image.{ext}` — a stable filename per note, so re-uploading replaces the current image (`uploadNoteImage()` in `db.ts` deletes the old object first if the extension changed, so nothing is orphaned). `storage.objects` RLS mirrors the table pattern: one `for all to authenticated` policy scoped to `(storage.foldername(name))[1] = auth.uid()::text` (the owner's folder), plus one narrow anon `SELECT`-only policy extending the `/shared/[token]` exception above to cover images on notes within a shared collection. **When writing a Storage policy that joins back to `notes`/`collections` inside an `EXISTS` subquery, qualify `storage.objects.name` explicitly** — `collections` also has a `name` column, and an unqualified `name` resolves to the closer-scoped one, silently matching nothing (this broke migration `0013` on the first pass; fixed in `0014`).

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
- Every page under `/workspace` **and every page under `/notes`** requires a signed-in user; verify this on the server and redirect to `/login` if they are not signed in
- After a successful sign-in, redirect to `/workspace`
- After sign-out, redirect to `/login`. Do not rely on the browser-side session alone.
- A sign-out control must be reachable from within `/notes`, not just `/workspace` (`NotesSidebar.tsx`'s footer)
- Never put the service-role/secret key in any `NEXT_PUBLIC_`-prefixed env var, or anywhere client-accessible — only the two keys listed under Credentials belong in this app at all

Server-side session checks use **`supabase.auth.getUser()`** — not `getSession()` (never trust it server-side; it can be spoofed when cookie storage is shared with the client) and, in this project, not `getClaims()` either, even though it's Supabase's newer/faster recommendation — this project's rubric specifically calls for `getUser()`, so that's the standard here. If a diff introduces `getSession()` in server code (a Server Component, Route Handler, Server Action, or the proxy), flag it before merging. All auth calls (sign up, sign in, sign in with Google, sign out) go through `app/lib/auth.ts` — the same single-source-of-truth convention as `documents.ts`/`db.ts`, just for auth instead of data.

## Conventions
- New pages go inside `app/`
- Shared UI components go in `app/components/`
- Do not add npm packages without asking first
- Do not put secrets or API keys in source files — use `.env.local`
- Before building a new feature, ask clarifying questions first to align on scope
- Keep all styling within the existing Tailwind CSS + CSS custom-property design system — no new UI libraries
- When adding a new feature that touches data: (1) update the interface in `documents.ts` or `db.ts` (whichever app), (2) add the migration SQL in `supabase/migrations/`, (3) add the function in that same module, (4) wire up the UI last
- New RLS policies: cover select **and** insert **and** update **and** delete together — every table in this project that shipped with only a select policy needed a follow-up migration once insert was attempted. For a user-owned table, one `for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)` policy does this in one statement; don't add anon access unless it's a narrow, explicit, documented exception (see Notes app schema)

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
| Export a note as Markdown | `handleExportMarkdown()` in `NoteEditor.tsx` — client-side Blob download, no server round-trip |
| Loading skeleton while notes fetch | `NotesSidebar.tsx` — pulsing placeholder rows instead of a blank/plain-text loading state |
| Search history (last 5, upsert + prune) | `getSearchHistory()` / `recordSearch()` in `db.ts` |
| Collection sharing via read-only link | `generateShareLink()` / `revokeShareLink()` / `getSharedCollection()` in `db.ts`; `app/shared/[token]/page.tsx`; the one narrow anon-read exception in an otherwise fully user-scoped schema |
| Dark / light theme toggle | `NotesSidebar.tsx` — `toggleTheme()` (same `localStorage.theme` mechanism as the doc-manager) |
| One image per note via Supabase Storage (not base64), visible in shared links too | `uploadNoteImage()` / `removeNoteImage()` / `getNoteImageUrl()` in `db.ts`; upload/preview UI in `NoteEditor.tsx`; display in `SharedCollectionView.tsx`; private `note-images` bucket, see Note images above |

### Authentication (`/workspace`)

| Feature | Location |
|---|---|
| Email/password sign-up, sign-in, sign-out | `app/lib/auth.ts`; `app/login/page.tsx`, `app/signup/page.tsx` |
| Google / GitHub sign-in (OAuth/PKCE) | `signInWithGoogleAction()` / `signInWithGitHubAction()` in `auth.ts`; both share the same provider-agnostic `app/auth/callback/route.ts` |
| Password reset via email | `requestPasswordResetAction()` / `updatePasswordAction()` in `auth.ts`; `app/forgot-password/page.tsx`, `app/reset-password/page.tsx`, `app/auth/confirm/route.ts` (`verifyOtp()` with `token_hash`+`type` — the current documented pattern for email-link verification, distinct from the OAuth `code` exchange `/auth/callback` uses) |
| Session refresh on every request | `app/lib/supabase/middleware.ts`, wired up in root `proxy.ts` |
| Server-side route protection for `/workspace` and `/notes` | `app/workspace/layout.tsx` / `app/notes/layout.tsx` — each checks `getUser()`, redirects to `/login`; the proxy (`app/lib/supabase/middleware.ts`) checks both path prefixes too, as a first line of defense |
