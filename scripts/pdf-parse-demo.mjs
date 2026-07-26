// scripts/pdf-parse-demo.mjs
// Standalone proof that pdfjs-dist extracts per-page text correctly in
// this Node environment, before harry-ingest.ts is built on top of it.
// Run with: node scripts/pdf-parse-demo.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

// Point pdfjs at its bundled standard font metrics so it doesn't warn
// ("Ensure that the `standardFontDataUrl` API parameter is provided.")
// when a page uses a standard (non-embedded) font like Helvetica, as
// this fixture does. pdfjs requires this to end with "/" (forward
// slash specifically, even on Windows) or it throws, so normalize
// separators after converting the resolved package URL to a path.
const standardFontDataUrl = fileURLToPath(
  new URL('./standard_fonts/', import.meta.resolve('pdfjs-dist/package.json'))
).replace(/\\/g, '/').replace(/\/?$/, '/')

const data = new Uint8Array(readFileSync('e2e/fixtures/test-document.pdf'))
const doc = await getDocument({ data, standardFontDataUrl }).promise

console.log(`Pages: ${doc.numPages}`)
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i)
  const content = await page.getTextContent()
  const text = content.items.map(item => ('str' in item ? item.str : '')).join(' ').trim()
  console.log(`--- page ${i} ---`)
  console.log(text)
}
