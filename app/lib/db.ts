import { createClient } from './supabase/client'

export type Tag = {
  id: number
  name: string
  color: string
}

export type NoteTag = {
  name: string
  color: string
}

export type Collection = {
  id: number
  name: string
  created_at: string
  share_token: string | null
  position: number
}

export type NoteListItem = {
  id: number
  title: string
  body: string
  updated_at: string
  collection_id: number | null
  pinned: boolean
  archived_at: string | null
  tags: NoteTag[]
}

export type Note = {
  id: number
  title: string
  body: string
  created_at: string
  updated_at: string
  collection_id: number | null
  pinned: boolean
  archived_at: string | null
  tags: NoteTag[]
}

const TAG_PALETTE = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#0ea5e9', '#8b5cf6', '#ec4899', '#64748b']

function colorForTagName(name: string): string {
  let hash = 0
  for (const char of name.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return TAG_PALETTE[hash % TAG_PALETTE.length]
}

type NoteTagsRow = { tags: NoteTag[] | NoteTag | null }
type NoteRow = {
  id: number
  title: string
  body: string
  created_at?: string
  updated_at: string
  collection_id: number | null
  pinned: boolean
  archived_at: string | null
  note_tags: NoteTagsRow[]
}

function flattenTags(row: NoteRow): NoteTag[] {
  return row.note_tags.flatMap(nt => {
    const tags = nt.tags
    if (!tags) return []
    return Array.isArray(tags) ? tags : [tags]
  })
}

const NOTE_LIST_SELECT = 'id, title, body, updated_at, collection_id, pinned, archived_at, note_tags(tags(name, color))'
const NOTE_SELECT = 'id, title, body, created_at, updated_at, collection_id, pinned, archived_at, note_tags(tags(name, color))'

function mapNoteRow(row: NoteRow): NoteListItem {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    updated_at: row.updated_at,
    collection_id: row.collection_id,
    pinned: row.pinned,
    archived_at: row.archived_at,
    tags: flattenTags(row),
  }
}

export async function getNotes(): Promise<NoteListItem[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('notes')
    .select(NOTE_LIST_SELECT)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data as NoteRow[]).map(mapNoteRow)
}

export async function getNote(id: string): Promise<Note | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('notes')
    .select(NOTE_SELECT)
    .eq('id', id)
    .single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  const row = data as NoteRow
  return { ...mapNoteRow(row), created_at: row.created_at! }
}

export async function searchNotes(query: string): Promise<Set<number>> {
  const tsquery = query
    .trim()
    .split(/\s+/)
    .map(word => word.replace(/[^a-zA-Z0-9]/g, ''))
    .filter(Boolean)
    .map(word => `${word}:*`)
    .join(' & ')
  if (!tsquery) return new Set()

  const supabase = createClient()
  const { data, error } = await supabase
    .from('notes')
    .select('id')
    .textSearch('search_vector', tsquery)
  if (error) throw error
  return new Set(data.map(row => row.id))
}

export async function createNote(): Promise<NoteListItem> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('notes')
    .insert({ title: '', body: '', updated_at: new Date().toISOString() })
    .select('id, title, body, updated_at, collection_id, pinned, archived_at')
    .single()
  if (error) throw error
  return { ...data, tags: [] }
}

export async function updateNote(
  id: string,
  changes: { title?: string; body?: string },
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('notes')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteNote(id: number): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('notes').delete().eq('id', id)
  if (error) throw error
}

export async function setNoteCollection(id: string, collectionId: number | null): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('notes')
    .update({ collection_id: collectionId, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function setNotePinned(id: number, pinned: boolean): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('notes').update({ pinned }).eq('id', id)
  if (error) throw error
}

export async function archiveNote(id: number): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('notes')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function unarchiveNote(id: number): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('notes').update({ archived_at: null }).eq('id', id)
  if (error) throw error
}

const COLLECTION_SELECT = 'id, name, created_at, share_token, position'

