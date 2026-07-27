'use client'

import { useEffect, useRef, useState } from 'react'
import { getChat, getMessages, getReviewerImageUrl, parseHarryClaims, type ReviewerChat, type ReviewerMessage } from '../lib/harry'
import { sendMessage } from '../lib/harry-actions'
import ModelSelector from './ModelSelector'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

let nextTempId = -1

const CONFIDENCE_COLOR: Record<'High' | 'Medium' | 'Low', string> = {
  High: '#16a34a',
  Medium: '#d97706',
  Low: '#dc2626',
}

function AssistantContent({ content }: { content: string }) {
  const claims = parseHarryClaims(content)
  return (
    <span>
      {claims.map((claim, i) => (
        <span key={i}>
          {claim.text}
          {claim.page != null && claim.confidence != null && (
            <span
              className="inline-flex items-center gap-1 ml-1 text-[10px] font-medium rounded-[4px] px-1.5 py-px align-middle"
              style={{ backgroundColor: 'var(--bg-hover)', color: CONFIDENCE_COLOR[claim.confidence] }}
            >
              p. {claim.page} · {claim.confidence}
            </span>
          )}
          {' '}
        </span>
      ))}
    </span>
  )
}

export default function HarryChatView({ chatId }: { chatId: number }) {
  const [chat, setChat] = useState<ReviewerChat | null>(null)
  const [messages, setMessages] = useState<ReviewerMessage[]>([])
  const [imageUrls, setImageUrls] = useState<Record<number, string>>({})
  const [input, setInput] = useState('')
  const [pendingImage, setPendingImage] = useState<File | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // No need to reset loading to true here -- HarryChatView is keyed by
    // chatId at its call site (app/harry/[id]/page.tsx), so a chat change
    // always remounts fresh, and `loading` already starts true via its
    // useState initializer above.
    Promise.all([getChat(chatId), getMessages(chatId)])
      .then(([chatData, messageData]) => {
        setChat(chatData)
        setMessages(messageData)
      })
      .catch(() => setError("Couldn't load this chat — try refreshing"))
      .finally(() => setLoading(false))
  }, [chatId])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, sending])

  useEffect(() => {
    const withImages = messages.filter(m => m.image_path && !imageUrls[m.id])
    if (withImages.length === 0) return
    Promise.all(withImages.map(async m => [m.id, await getReviewerImageUrl(m.image_path!)] as const)).then(pairs => {
      setImageUrls(prev => {
        const next = { ...prev }
        for (const [id, url] of pairs) if (url) next[id] = url
        return next
      })
    })
  }, [messages, imageUrls])

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setImageError('Unsupported image type.')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError('Image must be 5MB or smaller.')
      return
    }
    setImageError(null)
    setPendingImage(file)
  }

  async function handleSend() {
    const content = input.trim()
    if (!content || sending || chat?.doc_status !== 'ready') return

    setError(null)
    setInput('')
    const attachedImage = pendingImage
    setPendingImage(null)
    setSending(true)

    const optimisticMessage: ReviewerMessage = {
      id: nextTempId--,
      chat_id: chatId,
      role: 'user',
      content,
      created_at: new Date().toISOString(),
      model: null,
      total_tokens: null,
      image_path: null,
    }
    setMessages(prev => [...prev, optimisticMessage])

    try {
      const { userMessage, assistantMessage } = await sendMessage(chatId, content, attachedImage ?? undefined)
      setMessages(prev => {
        const byId = new Map(prev.map(m => [m.id, m]))
        byId.delete(optimisticMessage.id)
        byId.set(userMessage.id, userMessage)
        byId.set(assistantMessage.id, assistantMessage)
        return Array.from(byId.values()).sort((a, b) => a.created_at.localeCompare(b.created_at))
      })
    } catch {
      setMessages(prev => prev.filter(m => m.id !== optimisticMessage.id))
      setInput(content)
      setPendingImage(attachedImage)
      setError("Couldn't send that — try again")
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-[13px]" style={{ color: 'var(--text-3)' }}>Loading…</p>
      </div>
    )
  }

  if (!chat) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-[13px]" style={{ color: 'var(--text-3)' }}>Chat not found.</p>
      </div>
    )
  }

  const notReady = chat.doc_status !== 'ready'

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-3 flex-shrink-0 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <p className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>{chat.title}</p>
          <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>{chat.doc_filename}</p>
        </div>
        <ModelSelector app="harry" />
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-6 py-4 flex flex-col gap-3">
        {notReady ? (
          <p className="text-[13px]" style={{ color: 'var(--text-3)' }}>
            {chat.doc_status === 'processing'
              ? 'Harry is still processing this document…'
              : (chat.doc_status_reason ?? 'This document could not be processed.')}
          </p>
        ) : messages.length === 0 ? (
          <p className="text-[13px]" style={{ color: 'var(--text-3)' }}>
            Ask Harry a question about this document.
          </p>
        ) : (
          messages.map(message => (
            <div
              key={message.id}
              className="flex"
              style={{ justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start' }}
            >
              <div
                className="max-w-[70%] rounded-[10px] px-3 py-2 text-[13px] whitespace-pre-wrap"
                style={
                  message.role === 'user'
                    ? { backgroundColor: 'var(--accent)', color: '#fff' }
                    : { backgroundColor: 'var(--bg-modal)', color: 'var(--text-1)', boxShadow: 'var(--shadow-modal)' }
                }
              >
                {message.image_path && imageUrls[message.id] && (
                  <img src={imageUrls[message.id]} alt="Attached" className="rounded-[8px] max-w-full mb-1" />
                )}
                {message.role === 'assistant' ? <AssistantContent content={message.content} /> : message.content}
                {message.role === 'assistant' && message.model && (
                  <p className="text-[10px] mt-1 opacity-60">
                    {message.model}{message.total_tokens != null ? ` · ${message.total_tokens} tokens` : ''}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
        {sending && (
          <div className="flex" style={{ justifyContent: 'flex-start' }}>
            <div
              className="max-w-[70%] rounded-[10px] px-3 py-2 text-[13px]"
              style={{ backgroundColor: 'var(--bg-modal)', color: 'var(--text-3)', boxShadow: 'var(--shadow-modal)' }}
            >
              Harry is reviewing the document…
            </div>
          </div>
        )}
      </div>

      <div className="flex-shrink-0 px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
        {error && (
          <p className="text-[12px] mb-2" style={{ color: 'var(--text-2)' }}>
            {error}
          </p>
        )}
        {imageError && (
          <p className="text-[12px] mb-2" style={{ color: 'var(--text-2)' }}>
            {imageError}
          </p>
        )}
        {pendingImage && (
          <div className="flex items-center gap-2 mb-2 text-[11px]" style={{ color: 'var(--text-2)' }}>
            <span>{pendingImage.name}</span>
            <button onClick={() => setPendingImage(null)} aria-label="Remove attached image" className="opacity-60 hover:opacity-100">×</button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(',')}
            onChange={handleImageSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={notReady}
            className="text-[12px] rounded-[6px] border px-2 py-2 transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
            style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
          >
            📎
          </button>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={notReady}
            placeholder={notReady ? 'Waiting for the document…' : 'Ask Harry a question…'}
            rows={1}
            className="flex-1 resize-none rounded-[8px] border px-3 py-2 text-[13px] outline-none disabled:opacity-50"
            style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || sending || notReady}
            className="text-[12px] font-medium rounded-[6px] px-3 py-2 transition-colors disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
