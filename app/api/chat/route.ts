import { createClient } from '../../lib/supabase/server'
import {
  createChatCompletion,
  createChatCompletionStream,
  type ChatMessage as AiChatMessage,
} from '../../lib/ai'
import { runSearchNotesTool } from '../../lib/chat-actions'
import { SYSTEM_PROMPT, SEARCH_NOTES_TOOL, MAX_TOOL_ROUNDS } from '../../lib/chat-shared'
import type { ChatMessage } from '../../lib/chat'

const MESSAGE_SELECT = 'id, role, content, created_at, model, total_tokens'

export async function POST(request: Request) {
  const { content } = await request.json()
  const trimmedContent = typeof content === 'string' ? content.trim() : ''
  if (!trimmedContent) {
    return new Response('Message cannot be empty', { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response('Not signed in', { status: 401 })
  }

  const { data: userMessage, error: insertUserError } = await supabase
    .from('chat_messages')
    .insert({ role: 'user', content: trimmedContent })
    .select(MESSAGE_SELECT)
    .single()
  if (insertUserError) {
    return new Response('Failed to save message', { status: 500 })
  }

  const { data: history, error: historyError } = await supabase
    .from('chat_messages')
    .select(MESSAGE_SELECT)
    .order('created_at', { ascending: true })
  if (historyError) {
    return new Response('Failed to load history', { status: 500 })
  }

  const conversation: AiChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...(history as ChatMessage[]).map(m => ({ role: m.role, content: m.content }) as AiChatMessage),
  ]

  // Resolve any tool rounds first (non-streamed -- fast, and there's nothing
  // to usefully stream token-by-token during a RAG lookup). Stop as soon as
  // a round produces plain content with no further tool call.
  let round = 0
  while (round < MAX_TOOL_ROUNDS - 1) {
    const assistantTurn = await createChatCompletion(conversation, { tools: [SEARCH_NOTES_TOOL] })
    if (!assistantTurn.tool_calls || assistantTurn.tool_calls.length === 0) {
      break
    }
    conversation.push({ role: 'assistant', content: assistantTurn.content, tool_calls: assistantTurn.tool_calls })
    for (const toolCall of assistantTurn.tool_calls) {
      const { query } = JSON.parse(toolCall.function.arguments) as { query: string }
      const resultText = await runSearchNotesTool(supabase, query)
      conversation.push({ role: 'tool', tool_call_id: toolCall.id, content: resultText })
    }
    round++
  }

  const upstream = await createChatCompletionStream(conversation)
  const reader = upstream.getReader()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  let fullContent = ''
  let finalModel: string | null = null
  let finalTotalTokens: number | null = null
  let sseBuffer = ''

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read()
      if (done) {
        const { data: assistantMessage } = await supabase
          .from('chat_messages')
          .insert({
            role: 'assistant',
            content: fullContent || "I wasn't able to come up with an answer -- could you rephrase your question?",
            model: finalModel,
            total_tokens: finalTotalTokens,
          })
          .select(MESSAGE_SELECT)
          .single()
        controller.enqueue(encoder.encode(`\n\n__DONE__${JSON.stringify({ userMessage, assistantMessage })}`))
        controller.close()
        return
      }

      sseBuffer += decoder.decode(value, { stream: true })
      const lines = sseBuffer.split('\n')
      sseBuffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const payload = line.slice('data: '.length)
        if (payload === '[DONE]') continue

        const chunk = JSON.parse(payload)
        const delta = chunk.choices?.[0]?.delta?.content
        if (typeof delta === 'string') {
          fullContent += delta
          controller.enqueue(encoder.encode(delta))
        }
        if (chunk.model) finalModel = chunk.model
        if (chunk.usage) finalTotalTokens = chunk.usage.total_tokens
      }
    },
  })

  return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
