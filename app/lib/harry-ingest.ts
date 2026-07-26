// app/lib/harry-ingest.ts
// Server-only PDF parse/chunk/embed pipeline for Harry. Never import
// from a 'use client' file -- only harry-actions.ts calls this.
import { fileURLToPath } from 'node:url'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { chunkText } from './chunking'
import { createEmbeddings } from './ai'

export const INGEST_MAX_PAGES = 100
export const INGEST_MAX_BYTES = 20 * 1024 * 1024

export class IngestRejectedError extends Error {}

interface ParsedPage {
  page: number
  text: string
}

// Point pdfjs at its bundled standard font metrics so it doesn't warn
// ("Ensure that the `standardFontDataUrl` API parameter is provided.")
// when a page uses a standard (non-embedded) font -- see Task 2's
// scripts/pdf-parse-demo.mjs. Resolved lazily (not at module load) and
// wrapped in try/catch: import.meta.resolve into node_modules proved out
// under a plain Node script, but this module is bundled by Next.js's
// webpack/Turbopack for a Server Action, where that resolution may behave
// differently. The warning this silences is purely cosmetic -- extraction
// already works without it -- so any failure here must never break
// ingestion, just fall back to leaving pdfjs to log its warning.
function resolveStandardFontDataUrl(): string | undefined {
  try {
    return fileURLToPath(new URL('./standard_fonts/', import.meta.resolve('pdfjs-dist/package.json')))
      .replace(/\\/g, '/')
      .replace(/\/?$/, '/')
  } catch {
    return undefined
  }
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
