// scripts/generate-test-pdf.mjs
// Generates a minimal, valid, tiny 2-page PDF fixture for e2e tests --
// hand-built PDF syntax, no PDF library needed. Byte offsets for the
// xref table are computed here rather than hardcoded.
import { writeFileSync, mkdirSync } from 'node:fs'

function pdfObject(id, body) {
  return `${id} 0 obj\n${body}\nendobj\n`
}

function streamObject(id, text) {
  const content = `BT /F1 18 Tf 72 700 Td (${text}) Tj ET`
  return `${id} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`
}

const objects = [
  pdfObject(1, '<< /Type /Catalog /Pages 2 0 R >>'),
  pdfObject(2, '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>'),
  pdfObject(3, '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 6 0 R >>'),
  pdfObject(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
  pdfObject(5, '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 7 0 R >>'),
  streamObject(6, 'PAGE-ONE-MARKER: The refund window is 30 days.'),
  streamObject(7, 'PAGE-TWO-MARKER: Contact support at support@example.com.'),
]

let body = '%PDF-1.4\n'
const offsets = [0]
for (const obj of objects) {
  offsets.push(body.length)
  body += obj
}

const xrefStart = body.length
let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
for (let i = 1; i <= objects.length; i++) {
  xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
}

const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`

mkdirSync('e2e/fixtures', { recursive: true })
writeFileSync('e2e/fixtures/test-document.pdf', body + xref + trailer)
console.log('Wrote e2e/fixtures/test-document.pdf')
