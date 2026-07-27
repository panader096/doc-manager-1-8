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
  // a round produces plain content with no further tool call, and capture
  // that content/model/usage instead of discarding it -- the common case
  // (a question with no tool call at all) already has the full answer after
  // this loop's very first iteration, so there's no need to pay for a
  // second, redundant model call just to stream it. Only the rare case where
  // every round through MAX_TOOL_ROUNDS - 1 came back with a tool call (and
  // we're out of rounds) needs a genuine live streaming call below.
  let round = 0
  let gotPlainRound = false
  let plainContent: string | null = null
  let plainModel: string | null = null
  let plainTotalTokens: number | null = null
  while (round < MAX_TOOL_ROUNDS - 1) {
    const assistantTurn = await createChatCompletion(conversation, { tools: [SEARCH_NOTES_TOOL] })
    if (!assistantTurn.tool_calls || assistantTurn.tool_calls.length === 0) {
      gotPlainRound = true
      plainContent = assistantTurn.content
      plainModel = assistantTurn.model
      plainTotalTokens = assistantTurn.usage?.totalTokens ?? null
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

  const encoder = new TextEncoder()
  let fullContent = ''
  let finalModel: string | null = null
  let finalTotalTokens: number | null = null

  async function persistAndEmitDone(controller: ReadableStreamDefaultController<Uint8Array>) {
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
  }

  let stream: ReadableStream<Uint8Array>

  if (gotPlainRound) {
    // We already have the full answer from the tool-round loop above -- no
    // second model call. Flush it to the client in small chunks with a tiny
    // scheduling gap so it still reads as progressive on screen, not as one
    // instant blob, even though generation itself already finished.
    fullContent = plainContent ?? ''
    finalModel = plainModel
    finalTotalTokens = plainTotalTokens

    const SIMULATED_CHUNK_SIZE = 20
    const SIMULATED_CHUNK_DELAY_MS = 20
    let cursor = 0

    stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (cursor < fullContent.length) {
          const piece = fullContent.slice(cursor, cursor + SIMULATED_CHUNK_SIZE)
          cursor += SIMULATED_CHUNK_SIZE
          controller.enqueue(encoder.encode(piece))
          await new Promise(resolve => setTimeout(resolve, SIMULATED_CHUNK_DELAY_MS))
          return
        }
        await persistAndEmitDone(controller)
      },
    })
  } else {
    // Fallback: every round through MAX_TOOL_ROUNDS - 1 came back with a
    // tool call, so there's no already-generated plain answer to reuse --
    // make one genuine, live streaming call for the final answer.
    const upstream = await createChatCompletionStream(conversation)
    const reader = upstream.getReader()
    const decoder = new TextDecoder()
    let sseBuffer = ''

    stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { done, value } = await reader.read()
        if (done) {
          await persistAndEmitDone(controller)
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
  }

  return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
