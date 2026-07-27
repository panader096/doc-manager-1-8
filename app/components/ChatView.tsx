'use client'

import { useEffect, useRef, useState } from 'react'
import { getMessages, getChatImageUrl, type ChatMessage } from '../lib/chat'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

let nextTempId = -1

export default function ChatView() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
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
    getMessages()
      .then(data => {
        // A send can fire (and optimistically append temp messages, all with
        // negative ids) before this initial load resolves. A bare replace
        // here would silently wipe those out from under an in-flight send --
        // so merge instead: keep any still-pending optimistic/temp messages
        // and layer the freshly loaded history underneath them.
        setMessages(prev => {
          const pending = prev.filter(m => m.id < 0)
          if (pending.length === 0) return data
          return [...data, ...pending].sort((a, b) => a.created_at.localeCompare(b.created_at))
        })
      })
      .catch(() => setError("Couldn't load the conversation — try refreshing"))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, sending])

  useEffect(() => {
    const withImages = messages.filter(m => m.image_path && !imageUrls[m.id])
    if (withImages.length === 0) return
    Promise.all(withImages.map(async m => [m.id, await getChatImageUrl(m.image_path!)] as const)).then(pairs => {
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
    if (!content || sending) return

    setError(null)
    setInput('')
    const attachedImage = pendingImage
    setPendingImage(null)
    setSending(true)

    const optimisticMessage: ChatMessage = {
      id: nextTempId--,
      role: 'user',
      content,
      created_at: new Date().toISOString(),
      model: null,
      total_tokens: null,
      image_path: null,
    }
    const streamingId = nextTempId--
    setMessages(prev => [
      ...prev,
      optimisticMessage,
      { id: streamingId, role: 'assistant', content: '', created_at: new Date().toISOString(), model: null, total_tokens: null, image_path: null },
    ])

    try {
      const form = new FormData()
      form.append('content', content)
      if (attachedImage) form.append('image', attachedImage)

      const response = await fetch('/api/chat', { method: 'POST', body: form })
      if (!response.ok || !response.body) throw new Error('Stream request failed')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let streamedText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const doneMarkerIndex = buffer.indexOf('\n\n__DONE__')
        if (doneMarkerIndex !== -1) {
          streamedText += buffer.slice(0, doneMarkerIndex)
          const { userMessage, assistantMessage } = JSON.parse(buffer.slice(doneMarkerIndex + '\n\n__DONE__'.length))
          setMessages(prev => {
            const byId = new Map(prev.map(m => [m.id, m]))
            byId.delete(optimisticMessage.id)
            byId.delete(streamingId)
            byId.set(userMessage.id, userMessage)
            byId.set(assistantMessage.id, assistantMessage)
            return Array.from(byId.values()).sort((a, b) => a.created_at.localeCompare(b.created_at))
          })
          break
        }

        streamedText += buffer
        buffer = ''
        setMessages(prev => prev.map(m => (m.id === streamingId ? { ...m, content: streamedText } : m)))
      }
    } catch {
      setMessages(prev => prev.filter(m => m.id !== optimisticMessage.id && m.id !== streamingId))
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

  return (
    <div className="h-full flex flex-col">
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-6 py-4 flex flex-col gap-3">
        {loading ? (
          <p className="text-[13px]" style={{ color: 'var(--text-3)' }}>Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-[13px]" style={{ color: 'var(--text-3)' }}>
            Say something to start the conversation.
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
                {message.content}
                {message.role === 'assistant' && message.model && (
                  <p className="text-[10px] mt-1 opacity-60">
                    {message.model}{message.total_tokens != null ? ` · ${message.total_tokens} tokens` : ''}
                  </p>
                )}
              </div>
            </div>
          ))
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
            disabled={sending}
            className="text-[12px] rounded-[6px] border px-2 py-2 transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
            style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
          >
            📎
          </button>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            rows={1}
            disabled={sending}
            className="flex-1 resize-none rounded-[8px] border px-3 py-2 text-[13px] outline-none disabled:opacity-50"
            style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || sending}
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
