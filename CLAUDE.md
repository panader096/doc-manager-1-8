# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A personal document management app. Users can create, edit, and delete documents. Each document has its own unique URL (e.g. `/docs/abc123`). Data is stored in Supabase (PostgreSQL); the app was originally localStorage-only and is being migrated.

## User experience

The app is a two-pane workspace:
- **Left sidebar** — lists all documents; has a search box that filters by title as the user types; a single "New document" button creates a document instantly
- **Right content area** — shows the selected document; the user types a title and body; changes save automatically (no save button)

Each document has its own URL (`/docs/abc123`) so bookmarking or sharing a link takes the user directly to that document. Documents persist across browser reloads via localStorage.

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

## Credentials

All Supabase credentials live in `.env.local` and are never hardcoded in source files. The required keys are:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

Do not add, rename, or remove these keys without updating every file that reads them.

## Data access — single source of truth

**All database reads and writes must go through `app/lib/documents.ts`.** No component or page may import a Supabase client directly.

- Add a new named function to `documents.ts` for every new data operation.
- The `Doc` and `Folder` interfaces in `documents.ts` are the canonical data shapes. Extend them there first before touching any other file.
- Schema changes (new tables, columns, indexes) go in `supabase/migrations/` as numbered SQL files.

### Supabase client wrappers

Two thin wrappers own client creation — use the right one, never `createClient()` from `@supabase/ssr` directly:

| File | Use when |
|---|---|
| `app/lib/supabase/client.ts` | Client Components (`'use client'`) |
| `app/lib/supabase/server.ts` | Server Components, Route Handlers, Server Actions |

The server client must be created inside each function that needs it — never as a module-level singleton (required for Next.js Fluid compute compatibility).

## Conventions
- New pages go inside `app/`
- Shared UI components go in `app/components/`
- Do not add npm packages without asking first
- Do not put secrets or API keys in source files — use `.env.local`
- Before building a new feature, ask clarifying questions first to align on scope
- Keep all styling within the existing Tailwind CSS + CSS custom-property design system — no new UI libraries
- When adding a new feature that touches data: (1) update the interface in `documents.ts`, (2) add the migration SQL in `supabase/migrations/`, (3) add the function in `documents.ts`, (4) wire up the UI last

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
