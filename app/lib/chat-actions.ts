'use server'

import { createClient } from './supabase/server'
import { createChatCompletion, sanitizeModel, type ChatMessage as AiChatMessage } from './ai'
import { searchNoteChunks } from './embeddings-actions'
import { SYSTEM_PROMPT, SEARCH_NOTES_TOOL, MAX_TOOL_ROUNDS } from './chat-shared'
import type { ChatMessage } from './chat'

const MESSAGE_SELECT = 'id, role, content, created_at, model, total_tokens, image_path'

type ServerSupabase = Awaited<ReturnType<typeof createClient>>

// Starting thresholds, not empirically tuned -- gives the model a legible
// word instead of a raw float to reason about "weak, irrelevant, or empty"
// results with, per the existing system prompt instruction.
function similarityBand(similarity: number): 'strong match' | 'moderate match' | 'weak match' {
  if (similarity >= 0.5) return 'strong match'
  if (similarity >= 0.38) return 'moderate match'
  return 'weak match'
}

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
        `${i + 1}. Note "${titleById.get(c.note_id) ?? 'Untitled'}" (${similarityBand(c.similarity)}, similarity ${c.similarity.toFixed(2)}): ${c.content}`,
    )
    .join('\n')
}

export async function sendMessage(
  content: string,
  imageFile?: File,
): Promise<{ userMessage: ChatMessage; assistantMessage: ChatMessage }> {
  const trimmedContent = content.trim()
  if (!trimmedContent) throw new Error('Message cannot be empty')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const { data: settings } = await supabase.from('user_settings').select('chat_model').eq('user_id', user.id).maybeSingle()
  const model = sanitizeModel(settings?.chat_model)

  let imagePath: string | null = null
  let imageSignedUrl: string | null = null
  if (imageFile) {
    const ext = imageFile.name.includes('.') ? imageFile.name.split('.').pop() : 'png'
    const path = `${user.id}/${Date.now()}.${ext}`
    const buffer = await imageFile.arrayBuffer()
    const { error: uploadError } = await supabase.storage
      .from('chat-images')
      .upload(path, buffer, { contentType: imageFile.type })
    if (uploadError) throw uploadError
    imagePath = path

    const { data: signed, error: signError } = await supabase.storage.from('chat-images').createSignedUrl(path, 300)
    if (signError) throw signError
    imageSignedUrl = signed.signedUrl
  }

  // Past images are never re-sent as real image content on later turns --
  // only baked into the stored text as a marker, so history replay stays
  // cheap and simple. Only *this* turn's image (if any) goes to the model
  // as real multimodal content, built separately below.
  const storedContent = imagePath ? `${trimmedContent}\n\n[Attached image: ${imageFile!.name}]` : trimmedContent

  const { data: userMessage, error: insertUserError } = await supabase
    .from('chat_messages')
    .insert({ role: 'user', content: storedContent, image_path: imagePath })
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
  // persisted, so in-conversation memory behavior is unchanged. The
  // just-inserted current-turn row is excluded from the mapped history and
  // rebuilt separately as `currentTurn` below, so this turn's image (if any)
  // can be sent as real multimodal content instead of the stored text marker.
  const priorHistory = (history as ChatMessage[]).slice(0, -1)
  const currentTurn: AiChatMessage = imageSignedUrl
    ? { role: 'user', content: [{ type: 'text', text: trimmedContent }, { type: 'image_url', image_url: { url: imageSignedUrl } }] }
    : { role: 'user', content: trimmedContent }

  const conversation: AiChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...priorHistory.map(m => ({ role: m.role, content: m.content }) as AiChatMessage),
    currentTurn,
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
