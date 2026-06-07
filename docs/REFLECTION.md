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

---

# UI Design Decision — Sprint 1.8.9

## Selected Design: Option C — "Apple Pro"

Implemented on branch `1.8.9-ui-design`.

### Rationale for selection

Three design directions were considered, all Apple-inspired. Option C was selected because:

1. **Excellent dark theme** — the Xcode/Final Cut Pro colour palette (`#1E1E1E` background, `#252525` sidebar) is purpose-built for long writing sessions with minimal eye strain. The dark theme was broken in previous branches; Option C's CSS variable strategy fixed it definitively.
2. **Low implementation effort** — Option C uses CSS custom properties as the single source of truth for all colour tokens. No per-component `dark:` Tailwind classes are needed. When `.dark` is added to `<html>`, every element updates automatically via variable cascade.
3. **Personal preference** — the dense, professional aesthetic of Apple's pro applications (Xcode, Final Cut Pro, Logic Pro) matches the user's taste.

### Design tokens

| Token | Light | Dark |
|---|---|---|
| App background | `#FFFFFF` | `#1E1E1E` |
| Sidebar | `#F2F2F2` | `#252525` |
| Active item | `#E3E3E3` | `#2E2E2E` |
| Hover | `#EBEBEB` | `#2A2A2A` |
| Modal / Input | `#FFFFFF` | `#2C2C2C` |
| Border | `#D1D1D6` | `#3A3A3A` |
| Focus border | `#007AFF` | `#0A84FF` |
| Text primary | `#1D1D1F` | `#E8E8ED` |
| Text secondary | `#6C6C70` | `#8E8E93` |
| Text muted | `#AEAEB2` | `#636366` |
| Accent | `#007AFF` | `#0A84FF` |
| Active left bar | `#007AFF` | `#0A84FF` |
| Tag background | `#F0F0F0` | `#2C2C2C` |
| Tag text | `#3A3A3C` | `#8E8E93` |
| Tag border | `#C7C7CC` | `#3D3D3D` |

### Typography

- **Body font**: `-apple-system, BlinkMacSystemFont, "SF Pro Text", ui-sans-serif, system-ui, sans-serif` — uses the native system font on every platform; renders as SF Pro on macOS/iOS, Segoe UI on Windows, Roboto on Android.
- **Monospace** (timestamps, tags, word count, document body): system mono stack; `"SF Mono"` on Apple, falling back to `Menlo`, `Monaco`, `Consolas`.
- **Scale**: sidebar items 12–13 px; section headers 11 px all-caps with letter-spacing; document title 22 px / weight 700; toolbar hints 12 px.
- No external font packages. Geist (previously imported from Google Fonts) was removed in favour of the system stack.

### Spacing and density

- Sidebar items: approximately 28 px tall (`py-[7px]` + content height)
- Horizontal padding: `px-2.5` (10 px) on list items
- Section headers: `px-2.5 py-1.5`
- Content area: `px-8 py-8` (32 px), `max-w-[800px]`
- Minimal whitespace between elements — consistent with professional app aesthetics rather than marketing-page spaciousness

### Component shape

- Border radius: `4px` on all interactive elements (inputs, buttons, tag pills, list items)
- Modals: `8px` radius
- Command palette card: `6px` radius
- Buttons: text-only with hover tint; no heavy borders or fills except primary action (accent-coloured "New document" button)
- Active sidebar item: 2 px left border in accent colour + subtle `bg-active` fill

### Dark mode implementation

The root cause of the broken dark mode in previous branches: `body { background: var(--background) }` in `globals.css` is an unlayered CSS rule. In the CSS cascade, unlayered rules always beat `@layer utilities` (where Tailwind classes live), so `dark:bg-gray-950` on `<body>` was always overridden.

**Fix**: replaced all per-component `dark:` class pairs with a single set of CSS custom properties. `:root` defines the light values; `.dark` overrides them. Components reference `var(--bg-sidebar)` etc. directly via inline `style={{ }}`. When the theme toggle sets `.dark` on `<html>`, every CSS variable updates instantly — no Tailwind dark variant needed.

The `suppressHydrationWarning` attribute on `<html>` and the `next/script` FOUC-prevention script (strategy `beforeInteractive`) remain in place to avoid a flash of light theme on page load when the user has selected dark mode.
