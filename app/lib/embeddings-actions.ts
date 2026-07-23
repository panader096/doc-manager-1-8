'use server'

import { createClient } from './supabase/server'
import { createEmbeddings } from './ai'
import { chunkText } from './chunking'

// Re-chunks and re-embeds one note's current title+body, replacing its
// existing `documents` rows outright -- called after every note save so a
// stale chunk from a previous version of the note never lingers.
export async function reembedNoteAction(noteId: number): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const { data: note, error: noteError } = await supabase
    .from('notes')
    .select('title, body')
    .eq('id', noteId)
    .single()
  if (noteError) throw noteError

  const { error: deleteError } = await supabase.from('documents').delete().eq('note_id', noteId)
  if (deleteError) throw deleteError

  const chunks = chunkText(`${note.title}\n\n${note.body}`)
  if (chunks.length === 0) return

  const embeddings = await createEmbeddings(chunks)

  const { error: insertError } = await supabase
    .from('documents')
    .insert(chunks.map((content, i) => ({ note_id: noteId, content, embedding: embeddings[i] })))
  if (insertError) throw insertError
}

export interface NoteChunkMatch {
  note_id: number
  content: string
  similarity: number
}

const MATCH_COUNT = 5
// Cosine similarity floor for text-embedding-3-small -- a starting default,
// not empirically tuned; revisit if retrieval feels too strict or too loose
// once tried against real notes.
const MATCH_THRESHOLD = 0.3

// Embeds `query` and returns the current user's most relevant note chunks,
// for use as chat context. Scoped to the signed-in user two ways: RLS on
// `documents` (the query runs as this user, via the server client) and the
// explicit p_user_id passed into match_documents -- so another user's
// chunks can never appear even if one of those checks were ever removed.
export async function searchNoteChunks(query: string): Promise<NoteChunkMatch[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const [queryEmbedding] = await createEmbeddings([query])

  const { data, error } = await supabase.rpc('match_documents', {
    query_embedding: queryEmbedding,
    match_threshold: MATCH_THRESHOLD,
    match_count: MATCH_COUNT,
    p_user_id: user.id,
  })
  if (error) throw error
  return data as NoteChunkMatch[]
}
