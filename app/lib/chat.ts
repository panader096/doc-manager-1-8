import { createClient } from './supabase/client'

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  created_at: string
  model: string | null
  total_tokens: number | null
}

const MESSAGE_SELECT = 'id, role, content, created_at, model, total_tokens'

export async function getMessages(): Promise<ChatMessage[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('chat_messages')
    .select(MESSAGE_SELECT)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}
