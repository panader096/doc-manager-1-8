const DEFAULT_CHUNK_SIZE = 500
const DEFAULT_OVERLAP = 100

export function chunkText(
  text: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
  overlap: number = DEFAULT_OVERLAP,
): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  const chunks: string[] = []
  const step = chunkSize - overlap
  for (let start = 0; start < trimmed.length; start += step) {
    const chunk = trimmed.slice(start, start + chunkSize).trim()
    if (chunk) chunks.push(chunk)
    if (start + chunkSize >= trimmed.length) break
  }
  return chunks
}
