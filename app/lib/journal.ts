import { createClient } from './supabase/client'

export type JournalEntry = {
  id: number
  entry_date: string
  title: string | null
  body: string | null
  image_path: string | null
  created_at: string
  updated_at: string
}

const ENTRY_SELECT = 'id, entry_date, title, body, image_path, created_at, updated_at'

export async function getEntries(): Promise<JournalEntry[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('journal_entries')
    .select(ENTRY_SELECT)
    .order('entry_date', { ascending: false })
  if (error) throw error
  return data
}

export async function getEntry(id: string): Promise<JournalEntry | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('journal_entries')
    .select(ENTRY_SELECT)
    .eq('id', id)
    .single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return data
}

export async function getEntryByDate(entryDate: string): Promise<JournalEntry | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('journal_entries')
    .select(ENTRY_SELECT)
    .eq('entry_date', entryDate)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function searchEntries(query: string): Promise<Set<number>> {
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
    .from('journal_entries')
    .select('id')
    .textSearch('search_vector', tsquery)
  if (error) throw error
  return new Set(data.map(row => row.id))
}

function todayLocalDate(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export async function getOrCreateTodayEntry(): Promise<JournalEntry> {
  const entryDate = todayLocalDate()
  const existing = await getEntryByDate(entryDate)
  if (existing) return existing

  const supabase = createClient()
  const { data, error } = await supabase
    .from('journal_entries')
    .insert({ entry_date: entryDate, title: '', body: '' })
    .select(ENTRY_SELECT)
    .single()
  if (error) {
    if (error.code === '23505') {
      const raced = await getEntryByDate(entryDate)
      if (raced) return raced
    }
    throw error
  }
  return data
}

export async function updateEntry(
  id: string,
  changes: { title?: string; body?: string },
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('journal_entries')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteEntry(id: number): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('journal_entries').delete().eq('id', id)
  if (error) throw error
}

const JOURNAL_IMAGES_BUCKET = 'journal-images'

export async function getEntryImageUrl(imagePath: string): Promise<string | null> {
  const supabase = createClient()
  const { data, error } = await supabase.storage.from(JOURNAL_IMAGES_BUCKET).createSignedUrl(imagePath, 3600)
  if (error) return null
  return data.signedUrl
}

export async function uploadEntryImage(entryId: string, file: File): Promise<string | null> {
  const supabase = createClient()

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  const userId = userData.user.id

  const { data: existing, error: fetchError } = await supabase
    .from('journal_entries')
    .select('image_path')
    .eq('id', entryId)
    .single()
  if (fetchError) throw fetchError

  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'png'
  const path = `${userId}/${entryId}/image.${ext}`

  if (existing.image_path && existing.image_path !== path) {
    await supabase.storage.from(JOURNAL_IMAGES_BUCKET).remove([existing.image_path])
  }

  const { error: uploadError } = await supabase.storage
    .from(JOURNAL_IMAGES_BUCKET)
    .upload(path, file, { upsert: true })
  if (uploadError) throw uploadError

  const { error: updateError } = await supabase.from('journal_entries').update({ image_path: path }).eq('id', entryId)
  if (updateError) throw updateError

  return getEntryImageUrl(path)
}

export async function removeEntryImage(entryId: string, imagePath: string): Promise<void> {
  const supabase = createClient()
  const { error: removeError } = await supabase.storage.from(JOURNAL_IMAGES_BUCKET).remove([imagePath])
  if (removeError) throw removeError

  const { error: updateError } = await supabase.from('journal_entries').update({ image_path: null }).eq('id', entryId)
  if (updateError) throw updateError
}
