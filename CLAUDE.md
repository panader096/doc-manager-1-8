# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A personal document management app. Users can create, edit, and delete documents. Each document has its own unique URL (e.g. `/docs/abc123`). No backend or user accounts — all data stored in localStorage.

## User experience

The app is a two-pane workspace:
- **Left sidebar** — lists all documents; has a search box that filters by title as the user types; a single "New document" button creates a document instantly
- **Right content area** — shows the selected document; the user types a title and body; changes save automatically (no save button)

Each document has its own URL (`/docs/abc123`) so bookmarking or sharing a link takes the user directly to that document. Documents persist across browser reloads via localStorage.

## Stack
- Next.js with the App Router
- TypeScript
- Tailwind CSS for all styling
- No backend — localStorage only

## Running the app
Run `npm run dev`. The app runs at http://localhost:3000.

## Routing
- `/` — document list (home)
- `/docs/[id]` — individual document page, where `id` is a unique identifier

## Conventions
- New pages go inside `app/`
- Shared UI components go in `app/components/`
- Do not add npm packages without asking first
- Do not put secrets or API keys in source files — use `.env.local`
