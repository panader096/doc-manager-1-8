# ai-code-reviewer findings — PR #9 (Sprint 3.8 Harry doc reviewer)

Run via the `ai-code-reviewer` persona (`.claude/agents/ai-code-reviewer.md`) against the full PR diff (`git diff main...v3.8.1_build`, 21 commits, ~3,378 insertions), reviewing for dead code, duplication, over-engineering, and silent behaviour changes. No Critical findings.

## Warning

- **`app/lib/harry-actions.ts` `sendMessage()` — orphaned user message on LLM failure.** The user's message is inserted into `reviewer_messages` before either OpenRouter call (draft, then hidden validation). If either call throws, `HarryChatView.tsx`'s catch block only removes the *optimistic* client-side message — the DB row stays, unanswered. Next load shows a lone unanswered message; retrying duplicates it. Predates Harry (same ordering in `/chat`'s `chat-actions.ts`), but Harry's two sequential calls roughly double the exposure window.
- **`app/lib/harry-ingest.ts` — pdfjs-dist worker/font paths built at runtime via `path.join(process.cwd(), ...)`, not statically imported.** Next.js/Vercel's file-tracing walks statically-analyzable import graphs; dynamically-built path strings are a known way to get silently excluded from a traced serverless bundle. Extensively verified against local `next dev`/`next build`, but never against an actual Vercel deployment. (Matches what the Vercel security scanner flagged independently during Task 10.)
- **`app/components/HarrySidebar.tsx` `fetchChats()` — no error handling.** Only a `finally`, no `catch`. A failed `getChats()` surfaces as an empty "No chats yet" list rather than a visible error, plus an unhandled promise rejection in the console. `HarryChatView`'s equivalent load does set a visible error on failure — this is an inconsistency within the same PR, not inherited from elsewhere.

## Suggestion

- **`CHAT_SELECT`/`MESSAGE_SELECT` duplicated verbatim** between `harry.ts` and `harry-actions.ts`. Mirrors the same pre-existing duplication in `chat.ts`/`chat-actions.ts` — a repeated convention, not new, but worth a shared constant while the area is being touched.
- **`createChat()`'s rollback logic (delete the just-inserted chat row) is repeated inline** after both the upload-failure and `doc_path`-update-failure branches. A small helper would remove the duplication.
- **Inconsistent ownership-check idiom across the four actions.** `sendMessage()`/`deleteChat()` rely on RLS implicitly (unowned `chat_id` → 0 rows → `.single()` throws); `renameChat()` explicitly checks `data.length === 0` (added in `7a4a57e` specifically because `.update()` silently no-ops on 0 matched rows). Both work, but two idioms for the same guarantee. Separately, `HarrySidebar.tsx`'s `commitRename()`/`confirmDelete()` still don't catch what these actions can throw — so `7a4a57e`'s "error instead of silent no-op" fix is only observable server-side, not to the user. Mirrors an identical gap in `JournalSidebar.tsx`/`NotesSidebar.tsx` — existing convention, not new.
- **Two sequential OpenRouter calls per Harry turn** (draft + hidden validation) roughly doubles per-message latency/cost. This is the feature's core value proposition (grounding + self-check), not unjustified complexity — flagged so the tradeoff is a conscious one, especially combined with the orphaned-message Warning above (no partial-success handling if validation fails after a good draft).

## Not flagged (verified pre-existing/intentional, not introduced by this PR)

- The `openai/gpt-4o-mini` → `anthropic/claude-haiku-4.5` model change visible in the CLAUDE.md diff is not part of this PR's code — `app/lib/ai.ts` has zero diff between `main` and `v3.8.1_build`; the docs commit was just catching up to an already-merged change.
- The confirm-delete modal, sidebar fetch/`finally` pattern, and select-constant duplication all match existing `NotesSidebar.tsx`/`JournalSidebar.tsx`/`chat.ts` conventions exactly — consistency debt across the whole app, not a regression introduced here.

## Disposition

No Critical findings — nothing blocks merge. `fetchChats()`'s missing error handling is the one concretely actionable Warning (cheap, real, contained to this PR); the rest are either pre-existing repo-wide conventions or explicit, already-accepted design tradeoffs (the 2x-latency self-validation pass, the pdfjs-dist deployment-tracing risk already surfaced by the Vercel security scanner in Task 10).
