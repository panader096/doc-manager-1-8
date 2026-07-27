// app/lib/harry.ts
import { createClient } from './supabase/client'

export interface ReviewerChat {
  id: number
  title: string
  doc_filename: string
  doc_status: 'processing' | 'ready' | 'failed'
  doc_status_reason: string | null
  created_at: string
}

export interface ReviewerMessage {
  id: number
  chat_id: number
  role: 'user' | 'assistant'
  content: string
  created_at: string
  model: string | null
  total_tokens: number | null
  image_path: string | null
}

export interface HarryClaim {
  text: string
  page: number | null
  confidence: 'High' | 'Medium' | 'Low' | null
}

const CHAT_SELECT = 'id, title, doc_filename, doc_status, doc_status_reason, created_at'
const MESSAGE_SELECT = 'id, chat_id, role, content, created_at, model, total_tokens, image_path'
const REVIEWER_IMAGES_BUCKET = 'reviewer-images'

export async function getChats(): Promise<ReviewerChat[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('reviewer_chats')
    .select(CHAT_SELECT)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getChat(chatId: number): Promise<ReviewerChat | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('reviewer_chats')
    .select(CHAT_SELECT)
    .eq('id', chatId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function getMessages(chatId: number): Promise<ReviewerMessage[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('reviewer_messages')
    .select(MESSAGE_SELECT)
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function getReviewerImageUrl(imagePath: string): Promise<string | null> {
  const supabase = createClient()
  const { data, error } = await supabase.storage.from(REVIEWER_IMAGES_BUCKET).createSignedUrl(imagePath, 3600)
  if (error) return null
  return data.signedUrl
}

// Matches the "[p. N; confidence: High|Medium|Low]" marker Harry is
// prompted to place immediately after each claim (see HARRY_SYSTEM_PROMPT
// in harry-actions.ts). Text with no marker (or a malformed one) renders
// as a plain trailing claim with no page/confidence, rather than breaking.
const CLAIM_MARKER = /\[p\.\s*(\d+);\s*confidence:\s*(High|Medium|Low)\]/gi

function normalizeConfidence(raw: string): 'High' | 'Medium' | 'Low' {
  const lower = raw.toLowerCase()
  return (lower.charAt(0).toUpperCase() + lower.slice(1)) as 'High' | 'Medium' | 'Low'
}

export function parseHarryClaims(content: string): HarryClaim[] {
  const claims: HarryClaim[] = []
  let lastIndex = 0
  CLAIM_MARKER.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = CLAIM_MARKER.exec(content)) !== null) {
    const text = content.slice(lastIndex, match.index).trim()
    if (text) {
      claims.push({ text, page: Number(match[1]), confidence: normalizeConfidence(match[2]) })
    }
    lastIndex = CLAIM_MARKER.lastIndex
  }
  const rest = content.slice(lastIndex).trim()
  if (rest) claims.push({ text: rest, page: null, confidence: null })
  return claims
}

export interface SharedReviewerMessage {
  content: string
  created_at: string
}

export async function createShare(messageId: number): Promise<string> {
  const supabase = createClient()
  const existing = await getShareToken(messageId)
  if (existing) return existing

  const token = crypto.randomUUID()
  const { error } = await supabase.from('reviewer_shares').insert({ message_id: messageId, share_token: token })
  if (error) throw error
  return token
}

export async function revokeShare(messageId: number): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('reviewer_shares').delete().eq('message_id', messageId)
  if (error) throw error
}

export async function getShareToken(messageId: number): Promise<string | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('reviewer_shares')
    .select('share_token')
    .eq('message_id', messageId)
    .maybeSingle()
  if (error) throw error
  return data?.share_token ?? null
}

export async function getSharedMessage(token: string): Promise<SharedReviewerMessage | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('reviewer_shares')
    .select('reviewer_messages(content, created_at)')
    .eq('share_token', token)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return data.reviewer_messages as unknown as SharedReviewerMessage
}
