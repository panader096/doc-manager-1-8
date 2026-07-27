# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Scope note for this review:** this repo also contains a Doc Manager (`/docs`, Sprint 1) and a Notes app + Auth workspace (`/notes`, `/workspace`, Sprint 2) — both still live and running, sharing the same Supabase project and codebase conventions. This file is scoped to **Sprint 3 only** (Personal Journal, Chat, Harry, and the extra-features work built on top of them) and does not document Doc Manager's or Notes' internals. The one exception: Chat's RAG search reads from a `documents`/`match_documents` pair that was added *as* Sprint 3 work on top of the pre-existing Notes tables — that piece is documented below since Sprint 3 code depends on it.

## Project

Three apps make up Sprint 3, all sharing one Supabase project with the pre-existing Doc Manager/Notes/Auth apps:

- **Personal Journal** (`/journal`) — a Supabase-native daily journal: one entry per calendar day per user, editable, full-text searchable, one optional image per entry. **Requires signing in**, user-scoped RLS pattern, zero anon surface anywhere (no sharing feature exists for this app).
- **Chat** (`/chat`) — a single, persistent AI chat conversation per signed-in user, backed by OpenRouter, with streaming responses and model-driven RAG search over the user's own Notes. **Requires signing in**, user-scoped RLS, zero anon surface. See "AI model calls" below for the server-only constraint on this app's model calls.
- **Harry** (`/harry`) — the AI-centric app of this sprint, and its core deliverable. The user uploads a PDF and asks an AI reviewer ("Harry") expert questions about it; every answer is grounded strictly in that document, with a page citation and a self-rated confidence per claim, after a hidden self-validation pass. **The AI is not a feature bolted onto this app — it *is* the app**: strip out the model calls and there's nothing left but a file upload with no way to ever read or query what's in it. Multiple independent, named chats per user, each scoped to one uploaded document. **Requires signing in**, user-scoped RLS, zero anon surface except one deliberate, narrow exception: a single shared answer can be made anonymously readable via `/harry-shared/[token]`.

## User experience

**Personal Journal** is a two-pane workspace:
- **Left sidebar** (`JournalSidebar.tsx`) — entries listed by date (newest first), a "Today" button that opens today's entry or creates it if it doesn't exist yet, live full-text search, and a dark/light toggle at the bottom
- **Right content area** (`JournalEditor.tsx`) — the entry's date (read-only), title, body (autosaves), and a single optional image
- No tags, no collections, no export, no sharing — deliberately narrower in scope than the notes app
- A signed-in-only header (workspace link, user email, sign-out) sits above the two panes

**Chat** is a single-pane workspace (no sidebar — one conversation per user, nothing to list):
- **Message list** (`ChatView.tsx`) — scrollable history, user messages right-aligned in an accent bubble, assistant replies left-aligned in a `--bg-modal` bubble, auto-scrolls to the newest message, streams in token-by-token
- **Input area** — a textarea (Enter to send, Shift+Enter for a newline), an attach-image button, and a Send button, pinned to the bottom
- The full conversation is replayed to the model on every turn, which is how it "remembers" earlier turns — no separate memory store
- **RAG search**: the model decides for itself whether to search the user's notes, via a `search_notes` tool (OpenRouter/OpenAI-compatible native tool-calling). The tool's implementation is `searchNoteChunks()` (`embeddings-actions.ts`): embeds the model's query and calls `match_documents`, always scoped to the signed-in user via `p_user_id`. `sendMessage()`/the streaming route run a bounded loop (`MAX_TOOL_ROUNDS = 3`): if the model calls the tool, results (with note titles, a legible similarity-band label, and raw similarity score) are appended and the model is called again, so it can rewrite and re-search when results look weak. A multi-part question is expected to trigger separate searches per sub-question rather than one broad query. A general-knowledge question the model judges unrelated to notes gets answered directly, no search at all.
- **Streaming**: hand-rolled Server-Sent Events via a `POST /api/chat` Route Handler (no Vercel AI SDK). The route resolves any tool rounds first (non-streamed), then either reuses that round's already-generated content (flushed as simulated progressive chunks, avoiding a second redundant model call) or, in the rare case every round used a tool, makes one genuine streaming call.
- **Multimodal input**: an optional image can attach to a single message; only the *current* turn's image is ever sent as real image content — past images collapse to a text marker (`[Attached image: name]`) when replayed as history.
- **Per-user model choice**: Haiku 4.5, Sonnet 5, or Gemini 2.5 Flash, via a dropdown in the header, persisted per user.
- **Model + token-usage transparency**: every assistant reply shows which model actually answered and its token count.
- No threads, no message editing/deletion.
- A signed-in-only header (workspace link, model selector, user email, sign-out) sits above the message list.

