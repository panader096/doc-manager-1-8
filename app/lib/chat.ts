import { createClient } from './supabase/client'
import { createClient as createServerClient } from './supabase/server'
import { createChatCompletion, type ChatMessage as AiChatMessage } from './ai'

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

const MESSAGE_SELECT = 'id, role, content, created_at'
const SYSTEM_PROMPT = 'You are a helpful assistant.'

export async function getMessages(): Promise<ChatMessage[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('chat_messages')
    .select(MESSAGE_SELECT)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function sendMessage(
  content: string,
): Promise<{ userMessage: ChatMessage; assistantMessage: ChatMessage }> {
  'use server'

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const { data: userMessage, error: insertUserError } = await supabase
    .from('chat_messages')
    .insert({ role: 'user', content })
    .select(MESSAGE_SELECT)
    .single()
  if (insertUserError) throw insertUserError

  const { data: history, error: historyError } = await supabase
    .from('chat_messages')
    .select(MESSAGE_SELECT)
    .order('created_at', { ascending: true })
  if (historyError) throw historyError

  const aiMessages: AiChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...(history as ChatMessage[]).map(m => ({ role: m.role, content: m.content })),
  ]

  const replyContent = await createChatCompletion(aiMessages)

  const { data: assistantMessage, error: insertAssistantError } = await supabase
    .from('chat_messages')
    .insert({ role: 'assistant', content: replyContent })
    .select(MESSAGE_SELECT)
    .single()
  if (insertAssistantError) throw insertAssistantError

  return { userMessage, assistantMessage }
}
