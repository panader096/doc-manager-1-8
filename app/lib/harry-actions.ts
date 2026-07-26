// app/lib/harry-actions.ts
'use server'

import { createClient } from './supabase/server'
import { createChatCompletion, createEmbeddings, type ChatMessage as AiChatMessage } from './ai'
import { ingestDocument, IngestRejectedError, INGEST_MAX_BYTES } from './harry-ingest'
import type { ReviewerChat, ReviewerMessage } from './harry'

const CHAT_SELECT = 'id, title, doc_filename, doc_status, doc_status_reason, created_at'
const MESSAGE_SELECT = 'id, chat_id, role, content, created_at'

const MATCH_COUNT = 5
// Same starting defaults as searchNoteChunks() in embeddings-actions.ts --
// not empirically tuned, revisit if retrieval feels too strict or loose.
const MATCH_THRESHOLD = 0.3

const HARRY_SYSTEM_PROMPT =
  "You are Harry, an expert document reviewer. You answer questions ONLY using the document excerpts " +
  "provided to you in this conversation -- never from general knowledge. If the excerpts don't cover " +
  "the question, say so plainly (for example: \"This isn't addressed in the document.\") rather than " +
  'guessing or answering from what you know generally. For every factual claim you make, cite the page ' +
  'it came from and rate your own confidence, using exactly this format immediately after the claim: ' +
  '[p. N; confidence: High|Medium|Low] -- for example: "The refund window is 30 days[p. 12; confidence: High]." ' +
  'Every sentence containing a claim from the document must carry one of these markers.'

const HARRY_VALIDATION_PROMPT =
  "You are Harry's self-review step. You will be shown the document excerpts that were available and a " +
  'draft answer generated from them. Check every claim in the draft against the excerpts: if a claim is ' +
  'not actually supported, correct it, downgrade its confidence marker, or remove it entirely. Keep the ' +
  'same [p. N; confidence: High|Medium|Low] marker format. Return only the corrected final answer, ready ' +
  'to show the user directly -- no preamble, no notes about what you changed.'

type ServerSupabase = Awaited<ReturnType<typeof createClient>>

async function searchDocChunks(
  supabase: ServerSupabase,
  userId: string,
  chatId: number,
  query: string,
): Promise<{ id: number; page: number; content: string; similarity: number }[]> {
  const [queryEmbedding] = await createEmbeddings([query])
  const { data, error } = await supabase.rpc('match_reviewer_chunks', {
    query_embedding: queryEmbedding,
    match_threshold: MATCH_THRESHOLD,
    match_count: MATCH_COUNT,
    p_user_id: userId,
    p_chat_id: chatId,
  })
  if (error) throw error
  return data
}

export async function createChat(title: string, file: File): Promise<ReviewerChat> {
  const trimmedTitle = title.trim()
  if (!trimmedTitle) throw new Error('Chat name cannot be empty')
  if (file.type !== 'application/pdf') throw new Error('Only PDF files are supported')
  if (file.size > INGEST_MAX_BYTES) throw new Error('PDF must be 20MB or smaller')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const buffer = await file.arrayBuffer()

  const { data: chat, error: insertError } = await supabase
    .from('reviewer_chats')
    .insert({ title: trimmedTitle, doc_filename: file.name, doc_status: 'processing' })
    .select(CHAT_SELECT)
    .single()
  if (insertError) throw insertError

  const docPath = `${user.id}/${chat.id}/document.pdf`

  const { error: uploadError } = await supabase.storage
    .from('reviewer-docs')
    .upload(docPath, buffer, { contentType: 'application/pdf' })
  if (uploadError) {
    await supabase.from('reviewer_chats').delete().eq('id', chat.id)
    throw uploadError
  }

  const { error: pathUpdateError } = await supabase
    .from('reviewer_chats')
    .update({ doc_path: docPath })
    .eq('id', chat.id)
  if (pathUpdateError) {
    await supabase.storage.from('reviewer-docs').remove([docPath])
    await supabase.from('reviewer_chats').delete().eq('id', chat.id)
    throw pathUpdateError
  }

  try {
    const { chunks } = await ingestDocument(buffer)
    const { error: chunksError } = await supabase.from('reviewer_doc_chunks').insert(
      chunks.map(c => ({ chat_id: chat.id, page: c.page, content: c.content, embedding: c.embedding })),
    )
    if (chunksError) throw chunksError

    const { data: readyChat, error: readyError } = await supabase
      .from('reviewer_chats')
      .update({ doc_status: 'ready' })
      .eq('id', chat.id)
      .select(CHAT_SELECT)
      .single()
    if (readyError) throw readyError
    return readyChat
  } catch (err) {
    // Always log the real error server-side, even though only a generic
    // reason is ever shown to the user for non-IngestRejectedError
    // failures -- without this, an unexpected ingestion failure (e.g. a
    // library/bundler integration issue) is otherwise invisible.
    if (!(err instanceof IngestRejectedError)) {
      console.error('Unexpected error ingesting document for chat', chat.id, err)
    }
    const reason = err instanceof IngestRejectedError ? err.message : 'Failed to process this PDF.'
    const { data: failedChat, error: failError } = await supabase
      .from('reviewer_chats')
      .update({ doc_status: 'failed', doc_status_reason: reason })
      .eq('id', chat.id)
      .select(CHAT_SELECT)
      .single()
    if (failError) throw failError
    return failedChat
  }
}