**Harry** is a two-pane workspace, unlike `/chat` (which has no sidebar since there's only ever one conversation):
- **Left sidebar** (`HarrySidebar.tsx`) — lists the user's chats with Harry (name, uploaded PDF filename, a processing/failed status badge while ingestion runs), a "+ New chat" control that opens an inline name + PDF-upload form, rename and delete (confirmation modal)
- **Right content area** (`HarryChatView.tsx`) — message history styled like `ChatView.tsx` (user right-aligned, Harry left-aligned), except Harry's replies render each claim with an inline badge showing its page number and confidence (`[p. N; confidence: High|Medium|Low]` markers parsed out of the stored text by `parseHarryClaims()` in `harry.ts`); input is disabled until the chat's document finishes processing; a model selector and image-attach control sit alongside; a "Share" control appears under each of Harry's own replies
- **Ingestion**: uploading a PDF triggers `createChat()` (`harry-actions.ts`), which parses it with `pdfjs-dist` page-by-page, chunks and embeds each page's text, and only then flips the chat to usable — a PDF over 100 pages/20MB, or one with no extractable text (scanned/image-only), is rejected with a reason shown in the sidebar rather than silently failing
- **Answering**: unlike `/chat`'s `search_notes` tool (which the model can choose to skip), retrieval here is mandatory and automatic on every message — Harry is never given the option to answer without the document's own text in front of it. Each turn also runs a hidden second model call that re-checks the first draft against the same retrieved pages before anything is shown to the user or persisted; see "AI model calls" below
- **Persona**: Harry answers only from document excerpts, never general knowledge; if a question is about the conversation itself (e.g. "what did I ask earlier?") rather than the document, it answers directly from visible history with no citation marker — the citation/confidence rule applies specifically to claims about the document's content
- **Multimodal input**: an image can attach to a single question, alongside the chat's mandatory document grounding — it's additional context for that one question, seen by both the draft and the hidden validation call; retrieval itself stays text-query-only
- **Per-user model choice**, including a free ($0) option — see "Features already implemented" below
- **Shareable answers**: a "Share" button on any assistant reply produces a public, read-only, text-only link at `/harry-shared/[token]`; revocable
- A signed-in-only header (workspace link, user email, sign-out) sits above the two panes, same as journal/chat

## Stack
- Next.js with the App Router
- TypeScript
- Tailwind CSS for all styling
- Supabase (PostgreSQL, Auth, Storage, pgvector)

## Running the app
Run `npm run dev`. The app runs at http://localhost:3000.

## E2E tests
Playwright tests live in `e2e/`, run with `npm run test:e2e` (`playwright.config.ts` reuses an already-running dev server on port 3000 rather than starting a second one). Tests sign in as a dedicated test account (`paulbakker90+e2etest@gmail.com`, seeded directly into `auth.users`/`auth.identities` via SQL rather than the real signup form, since Supabase's built-in test mailer hard-caps confirmation emails at a couple per hour — see `docs/REFLECTION-journal.md`) — never use a real user's account for automated tests.

## Routing
- `/journal` — journal home (empty state / select-or-start-today prompt)
- `/journal/[id]` — individual journal entry, where `id` is the entry's numeric `journal_entries.id`
- `/chat` — the single AI chat conversation for the signed-in user
- `/harry` — Harry home (empty state / select-or-start-a-chat prompt)
- `/harry/[id]` — an individual chat with Harry, where `id` is the chat's numeric `reviewer_chats.id`
- `/harry-shared/[token]` — public, read-only, anonymously-readable view of one shared Harry answer; no sidebar, no auth
- `/workspace` — signed-in-only placeholder area; every page under it requires a session (see Authentication below)
- `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/auth/callback`, `/auth/confirm` — Supabase Auth flows, shared across every signed-in app in this repo (predates Sprint 3)

## Credentials

All Supabase credentials live in `.env.local` and are never hardcoded in source files. The required keys are:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
OPENROUTER_API_KEY=...
```

Do not add, rename, or remove these keys without updating every file that reads them.

## Data access — single source of truth

Each app has exactly one data-access module. **No component or page may import a Supabase client directly** — always go through the relevant module below.

- **Personal Journal**: `app/lib/journal.ts`. The `JournalEntry` interface there is the canonical shape; extend it first before touching any other file.
- **Chat**: `app/lib/chat.ts` **and** `app/lib/chat-actions.ts` **and** `app/lib/chat-shared.ts` — a deliberate three-file split, forced by Next.js: it disallows an inline `'use server'` Server Action inside a plain file that's imported by a Client Component, and separately disallows a non-async-function export (a plain string/object constant) from a file marked `'use server'`. `chat.ts` holds the canonical `ChatMessage` interface and `getMessages()`/`getChatImageUrl()` (client-safe reads); `chat-shared.ts` is a plain (non-`'use server'`) module holding `SYSTEM_PROMPT`, `SEARCH_NOTES_TOOL`, `MAX_TOOL_ROUNDS` — needed by both `chat-actions.ts` and the streaming route below; `chat-actions.ts` is a file-level `'use server'` module holding `sendMessage()` (the non-streaming path, still functionally correct but not the live UI's send path since streaming shipped) and `runSearchNotesTool()`. The actual live send path for `/chat` is `app/api/chat/route.ts`, a Route Handler (not a Server Action, since streaming a token-by-token response isn't expressible as a single resolved Server Action return value).
- **Harry**: three files. `app/lib/harry.ts` holds the canonical `ReviewerChat`/`ReviewerMessage`/`HarryClaim`/`SharedReviewerMessage` interfaces, client-safe reads (`getChats()`, `getChat()`, `getMessages()`, `getReviewerImageUrl()`), `parseHarryClaims()`, and the sharing functions (`createShare()`, `revokeShare()`, `getShareToken()`, `getSharedMessage()` — the last goes through a `SECURITY DEFINER` RPC, not a direct table query, see "Harry (doc reviewer) app schema" below). `app/lib/harry-ingest.ts` is the PDF parse/chunk/embed pipeline (`ingestDocument()`, `pdfjs-dist`-based), a plain server-only module imported only by `harry-actions.ts`. `app/lib/harry-actions.ts` is the file-level `'use server'` module: `createChat()`, `sendMessage()`, `renameChat()`, `deleteChat()`.
- **Notes-embedding pipeline (Sprint 3 work on a pre-existing Sprint 2 table)**: `app/lib/embeddings-actions.ts` holds `searchNoteChunks()`, called by Chat's `search_notes` tool. It reads from the `documents` table (added in migration `0020`, one row per embedded note chunk) via the `match_documents` RPC. The Notes app's own CRUD (collections, tags, note creation) predates this sprint and is out of scope here.

For any app: add a new named function to the relevant module for every new data operation. Schema changes (new tables, columns, indexes, RLS policies) go in `supabase/migrations/` as numbered SQL files.

### Journal app schema

One table: `journal_entries` (`id`, `user_id`, `entry_date` date, `title`, `body`, `image_path` nullable text, `search_vector` generated tsvector column with a GIN index, `created_at`, `updated_at`), with `unique (user_id, entry_date)` enforcing one entry per calendar day per user at the database level — not just in the UI. No tags, no collections.

Same user-scoping pattern as every table in this project: `user_id uuid not null default auth.uid() references auth.users(id)`, one `for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)` policy covering select/insert/update/delete. **Zero anon access anywhere** — no sharing feature, so there is no anon exception at all.

One optional image per entry, private `journal-images` Storage bucket, `journal_entries.image_path` holds the Storage object path, rendering goes through a signed URL from `getEntryImageUrl()`. Path shape `{user_id}/{entry_id}/image.{ext}`. Owner-folder RLS, no anon read policy.

### Chat app schema

One table: `chat_messages` (`id`, `user_id`, `role` — `check (role in ('user', 'assistant'))`, `content`, `created_at`, `model` nullable text, `total_tokens` nullable integer, `image_path` nullable text) — an append-only log, one ongoing conversation per user. `model`/`total_tokens` persist which OpenRouter model slug and token count produced each assistant reply, for the transparency feature. No threads, no title.

Same user-scoping pattern: `user_id uuid not null default auth.uid() references auth.users(id)`, one `for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)` policy. **Zero anon access anywhere.**

One optional image per message, private `chat-images` Storage bucket (5MB limit, image mime types only), owner-folder RLS, short-lived signed URLs for both model-facing content and UI display.

`user_settings` (shared with Harry, see below) holds `chat_model` — validated server-side against `CHAT_ALLOWED_MODELS` in `app/lib/ai.ts` before ever being passed to `createChatCompletion()`, since a user could otherwise edit their own row directly via the Supabase client and point requests at an arbitrary, unvetted, or expensive model billed to this app's single shared `OPENROUTER_API_KEY`.

### Harry (doc reviewer) app schema

Four tables:

- `reviewer_chats` (`id`, `user_id`, `title`, `doc_filename`, `doc_path`, `doc_status` — `check (doc_status in ('processing', 'ready', 'failed'))`, `doc_status_reason` nullable, `created_at`) — one row per chat, one PDF per chat, fixed at creation
- `reviewer_messages` (`id`, `user_id`, `chat_id` → `reviewer_chats.id` `on delete cascade`, `role` — `check (role in ('user', 'assistant'))`, `content`, `created_at`, `model` nullable text, `total_tokens` nullable integer, `image_path` nullable text) — full history is replayed to the model on every turn, same "memory" mechanism as `chat_messages`
- `reviewer_doc_chunks` (`id`, `user_id`, `chat_id` → `reviewer_chats.id` `on delete cascade`, `page int not null`, `content`, `embedding vector(1536)`) — the RAG store for this app
- `reviewer_shares` (`id`, `user_id`, `message_id` → `reviewer_messages.id` `on delete cascade`, `share_token` unique text, `created_at`) — one row per active share; **every row in this table is an active share by construction**

Same user-scoping pattern as every table in this project. **Anon access is one deliberate, narrow exception**, not a blanket one: the *only* anon-reachable surface is a `SECURITY DEFINER` RPC, `get_shared_reviewer_message(p_token text) returns table (content text, created_at timestamptz)`. There is **no anon SELECT policy on `reviewer_shares` or `reviewer_messages` at all** — an earlier version of this feature (migration `0026`) shipped exactly that (an unfiltered anon `SELECT` on `reviewer_shares`, plus a `reviewer_messages` policy that checked "was this message shared by *anyone*" rather than "did the caller present the matching token"), which let any anonymous visitor enumerate every share token and read every shared message by guessing small sequential ids. Migration `0027` dropped both broken policies and replaced them with the token-parameterized RPC — the token must be supplied to get anything back, and `share_token` is never returned to the client. **Do not reintroduce a direct anon SELECT policy on either table** — any future sharing-adjacent feature must go through a similarly scoped RPC, not a raw table grant.

Retrieval goes through `match_reviewer_chunks(query_embedding, match_threshold, match_count, p_user_id, p_chat_id)` — scoped by both user and chat so one chat's chunks never leak into another chat's answers even for the same user. `security invoker` with `set search_path = public, extensions` set explicitly.

One PDF per chat, private `reviewer-docs` bucket (`file_size_limit` 20MB, `allowed_mime_types` restricted to `application/pdf`), path `{user_id}/{chat_id}/document.pdf`. `deleteChat()` removes the Storage object before deleting the `reviewer_chats` row — a failed Storage removal blocks the row delete, so a chat can never be deleted while leaving its PDF orphaned. One optional image per message, separate private `reviewer-images` bucket (kept apart from the PDF-only `reviewer-docs`), same owner-folder RLS pattern.

`user_settings` (`user_id` PK default `auth.uid()`, `chat_model` text, `harry_model` text, `updated_at`) is shared between Chat and Harry — one row per user, lazily created on first read. `harry_model` is validated server-side against `HARRY_ALLOWED_MODELS` in `app/lib/ai.ts`, a **different** allow-list than Chat's (Harry swaps Sonnet for a free-tier model — see "Features already implemented" below).

### Supabase client wrappers

Three thin wrappers own client creation — use the right one, never `createClient()` from `@supabase/ssr` directly:

| File | Use when |
|---|---|
| `app/lib/supabase/client.ts` | Client Components (`'use client'`) |
| `app/lib/supabase/server.ts` | Server Components, Route Handlers, Server Actions |
| `app/lib/supabase/middleware.ts` | Only `proxy.ts` at the project root — refreshes the session cookie on every request |

The server client must be created inside each function that needs it — never as a module-level singleton (required for Next.js Fluid compute compatibility).

## Authentication

**Rule for agent:** Every signed-in-only page must verify the user's session with the Supabase Auth server before it loads, and redirect to the sign-in page if the user is not signed in.

- Every page under `/workspace`, `/journal`, `/chat`, and `/harry` requires a signed-in user; verify this on the server and redirect to `/login` if they are not signed in. The proxy (`app/lib/supabase/middleware.ts`) enforces this as a first line of defense — every new signed-in-only app added to this repo must be added to its `isProtectedPath` check, not just given its own layout-level check.
- **`isProtectedPath` uses segment-bound matching, not a bare prefix, for `/harry` specifically**: `pathname === '/harry' || pathname.startsWith('/harry/')`, not `pathname.startsWith('/harry')`. A bare prefix check also matches `/harry-shared/[token]`, which must stay public — this exact bug shipped once (found and fixed the same day) before merge. The other four prefixes (`/workspace`, `/notes`, `/journal`, `/chat`) still use a bare `startsWith` — not currently broken (no sibling public route collides with any of them today), but the same class of bug would recur if one ever did; prefer the segment-bound form for any new prefix added here.
- After a successful sign-in, redirect to `/workspace`. After sign-out, redirect to `/login`.
- A sign-out control must be reachable from within `/journal`, `/chat`, and `/harry`, not just `/workspace`.

Server-side session checks use **`supabase.auth.getUser()`** — not `getSession()` (never trust it server-side) and not `getClaims()` either, even though it's Supabase's newer/faster recommendation — this project's rubric specifically calls for `getUser()`. If a diff introduces `getSession()` in server code, flag it before merging.

## AI model calls

- All LLM and embedding calls must happen server-side only. Never call OpenRouter from browser code.
- `OPENROUTER_API_KEY` lives in `.env.local` and must never have a `NEXT_PUBLIC_` prefix or be passed to client components.
- The connection itself lives in `app/lib/ai.ts` (`createChatCompletion()`, `createChatCompletionStream()`, `createEmbeddings()`) — the single OpenRouter connection point for the whole app; extend it, never bypass it with a second `fetch()` call elsewhere.
- **`DEFAULT_MODEL`**: `anthropic/claude-haiku-4.5`. Used whenever a user has no stored model preference yet.
- **Per-user model choice, per app, with a server-side allow-list — this is a deliberate security boundary, not just a UI nicety:**
  - `CHAT_ALLOWED_MODELS` = `anthropic/claude-haiku-4.5`, `anthropic/claude-sonnet-5`, `google/gemini-2.5-flash`
  - `HARRY_ALLOWED_MODELS` = `anthropic/claude-haiku-4.5`, `google/gemma-4-26b-a4b-it:free`, `google/gemini-2.5-flash` — Harry swaps Sonnet for a free ($0) model; document QA doesn't need Sonnet's extra reasoning cost the way general chat might
  - `sanitizeModel(model, allowedModels)` in `ai.ts` must be called at every site that reads a stored `chat_model`/`harry_model` before passing it to a completion call — an unrecognized value falls back to `undefined` (→ `DEFAULT_MODEL`), exactly like a missing settings row. **Never pass a stored model preference straight to `createChatCompletion()`/`createChatCompletionStream()` without sanitizing it first** — a user can otherwise edit their own `user_settings` row directly via the Supabase client and point their requests at an arbitrary, unvetted, or expensive model billed to this app's single shared key. Both `MODEL_OPTIONS_BY_APP` in `ModelSelector.tsx` and `CHAT_ALLOWED_MODELS`/`HARRY_ALLOWED_MODELS` in `ai.ts` must be kept in sync — the UI must never offer a slug the allow-list would then reject.
- Callers of `createChatCompletion()`/`createChatCompletionStream()`, all file-level `'use server'` modules or Route Handlers: `app/api/chat/route.ts` (streaming, resolves tool rounds non-streamed then reuses that content or streams the final call); `app/lib/chat-actions.ts`'s `sendMessage()` (non-streaming fallback path, same tool-loop logic); `app/lib/harry-actions.ts`'s `sendMessage()` (calls `createChatCompletion()` twice per turn — mandatory automatic retrieval feeds the first draft call, then a second hidden call validates that draft against the same retrieved pages before anything is shown to the user or persisted).
- Any new feature that calls OpenRouter should follow the same shape: the call lives in a file-level `'use server'` module or a Route Handler, never in a plain module imported by a Client Component (Next.js rejects inline `'use server'` functions in that shape, and rejects non-async-function exports from a `'use server'` file — see the two-/three-file split above).

## Embeddings

- Embedding model: `openai/text-embedding-3-small` via OpenRouter's embeddings endpoint (`createEmbeddings()` in `app/lib/ai.ts`), using the existing `OPENROUTER_API_KEY`. All embedding calls happen server-side only.
- Two vector-store tables share this model and dimension: the `documents` table (`note_id`-scoped, migration `0020`, feeds Chat's `search_notes` tool) and Harry's `reviewer_doc_chunks` table (`chat_id`-scoped, `page`-tagged, migration `0021`). Both `embedding` columns are `vector(1536)` — do not change this dimension on either table.
- **Never change the embedding model after initial setup without dropping and re-embedding every row in both tables.** Changing the model breaks retrieval silently, and changing it for only one table would leave the two vector stores using incompatible embedding spaces.

## Conventions
- New pages go inside `app/`
- Shared UI components go in `app/components/`
- Do not add npm packages without asking first
- Do not put secrets or API keys in source files — use `.env.local`
- Before building a new feature, ask clarifying questions first to align on scope
- Keep all styling within the existing Tailwind CSS + CSS custom-property design system — no new UI libraries
- New RLS policies: cover select **and** insert **and** update **and** delete together. For a user-owned table, one `for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)` policy does this in one statement; don't add anon access unless it's a narrow, explicit, documented exception — and prefer a `SECURITY DEFINER` RPC over a direct anon `SELECT` policy whenever the exception needs to be scoped by a caller-supplied value (a token, not just a boolean "is this shared at all") — see the Harry sharing schema above for exactly why a naive anon policy is not safe here.
- Any RPC function: set `search_path` explicitly (`set search_path = public` or `public, extensions`) — an RPC that omits this failed to push once already in this project's history.
- Security headers (CSP, `X-Frame-Options`, `X-Content-Type-Options`) are set in `next.config.ts`'s `headers()` function — don't duplicate them in `vercel.json` or a route handler.

## Design system

All colours are CSS custom properties defined in `app/globals.css`. `:root` holds the light values; `.dark` (set on `<html>`) holds the dark values. Components use inline `style={{ color: 'var(--text-1)' }}` or Tailwind arbitrary values `bg-[var(--bg-sidebar)]`. Do **not** add `dark:` Tailwind class pairs — they are unreliable here due to CSS cascade layer ordering. See `docs/REFLECTION.md` for the full explanation.

Key tokens: `--bg-app`, `--bg-sidebar`, `--bg-active`, `--bg-hover`, `--bg-input`, `--bg-modal`, `--border`, `--border-focus`, `--text-1`, `--text-2`, `--text-3`, `--accent`, `--active-bar`, `--tag-bg`, `--tag-text`, `--tag-border`, `--shadow-modal`.

## Features already implemented (Sprint 3)

Do not re-implement these. Check the relevant component before adding anything adjacent.

### Personal Journal app (`/journal`)

| Feature | Location |
|---|---|
| Entry create / edit / delete, autosave | `JournalEditor.tsx`, `JournalSidebar.tsx`; `createEntry()` (via `getOrCreateTodayEntry()`) / `updateEntry()` / `deleteEntry()` in `journal.ts` |
| One entry per calendar day per user | `unique (user_id, entry_date)` constraint; `getOrCreateTodayEntry()` opens today's entry if it exists instead of creating a duplicate |
| Server-side full-text search | `searchEntries()` in `journal.ts` against `journal_entries.search_vector` |
| One image per entry via Supabase Storage | `uploadEntryImage()` / `removeEntryImage()` / `getEntryImageUrl()` in `journal.ts`; private `journal-images` bucket |
| Delete-confirmation dialog | `JournalSidebar.tsx` — `confirmingDeleteId` state |

### Chat app (`/chat`)

| Feature | Location |
|---|---|
| Send a message, get a streamed AI reply, full conversational memory | `ChatView.tsx`; `POST /api/chat` (`app/api/chat/route.ts`, hand-rolled SSE) |
| Persistent single conversation per user, loaded on mount | `getMessages()` in `chat.ts`; `chat_messages` table |
| Model-driven note search via a tool call, with citation and similarity bands | `search_notes` tool in `chat-shared.ts`/`chat-actions.ts`; `searchNoteChunks()` in `embeddings-actions.ts`; `similarityBand()` helper labels results "strong"/"moderate"/"weak" match |
| Per-user model choice | `ModelSelector.tsx`, `settings.ts`, `CHAT_ALLOWED_MODELS` in `ai.ts` |
| Model + token-usage display | `chat_messages.model`/`total_tokens`, rendered under each assistant reply in `ChatView.tsx` |
| Multimodal image input | `chat_messages.image_path`, `chat-images` bucket, `ContentPart`/`ChatMessage` union in `ai.ts` |
| e2e coverage: memory, note citation, honest "not found", tool-skip for general questions, signed-out lockout | `e2e/chat.spec.ts`, `e2e/chat-notes-rag.spec.ts` |

### Harry, the Intelligent Doc Reviewer (`/harry`)

| Feature | Location |
|---|---|
| Multiple named chats per user, each scoped to one uploaded PDF | `HarrySidebar.tsx`; `createChat()` / `renameChat()` / `deleteChat()` in `harry-actions.ts` |
| PDF upload → parse → chunk → embed pipeline | `createChat()` in `harry-actions.ts`; `ingestDocument()` in `harry-ingest.ts` |
| Mandatory, automatic retrieval-grounded answers | `sendMessage()` in `harry-actions.ts`; `match_reviewer_chunks` RPC |
| Per-claim page citation and self-rated confidence, rendered as inline badges | `[p. N; confidence: High\|Medium\|Low]` markers; `parseHarryClaims()` in `harry.ts`; `AssistantContent` in `HarryChatView.tsx` |
| Hidden self-validation pass | `sendMessage()` in `harry-actions.ts`; only the validated answer is ever persisted |
| Tuned persona distinguishing document claims from conversation recall | `HARRY_SYSTEM_PROMPT` in `harry-actions.ts` |
| Per-user model choice, including a free ($0) option | `ModelSelector.tsx`, `HARRY_ALLOWED_MODELS` in `ai.ts` |
| Multimodal image input (both draft and hidden validation see it; retrieval stays text-only) | `reviewer_messages.image_path`, `reviewer-images` bucket, `harry-actions.ts`'s `sendMessage()` |
| Shareable, read-only, text-only answer links | `createShare()`/`revokeShare()`/`getSharedMessage()` in `harry.ts`; `get_shared_reviewer_message` RPC; `app/harry-shared/[token]/page.tsx` |
| Live Vercel deployment | `https://temp-app-weld.vercel.app` — deployed via `vercel --prod` (auto-deploy-on-push is off, see `vercel.json`) |
| e2e coverage: grounded citation, honest refusal, chat management, signed-out lockout | `e2e/harry.spec.ts` |

**Security note carried forward from this sprint's own final review:** the `reviewer_shares`/`get_shared_reviewer_message` design above (migration `0027`) exists specifically because the first version of this feature (migration `0026`) shipped a real anon-enumeration vulnerability, found and fixed the same day it landed. Any future sharing-style feature in this repo should be modeled on the RPC pattern, not the naive policy that preceded it.
