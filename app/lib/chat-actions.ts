'use server'

import { createClient } from './supabase/server'
import { createChatCompletion, type ChatMessage as AiChatMessage, type ToolDefinition } from './ai'
import { searchNoteChunks } from './embeddings-actions'
import type { ChatMessage } from './chat'

const MESSAGE_SELECT = 'id, role, content, created_at, model, total_tokens'

const SYSTEM_PROMPT =
  'You are a helpful assistant. The user also has a personal notes app; you have a search_notes tool that ' +
  "searches it, always scoped to this user's own notes only. Decide for yourself whether a question needs " +
  "it -- skip it entirely for general-knowledge questions that have nothing to do with the user's notes. When " +
  'you do search and the results look weak, irrelevant, or empty, rewrite the query (different wording, more ' +
  'specific or more general as appropriate) and search again rather than answering from a poor match. If, ' +
  "after trying, nothing relevant turns up for a question that does seem to be about the user's notes, say so " +
  'directly instead of guessing. When you do use a note in your answer, cite it by name (for example, "based ' +
  'on your note about the London event...").'

const SEARCH_NOTES_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'search_notes',
    description:
      "Search the user's personal notes for chunks relevant to a query. Use this only when the answer " +
      'plausibly requires something the user previously wrote in their own notes. Do not use it for general ' +
      'knowledge questions unrelated to personal notes (for example, "what is Paris the capital of?").',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'The search query, phrased to best match how this might be worded in the notes. Rephrase and ' +
            "call again if an earlier search's results looked weak or irrelevant.",
        },
      },
      required: ['query'],
    },
  },
}

// Model gets up to this many tool-enabled rounds before being forced to
// answer with whatever it has -- bounds cost/latency if it kept rewriting.
const MAX_TOOL_ROUNDS = 3

type ServerSupabase = Awaited<ReturnType<typeof createClient>>

async function runSearchNotesTool(supabase: ServerSupabase, query: string): Promise<string> {
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
      isLastRound ? {} : { tools: [SEARCH_NOTES_TOOL] },
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