export async function sendMessage(
  chatId: number,
  content: string,
): Promise<{ userMessage: ReviewerMessage; assistantMessage: ReviewerMessage }> {
  const trimmedContent = content.trim()
  if (!trimmedContent) throw new Error('Message cannot be empty')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const { data: chat, error: chatError } = await supabase
    .from('reviewer_chats')
    .select('doc_status')
    .eq('id', chatId)
    .single()
  if (chatError) throw chatError
  if (chat.doc_status !== 'ready') throw new Error('This chat is not ready yet')

  const { data: userMessage, error: insertUserError } = await supabase
    .from('reviewer_messages')
    .insert({ chat_id: chatId, role: 'user', content: trimmedContent })
    .select(MESSAGE_SELECT)
    .single()
  if (insertUserError) throw insertUserError

  const { data: history, error: historyError } = await supabase
    .from('reviewer_messages')
    .select(MESSAGE_SELECT)
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })
  if (historyError) throw historyError

  const matches = await searchDocChunks(supabase, user.id, chatId, trimmedContent)
  const contextBlock = matches.length === 0
    ? 'No relevant excerpts were found in the document for this question.'
    : matches.map(m => `(p. ${m.page}) ${m.content}`).join('\n\n')

  const conversation: AiChatMessage[] = [
    { role: 'system', content: HARRY_SYSTEM_PROMPT },
    ...(history as ReviewerMessage[]).map(m => ({ role: m.role, content: m.content }) as AiChatMessage),
    { role: 'system', content: `Relevant document excerpts for this question:\n\n${contextBlock}` },
  ]

  const draft = await createChatCompletion(conversation)
  const draftContent = draft.content ?? "I wasn't able to come up with an answer — could you rephrase your question?"

  // Include the same conversation history the draft call saw (minus its own
  // last entry, the current question, which is already conveyed below via
  // the explicit "Question: ..." message -- including it twice would just
  // duplicate it). Without this, the validation pass -- which produces the
  // answer actually shown and persisted, not the draft -- has no way to
  // judge a claim that leans on earlier turns (e.g. "repeat what you just
  // told me"), and Harry visibly "forgets" the conversation in its final
  // reply even though the draft itself was generated with full history.
  const priorHistory = (history as ReviewerMessage[]).slice(0, -1)
  const validationConversation: AiChatMessage[] = [
    { role: 'system', content: HARRY_VALIDATION_PROMPT },
    ...priorHistory.map(m => ({ role: m.role, content: m.content }) as AiChatMessage),
    { role: 'system', content: `Document excerpts used for this question:\n\n${contextBlock}` },
    { role: 'user', content: `Question: ${trimmedContent}\n\nDraft answer to verify:\n${draftContent}` },
  ]
  const validated = await createChatCompletion(validationConversation)
  const replyContent = validated.content ?? draftContent

  const { data: assistantMessage, error: insertAssistantError } = await supabase
    .from('reviewer_messages')
    .insert({ chat_id: chatId, role: 'assistant', content: replyContent })
    .select(MESSAGE_SELECT)
    .single()
  if (insertAssistantError) throw insertAssistantError

  return { userMessage, assistantMessage }
}

export async function renameChat(chatId: number, title: string): Promise<void> {
  const trimmedTitle = title.trim()
  if (!trimmedTitle) throw new Error('Chat name cannot be empty')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const { data, error } = await supabase
    .from('reviewer_chats')
    .update({ title: trimmedTitle })
    .eq('id', chatId)
    .select('id')
  if (error) throw error
  // RLS's `using` clause makes an update against another user's chat match
  // zero rows rather than error -- without this check that fails silently,
  // unlike sendMessage/deleteChat which both verify ownership via a
  // preceding select().single() that throws on a missing/unowned row.
  if (data.length === 0) throw new Error('Chat not found')
}

export async function deleteChat(chatId: number): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const { data: chat, error: fetchError } = await supabase
    .from('reviewer_chats')
    .select('doc_path')
    .eq('id', chatId)
    .single()
  if (fetchError) throw fetchError

  if (chat.doc_path) {
    const { error: removeError } = await supabase.storage.from('reviewer-docs').remove([chat.doc_path])
    if (removeError) throw removeError
  }

  const { error: deleteError } = await supabase.from('reviewer_chats').delete().eq('id', chatId)
  if (deleteError) throw deleteError
}
