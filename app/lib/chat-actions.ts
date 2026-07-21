'use server'

import { createClient } from './supabase/server'
import { createChatCompletion, type ChatMessage as AiChatMessage } from './ai'
import type { ChatMessage } from './chat'

const MESSAGE_SELECT = 'id, role, content, created_at'
const SYSTEM_PROMPT = 'You are a helpful assistant.'

export async function sendMessage(
  content: string,
): Promise<{ userMessage: ChatMessage; assistantMessage: ChatMessage }> {
  const trimmedContent = content.trim()
  if (!trimmedContent) throw new Error('Message cannot be empty')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const { data: userMessage, error: insertUserError } = await supabase
    .from('chat_messages')
    .insert({ role: 'user', content: trimmedContent })
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
