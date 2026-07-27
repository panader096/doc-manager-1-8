'use server'

import { createClient } from './supabase/server'
import { createChatCompletion, type ChatMessage as AiChatMessage } from './ai'
import { searchNoteChunks } from './embeddings-actions'
import { SYSTEM_PROMPT, SEARCH_NOTES_TOOL, MAX_TOOL_ROUNDS } from './chat-shared'
import type { ChatMessage } from './chat'

const MESSAGE_SELECT = 'id, role, content, created_at, model, total_tokens'

type ServerSupabase = Awaited<ReturnType<typeof createClient>>

export async function runSearchNotesTool(supabase: ServerSupabase, query: string): Promise<string> {
  const chunks = await searchNoteChunks(query)
  if (chunks.length === 0) return "No matching chunks were found in the user's notes for this query."

  const noteIds = [...new Set(chunks.map(c => c.note_id))]
  const { data: notes, error } = await supabase.from('notes').select('id, title').in('id', noteIds)
  if (error) throw error
  const titleById = new Map(notes.map(n => [n.id, n.title || 'Untitled']))

  return chunks
    .map(
      (c, i) =>
        `${i + 1}. Note "${titleById.get(c.note_id) ?? 'Untitled'}" (similarity ${c.similarity.toFixed(2)}): ${c.content}`,
    )
    .join('\n')
}

export async function sendMessage(
  content: string,
): Promise<{ userMessage: ChatMessage; assistantMessage: ChatMessage }> {
  const trimmedContent = content.trim()
  if (!trimmedContent) throw new Error('Message cannot be empty')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const { data: settings } = await supabase.from('user_settings').select('chat_model').eq('user_id', user.id).maybeSingle()
  const model = settings?.chat_model

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

  // Only the stored chat_messages rows (user/assistant turns) feed this --
  // the same full-history replay as before. Tool calls and their results are
  // appended below for this turn's model round-trips only; they're never
  // persisted, so in-conversation memory behavior is unchanged.
  const conversation: AiChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...(history as ChatMessage[]).map(m => ({ role: m.role, content: m.content }) as AiChatMessage),
  ]

  let finalContent: string | null = null
  let finalModel: string | null = null
  let finalTotalTokens: number | null = null
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const isLastRound = round === MAX_TOOL_ROUNDS - 1
    const assistantTurn = await createChatCompletion(
      conversation,
      isLastRound ? { model } : { model, tools: [SEARCH_NOTES_TOOL] },
    )

    if (assistantTurn.tool_calls && assistantTurn.tool_calls.length > 0) {
      conversation.push({
        role: 'assistant',
        content: assistantTurn.content,
        tool_calls: assistantTurn.tool_calls,
      })
      for (const toolCall of assistantTurn.tool_calls) {
        const { query } = JSON.parse(toolCall.function.arguments) as { query: string }
        const resultText = await runSearchNotesTool(supabase, query)
        conversation.push({ role: 'tool', tool_call_id: toolCall.id, content: resultText })
      }
      continue
    }

    finalContent = assistantTurn.content
    finalModel = assistantTurn.model
    finalTotalTokens = assistantTurn.usage?.totalTokens ?? null
    break
  }

  const replyContent = finalContent ?? "I wasn't able to come up with an answer -- could you rephrase your question?"

  const { data: assistantMessage, error: insertAssistantError } = await supabase
    .from('chat_messages')
    .insert({ role: 'assistant', content: replyContent, model: finalModel, total_tokens: finalTotalTokens })
    .select(MESSAGE_SELECT)
    .single()
  if (insertAssistantError) throw insertAssistantError

  return { userMessage, assistantMessage }
}
