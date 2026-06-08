# Document Manager

A personal document management app built as part of the Turing College "Building with AI / Claude Code" course (Sprint 1.8).

Single-user, browser-only workspace. No backend, no accounts — all data stored in `localStorage`.

## Screenshot

![Document Manager workspace](docs/screenshot.png)

## Running locally

```bash
npm install
npm run dev
```

Opens at [http://localhost:3000](http://localhost:3000).

## Features

**Core**
- Create, edit, and delete documents with auto-save (400 ms debounce)
- Each document has a unique URL (`/docs/[id]`) — bookmarkable and shareable
- Live title search in the sidebar
- Markdown preview (`# h1`, `**bold**`, `*italic*`, `- list`)

**Optional — Easy (branch `1.8.6-optional-easy`)**
- Star documents — pinned to the top of the list
- Dark / light theme toggle with FOUC prevention
- Live word count in edit mode

**Optional — Medium (branch `1.8.7-optional-medium`)**
- Tags — add, remove, filter across the workspace
- Export / import workspace as JSON
- Document history — up to 3 manual snapshots per document, with preview and restore

**Optional — Hard (branch `1.8.8-hard`)**
- Soft delete / trash — documents land in a collapsible trash section before permanent removal
- Command palette — `Ctrl+K` opens a fuzzy search overlay with Preview / Edit / Delete actions
- Folder structure — create named folders, drag documents into them, collapse/expand, delete with choice to keep or discard contents

**UI design (branch `1.8.9-ui-design`)**
- Apple Pro aesthetic — Xcode/Final Cut Pro colour palette, system font stack (`-apple-system`, SF Pro)
- CSS custom-property design tokens; dark and light themes both work correctly
- 4 px border radius throughout, 2 px left-bar active indicator, monospace timestamps and tags

## Stack

- [Next.js 16](https://nextjs.org/docs) — App Router
- TypeScript
- Tailwind CSS v4
- `localStorage` for all persistence — no server required

## Project structure

```
app/
  components/
    Sidebar.tsx        # document list, folders, search, theme toggle
    DocsShell.tsx      # two-pane layout shell
    CommandPalette.tsx # Ctrl+K overlay
  docs/
    page.tsx           # empty state
    [id]/page.tsx      # editor + preview
  lib/documents.ts     # all storage functions
  globals.css          # design tokens (CSS custom properties)
  layout.tsx           # root layout with FOUC-prevention script
docs/
  REFLECTION.md        # architectural decisions
  nextjs-layouts-and-pages.md  # cited Next.js reference
```
