'use client'

import { useEffect, useRef, useState } from 'react'
import { getMessages, type ChatMessage } from '../lib/chat'
import { sendMessage } from '../lib/chat-actions'

let nextTempId = -1

export default function ChatView() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getMessages().then(data => {
      setMessages(data)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, sending])

  async function handleSend() {
    const content = input.trim()
    if (!content || sending) return

    setError(null)
    setInput('')
    setSending(true)

    const optimisticMessage: ChatMessage = {
      id: nextTempId--,
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, optimisticMessage])

    try {
      const { userMessage, assistantMessage } = await sendMessage(content)
      setMessages(prev => [
        ...prev.filter(m => m.id !== optimisticMessage.id),
        userMessage,
        assistantMessage,
      ])
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
                {message.content}
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
              Thinking…
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
            placeholder="Type a message…"
            rows={1}
            className="flex-1 resize-none rounded-[8px] border px-3 py-2 text-[13px] outline-none"
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
