import { createClient } from './supabase/client'

export type Tag = {
  id: number
  name: string
}

export type Collection = {
  id: number
  name: string
  created_at: string
}

export type NoteListItem = {
  id: number
  title: string
  body: string
  updated_at: string
  collection_id: number | null
  tags: string[]
}

export type Note = {
  id: number
  title: string
  body: string
  created_at: string
  updated_at: string
  collection_id: number | null
  tags: string[]
}

type NoteTagsRow = { tags: { name: string }[] | { name: string } | null }
type NoteRow = {
  id: number
  title: string
  body: string
  created_at?: string
  updated_at: string
  collection_id: number | null
  note_tags: NoteTagsRow[]
}

function flattenTags(row: NoteRow): string[] {
  return row.note_tags.flatMap(nt => {
    const tags = nt.tags
    if (!tags) return []
    return Array.isArray(tags) ? tags.map(t => t.name) : [tags.name]
  })
}

const NOTE_LIST_SELECT = 'id, title, body, updated_at, collection_id, note_tags(tags(name))'
const NOTE_SELECT = 'id, title, body, created_at, updated_at, collection_id, note_tags(tags(name))'

export async function getNotes(): Promise<NoteListItem[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('notes')
    .select(NOTE_LIST_SELECT)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data as NoteRow[]).map(row => ({
    id: row.id,
    title: row.title,
    body: row.body,
    updated_at: row.updated_at,
    collection_id: row.collection_id,
    tags: flattenTags(row),
  }))
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
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    created_at: row.created_at!,
    updated_at: row.updated_at,
    collection_id: row.collection_id,
    tags: flattenTags(row),
  }
}

export async function createNote(): Promise<NoteListItem> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('notes')
    .insert({ title: '', body: '', updated_at: new Date().toISOString() })
    .select('id, title, body, updated_at, collection_id')
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

export async function getCollections(): Promise<Collection[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('collections')
    .select('id, name, created_at')
    .order('name', { ascending: true })
  if (error) throw error
  return data
}

export async function createCollection(name: string): Promise<Collection> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('collections')
    .insert({ name })
    .select('id, name, created_at')
    .single()
  if (error) throw error
  return data
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
    .insert({ name })
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
