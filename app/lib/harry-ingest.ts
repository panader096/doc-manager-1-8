// app/lib/harry-ingest.ts
// Server-only PDF parse/chunk/embed pipeline for Harry. Never import
// from a 'use client' file -- only harry-actions.ts calls this.
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { chunkText } from './chunking'
import { createEmbeddings } from './ai'

export const INGEST_MAX_PAGES = 100
export const INGEST_MAX_BYTES = 20 * 1024 * 1024

export class IngestRejectedError extends Error {}

interface ParsedPage {
  page: number
  text: string
}

// import.meta.resolve is not available in this module's runtime context
// once Next.js's Turbopack bundles it for a Server Action (confirmed via
// manual testing: it throws "{import.meta}.resolve is not a function" at
// module evaluation, not just behaving differently) -- so path resolution
// here must not depend on it. `process.cwd()` is reliably the project root
// under both `next dev` and `next start`, so build absolute paths into
// pdfjs-dist's own package directory from there instead.
const PDFJS_DIST_DIR = path.join(process.cwd(), 'node_modules', 'pdfjs-dist')

// pdfjs-dist has no real Worker in Node, so it always falls back to a
// "fake worker" that dynamically imports its own worker script via a
// plain `import(workerSrc)` call. In Node it defaults workerSrc to the
// bare relative string "./pdf.worker.mjs", which resolves fine when this
// module runs unbundled (proven by Task 2's standalone script) but breaks
// once Turbopack/webpack bundles this module into a chunk at a different
// virtual path -- the relative import then points at a file that doesn't
// exist there. Set an absolute path once at module load so the dynamic
// import always finds the real file regardless of bundler output layout.
// Must be a `file://` URL, not a raw filesystem path: confirmed via manual
// testing that Node's dynamic import() on Windows rejects a bare `C:\...`
// path with "absolute paths must be valid file:// URLs".
GlobalWorkerOptions.workerSrc = pathToFileURL(
  path.join(PDFJS_DIST_DIR, 'legacy', 'build', 'pdf.worker.mjs'),
).href

// Point pdfjs at its bundled standard font metrics so it doesn't warn
// ("Ensure that the `standardFontDataUrl` API parameter is provided.")
// when a page uses a standard (non-embedded) font -- see Task 2's
// scripts/pdf-parse-demo.mjs. pdfjs requires this to end with "/" (forward
// slash specifically, even on Windows). Unlike workerSrc above, this is
// deliberately NOT wrapped in pathToFileURL: pdfjs reads this path via
// fs.readFile internally, not import(), so a plain path is correct here --
// don't "fix" this to match workerSrc, that would break font loading.
function resolveStandardFontDataUrl(): string {
  return path.join(PDFJS_DIST_DIR, 'standard_fonts').replace(/\\/g, '/').replace(/\/?$/, '/')
}

async function parsePdfPages(buffer: ArrayBuffer): Promise<ParsedPage[]> {
  const standardFontDataUrl = resolveStandardFontDataUrl()
  const doc = await getDocument({ data: new Uint8Array(buffer), standardFontDataUrl }).promise
  if (doc.numPages > INGEST_MAX_PAGES) {
    throw new IngestRejectedError(`This PDF has ${doc.numPages} pages — the limit is ${INGEST_MAX_PAGES}.`)
  }

  const pages: ParsedPage[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const text = content.items.map(item => ('str' in item ? item.str : '')).join(' ').trim()
    pages.push({ page: i, text })
  }
  return pages
}

export interface IngestChunk {
  page: number
  content: string
  embedding: number[]
}

export async function ingestDocument(buffer: ArrayBuffer): Promise<{ chunks: IngestChunk[] }> {
  const pages = await parsePdfPages(buffer)

  const pageChunks: { page: number; content: string }[] = []
  for (const p of pages) {
    for (const content of chunkText(p.text)) {
      pageChunks.push({ page: p.page, content })
    }
  }

  if (pageChunks.length === 0) {
    throw new IngestRejectedError(
      'No text could be extracted from this PDF — scanned or image-only PDFs are not supported.',
    )
  }

  const embeddings = await createEmbeddings(pageChunks.map(c => c.content))
  return { chunks: pageChunks.map((c, i) => ({ page: c.page, content: c.content, embedding: embeddings[i] })) }
}
