# Persistence Decision — REFLECTION.md

## Decision
**Use `localStorage` for all document persistence.**

## Constraints
- Single user, single browser, single machine
- No backend, no database, no cloud storage
- App runs on localhost only — nothing hosted or shared

## Options considered

| Option | Verdict |
|---|---|
| `localStorage` | ✅ Selected |
| `IndexedDB` | Overkill for this scale |
| `sessionStorage` | Ruled out — data clears on tab close |
| Cookies | Ruled out — 4KB limit, designed for servers |
| File System Access API | Ruled out — requires user permission per session, poor browser support |

## Reasoning

`localStorage` was selected because every constraint points toward simplicity:

- **Scale** — personal text documents will stay well within the ~5MB browser limit
- **Complexity** — no async/await needed; reads and writes are synchronous and straightforward
- **Queries** — filtering and sorting can be done in JavaScript; no database-level querying is needed
- **Familiarity** — the same pattern used in the to-do app (Sprint 1/1.5), so there is no new API to learn
- **Debuggability** — localStorage is inspectable directly in browser DevTools

`IndexedDB` would be the right choice if the app were expected to handle hundreds of large documents or binary attachments. Neither applies here, so the added complexity buys nothing.

## Data model (planned)
Documents will be stored as a JSON-serialised array under a single key (e.g. `doc_manager_documents`). Each document object will contain at minimum:
- `id` — unique identifier (used in the URL `/docs/[id]`)
- `title` — document title
- `body` — document content
- `createdAt` — ISO timestamp
- `updatedAt` — ISO timestamp
