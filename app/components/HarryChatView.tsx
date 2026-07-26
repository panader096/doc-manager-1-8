'use client'

import { useEffect, useRef, useState } from 'react'
import { getChat, getMessages, parseHarryClaims, type ReviewerChat, type ReviewerMessage } from '../lib/harry'
import { sendMessage } from '../lib/harry-actions'

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
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLoading(true)
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

  async function handleSend() {
    const content = input.trim()
    if (!content || sending || chat?.doc_status !== 'ready') return

    setError(null)
    setInput('')
    setSending(true)

    const optimisticMessage: ReviewerMessage = {
      id: nextTempId--,
      chat_id: chatId,
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, optimisticMessage])

    try {
      const { userMessage, assistantMessage } = await sendMessage(chatId, content)
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
      <div className="px-6 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <p className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>{chat.title}</p>
        <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>{chat.doc_filename}</p>
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
                {message.role === 'assistant' ? <AssistantContent content={message.content} /> : message.content}
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
        <div className="flex items-end gap-2">
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
