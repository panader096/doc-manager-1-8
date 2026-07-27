// app/lib/harry-actions.ts
'use server'

import { createClient } from './supabase/server'
import { createChatCompletion, createEmbeddings, sanitizeModel, HARRY_ALLOWED_MODELS, type ChatMessage as AiChatMessage } from './ai'
import { ingestDocument, IngestRejectedError, INGEST_MAX_BYTES } from './harry-ingest'
import type { ReviewerChat, ReviewerMessage } from './harry'

const CHAT_SELECT = 'id, title, doc_filename, doc_status, doc_status_reason, created_at'
const MESSAGE_SELECT = 'id, chat_id, role, content, created_at, model, total_tokens, image_path'

const MATCH_COUNT = 5
// Same starting defaults as searchNoteChunks() in embeddings-actions.ts --
// not empirically tuned, revisit if retrieval feels too strict or loose.
const MATCH_THRESHOLD = 0.3

const HARRY_SYSTEM_PROMPT =
  "You are Harry, a professional document reviewer conducting a formal review. You answer questions ONLY using " +
  "the document excerpts provided in this conversation -- never from general knowledge. This document-only rule " +
  "applies specifically to claims about the document's content. If the user instead asks about the conversation " +
  "itself -- for example, what they asked earlier, or what you said before -- answer directly from the visible " +
  "conversation history, with no citation marker, since that is not a claim about the document. If the excerpts " +
  "don't cover a question about the document, state plainly: \"This is not addressed in the document.\" Maintain " +
  "a precise, professional register throughout (e.g. \"Per the document...\", \"The document specifies...\"). For " +
  "every factual claim about the document, cite the page it came from and rate your own confidence, using exactly " +
  "this format immediately after the claim: [p. N; confidence: High|Medium|Low] -- for example: \"The refund " +
  "window is 30 days[p. 12; confidence: High].\" Every sentence containing a claim from the document must carry " +
  "one of these markers."

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
  imageFile?: File,
): Promise<{ userMessage: ReviewerMessage; assistantMessage: ReviewerMessage }> {
  const trimmedContent = content.trim()
  if (!trimmedContent) throw new Error('Message cannot be empty')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const { data: settings } = await supabase.from('user_settings').select('harry_model').eq('user_id', user.id).maybeSingle()
  const model = sanitizeModel(settings?.harry_model, HARRY_ALLOWED_MODELS)

  const { data: chat, error: chatError } = await supabase
    .from('reviewer_chats')
    .select('doc_status')
    .eq('id', chatId)
    .single()
  if (chatError) throw chatError
  if (chat.doc_status !== 'ready') throw new Error('This chat is not ready yet')

  // An attached image is additional context for this one question, on top
  // of the chat's mandatory document grounding -- it never replaces or
  // skips retrieval. Uploaded to its own path (not the doc's) so it's never
  // confused with the chat's one grounding PDF in `reviewer-docs`.
  let imagePath: string | null = null
  let imageSignedUrl: string | null = null
  if (imageFile) {
    const ext = imageFile.name.includes('.') ? imageFile.name.split('.').pop() : 'png'
    const path = `${user.id}/${chatId}/${Date.now()}.${ext}`
    const buffer = await imageFile.arrayBuffer()
    const { error: uploadError } = await supabase.storage
      .from('reviewer-images')
      .upload(path, buffer, { contentType: imageFile.type })
    if (uploadError) throw uploadError
    imagePath = path

    const { data: signed, error: signError } = await supabase.storage.from('reviewer-images').createSignedUrl(path, 300)
    if (signError) throw signError
    imageSignedUrl = signed.signedUrl
  }

  const storedContent = imagePath ? `${trimmedContent}\n\n[Attached image: ${imageFile!.name}]` : trimmedContent

  const { data: userMessage, error: insertUserError } = await supabase
    .from('reviewer_messages')
    .insert({ chat_id: chatId, role: 'user', content: storedContent, image_path: imagePath })
    .select(MESSAGE_SELECT)
    .single()
  if (insertUserError) throw insertUserError

  const { data: history, error: historyError } = await supabase
    .from('reviewer_messages')
    .select(MESSAGE_SELECT)
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })
  if (historyError) throw historyError

  // Retrieval stays text-query-only against the raw question -- the image
  // doesn't influence which document chunks come back, only what the model
  // sees once chunks are already selected (below).
  const matches = await searchDocChunks(supabase, user.id, chatId, trimmedContent)
  const contextBlock = matches.length === 0
    ? 'No relevant excerpts were found in the document for this question.'
    : matches.map(m => `(p. ${m.page}) ${m.content}`).join('\n\n')

  // The just-inserted current-turn row is excluded from the mapped prior
  // history and rebuilt separately below (as `draftCurrentTurn` and, for the
  // validation call, `validationCurrentTurn`), so this turn's image (if any)
  // can be sent as real multimodal content instead of the stored text
  // marker baked into `storedContent` above. Only the current turn's image
  // is ever sent live -- past turns' images collapse to that stored text
  // marker once replayed as history, same "only current turn's image" rule
  // as /chat's image handling.
  const priorHistory = (history as ReviewerMessage[]).slice(0, -1)
  const draftCurrentTurn: AiChatMessage = imageSignedUrl
    ? { role: 'user', content: [{ type: 'text', text: trimmedContent }, { type: 'image_url', image_url: { url: imageSignedUrl } }] }
    : { role: 'user', content: trimmedContent }

  const conversation: AiChatMessage[] = [
    { role: 'system', content: HARRY_SYSTEM_PROMPT },
    ...priorHistory.map(m => ({ role: m.role, content: m.content }) as AiChatMessage),
    draftCurrentTurn,
    { role: 'system', content: `Relevant document excerpts for this question:\n\n${contextBlock}` },
  ]

  const draft = await createChatCompletion(conversation, { model })
  const draftContent = draft.content ?? "I wasn't able to come up with an answer — could you rephrase your question?"

  // Include the same conversation history the draft call saw (minus its own
  // last entry, the current question, which is already conveyed below via
  // the explicit "Question: ..." message -- including it twice would just
  // duplicate it). Without this, the validation pass -- which produces the
  // answer actually shown and persisted, not the draft -- has no way to
  // judge a claim that leans on earlier turns (e.g. "repeat what you just
  // told me"), and Harry visibly "forgets" the conversation in its final
  // reply even though the draft itself was generated with full history.
  //
  // The validator also gets the same image the draft did, when one was
  // attached -- it's re-checking whatever the draft claimed about it, so it
  // needs to see it too, not just the draft's text description of it.
  const validationCurrentTurn: AiChatMessage = imageSignedUrl
    ? {
        role: 'user',
        content: [
          { type: 'text', text: `Question: ${trimmedContent}\n\nDraft answer to verify:\n${draftContent}` },
          { type: 'image_url', image_url: { url: imageSignedUrl } },
        ],
      }
    : { role: 'user', content: `Question: ${trimmedContent}\n\nDraft answer to verify:\n${draftContent}` }

  const validationConversation: AiChatMessage[] = [
    { role: 'system', content: HARRY_VALIDATION_PROMPT },
    ...priorHistory.map(m => ({ role: m.role, content: m.content }) as AiChatMessage),
    { role: 'system', content: `Document excerpts used for this question:\n\n${contextBlock}` },
    validationCurrentTurn,
  ]
  const validated = await createChatCompletion(validationConversation, { model })
  const replyContent = validated.content ?? draftContent

  const { data: assistantMessage, error: insertAssistantError } = await supabase
    .from('reviewer_messages')
    .insert({
      chat_id: chatId,
      role: 'assistant',
      content: replyContent,
      model: validated.model,
      total_tokens: validated.usage?.totalTokens ?? null,
    })
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
