import { createClient } from './supabase/client'

export type NoteListItem = {
  id: number
  title: string
  updated_at: string
}

export type Note = {
  id: number
  title: string
  body: string
  created_at: string
  updated_at: string
  collection_id: number | null
}

export async function getNotes(): Promise<NoteListItem[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('notes')
    .select('id, title, updated_at')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getNote(id: string): Promise<Note | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('id', id)
    .single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return data
}

export async function createNote(): Promise<NoteListItem> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('notes')
    .insert({ title: '', body: '', updated_at: new Date().toISOString() })
    .select('id, title, updated_at')
    .single()
  if (error) throw error
  return data
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
