import { createClient } from './supabase/client'

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  created_at: string
  model: string | null
  total_tokens: number | null
  image_path: string | null
}

const MESSAGE_SELECT = 'id, role, content, created_at, model, total_tokens, image_path'

const CHAT_IMAGES_BUCKET = 'chat-images'

export async function getMessages(): Promise<ChatMessage[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('chat_messages')
    .select(MESSAGE_SELECT)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

// Signed URL for a chat message's attached image (private chat-images
// bucket, same pattern as note-images/journal-images) -- returns null on
// any error instead of throwing, so a broken/expired image never blocks
// rendering the rest of the message.
export async function getChatImageUrl(imagePath: string): Promise<string | null> {
  const supabase = createClient()
  const { data, error } = await supabase.storage.from(CHAT_IMAGES_BUCKET).createSignedUrl(imagePath, 3600)
  if (error) return null
  return data.signedUrl
}
