import { createClient } from './supabase/client'

const PROFILE_PHOTOS_BUCKET = 'profile-photos'

// Derived from the validated MIME type, never from the client-controlled
// File.name -- a crafted filename (e.g. containing '/') could otherwise
// produce a storage key with extra path segments under the user's own
// folder, breaking the "at most one file per user" assumption list()
// relies on elsewhere in this module.
const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

async function requireUserId(): Promise<string> {
  const supabase = createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!data.user) throw new Error('Not signed in')
  return data.user.id
}

export async function getProfilePhotoUrl(): Promise<string | null> {
  const userId = await requireUserId()
  const supabase = createClient()

  const { data: files, error: listError } = await supabase.storage.from(PROFILE_PHOTOS_BUCKET).list(userId)
  if (listError || !files || files.length === 0) return null

  const { data, error } = await supabase.storage
    .from(PROFILE_PHOTOS_BUCKET)
    .createSignedUrl(`${userId}/${files[0].name}`, 3600)
  if (error) return null
  return data.signedUrl
}

export async function uploadProfilePhoto(file: File): Promise<string | null> {
  const userId = await requireUserId()
  const supabase = createClient()

  const { data: existing, error: listError } = await supabase.storage.from(PROFILE_PHOTOS_BUCKET).list(userId)
  if (listError) throw listError
  if (existing && existing.length > 0) {
    const { error: removeError } = await supabase.storage
      .from(PROFILE_PHOTOS_BUCKET)
      .remove(existing.map(f => `${userId}/${f.name}`))
    if (removeError) throw removeError
  }

  const ext = EXTENSION_BY_MIME_TYPE[file.type] ?? 'png'
  const { error: uploadError } = await supabase.storage
    .from(PROFILE_PHOTOS_BUCKET)
    .upload(`${userId}/photo.${ext}`, file, { upsert: true })
  if (uploadError) throw uploadError

  return getProfilePhotoUrl()
}

export async function removeProfilePhoto(): Promise<void> {
  const userId = await requireUserId()
  const supabase = createClient()

  const { data: files, error: listError } = await supabase.storage.from(PROFILE_PHOTOS_BUCKET).list(userId)
  if (listError) throw listError
  if (!files || files.length === 0) return

  const { error: removeError } = await supabase.storage
    .from(PROFILE_PHOTOS_BUCKET)
    .remove(files.map(f => `${userId}/${f.name}`))
  if (removeError) throw removeError
}