export async function getCollections(): Promise<Collection[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('collections')
    .select(COLLECTION_SELECT)
    .order('position', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return data
}

export async function createCollection(name: string, position: number): Promise<Collection> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('collections')
    .insert({ name, position })
    .select(COLLECTION_SELECT)
    .single()
  if (error) throw error
  return data
}

export async function renameCollection(id: number, name: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('collections').update({ name }).eq('id', id)
  if (error) throw error
}

export async function reorderCollections(orderedIds: number[]): Promise<void> {
  const supabase = createClient()
  const results = await Promise.all(
    orderedIds.map((id, index) => supabase.from('collections').update({ position: index }).eq('id', id)),
  )
  const failed = results.find(r => r.error)
  if (failed?.error) throw failed.error
}

export async function generateShareLink(collectionId: number): Promise<string> {
  const token = crypto.randomUUID()
  const supabase = createClient()
  const { error } = await supabase.from('collections').update({ share_token: token }).eq('id', collectionId)
  if (error) throw error
  return token
}

export async function revokeShareLink(collectionId: number): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('collections').update({ share_token: null }).eq('id', collectionId)
  if (error) throw error
}

export async function getSharedCollection(
  token: string,
): Promise<{ collection: Collection; notes: NoteListItem[] } | null> {
  const supabase = createClient()
  const { data: collection, error: collectionError } = await supabase
    .from('collections')
    .select(COLLECTION_SELECT)
    .eq('share_token', token)
    .maybeSingle()
  if (collectionError) throw collectionError
  if (!collection) return null

  const { data, error: notesError } = await supabase
    .from('notes')
    .select(NOTE_LIST_SELECT)
    .eq('collection_id', collection.id)
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
  if (notesError) throw notesError

  return { collection, notes: (data as NoteRow[]).map(mapNoteRow) }
}

async function getOrCreateTagId(name: string): Promise<number> {
  const supabase = createClient()
  const { data: existing, error: lookupError } = await supabase
    .from('tags')
    .select('id')
    .ilike('name', name)
    .limit(1)
    .maybeSingle()
  if (lookupError) throw lookupError
  if (existing) return existing.id

  const { data: created, error: insertError } = await supabase
    .from('tags')
    .insert({ name, color: colorForTagName(name) })
    .select('id')
    .single()
  if (insertError) throw insertError
  return created.id
}

export async function setNoteTags(id: string, tagNames: string[]): Promise<void> {
  const supabase = createClient()

  const { error: deleteError } = await supabase.from('note_tags').delete().eq('note_id', id)
  if (deleteError) throw deleteError

  const trimmed = [...new Set(tagNames.map(t => t.trim()).filter(Boolean))]
  if (trimmed.length === 0) return

  const tagIds = await Promise.all(trimmed.map(getOrCreateTagId))

  const { error: insertError } = await supabase
    .from('note_tags')
    .insert(tagIds.map(tagId => ({ note_id: Number(id), tag_id: tagId })))
  if (insertError) throw insertError
}

export async function getSearchHistory(): Promise<string[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('search_history')
    .select('query')
    .order('searched_at', { ascending: false })
    .limit(5)
  if (error) throw error
  return data.map(row => row.query)
}

export async function recordSearch(query: string): Promise<void> {
  const trimmed = query.trim()
  if (!trimmed) return

  const supabase = createClient()
  const { error: upsertError } = await supabase
    .from('search_history')
    .upsert({ query: trimmed, searched_at: new Date().toISOString() }, { onConflict: 'query' })
  if (upsertError) throw upsertError

  const { data, error: listError } = await supabase
    .from('search_history')
    .select('id')
    .order('searched_at', { ascending: false })
  if (listError) throw listError

  const staleIds = data.slice(5).map(row => row.id)
  if (staleIds.length > 0) {
    const { error: deleteError } = await supabase.from('search_history').delete().in('id', staleIds)
    if (deleteError) throw deleteError
  }
}
