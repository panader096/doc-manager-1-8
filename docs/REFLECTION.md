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

## docs/ folder: keep or change

Keep: starting each feature with a round of clarifying questions before building. This scoped the output, reduced re-dos, and produced more predictable results. Also keep: a separate named branch per feature step with descriptive naming — the version history made comparison and rollback straightforward.

Change next time: document the clarifying-questions exchange itself, not just the outcome. A log of what was asked and how ambiguities were resolved would be more instructive than a reference document the model can retrieve on its own.
