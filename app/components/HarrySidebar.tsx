'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getChats, type ReviewerChat } from '../lib/harry'
import { createChat, renameChat, deleteChat } from '../lib/harry-actions'

export default function HarrySidebar() {
  const [chats, setChats] = useState<ReviewerChat[]>([])
  const [loading, setLoading] = useState(true)
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(null)
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [creating, setCreating] = useState(false)
  const [showNewChatForm, setShowNewChatForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newFile, setNewFile] = useState<File | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const pathname = usePathname()

  const activeId = pathname.startsWith('/harry/') ? pathname.slice('/harry/'.length) : null

  async function fetchChats() {
    try {
      const data = await getChats()
      setChats(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchChats()
  }, [])

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setNewFile(file)
  }

  async function handleCreate() {
    if (!newTitle.trim() || !newFile || creating) return
    setCreating(true)
    setCreateError(null)
    try {
      const chat = await createChat(newTitle.trim(), newFile)
      setChats(prev => [chat, ...prev])
      setShowNewChatForm(false)
      setNewTitle('')
      setNewFile(null)
      router.push(`/harry/${chat.id}`)
    } catch {
      setCreateError("Couldn't create the chat — try again")
    } finally {
      setCreating(false)
    }
  }

  function handleDeleteClick(e: React.MouseEvent, id: number) {
    e.stopPropagation()
    e.preventDefault()
    setConfirmingDeleteId(id)
  }

  async function confirmDelete() {
    const id = confirmingDeleteId
    if (id == null) return
    setConfirmingDeleteId(null)
    await deleteChat(id)
    const next = chats.filter(c => c.id !== id)
    setChats(next)
    if (activeId === String(id)) {
      router.push('/harry')
    }
  }

  function startRename(e: React.MouseEvent, chat: ReviewerChat) {
    e.stopPropagation()
    e.preventDefault()
    setRenamingId(chat.id)
    setRenameValue(chat.title)
  }

  async function commitRename() {
    const id = renamingId
    if (id == null) return
    const title = renameValue.trim()
    setRenamingId(null)
    if (!title) return
    await renameChat(id, title)
    setChats(prev => prev.map(c => (c.id === id ? { ...c, title } : c)))
  }

  return (
    <aside
      className="h-full flex flex-col flex-shrink-0"
      style={{ width: 260, backgroundColor: 'var(--bg-sidebar)', borderRight: '1px solid var(--border)' }}
    >
      {confirmingDeleteId != null && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4"
          onClick={() => setConfirmingDeleteId(null)}
        >
          <div
            className="rounded-[8px] border p-5 max-w-xs w-full"
            style={{ backgroundColor: 'var(--bg-modal)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-modal)' }}
            onClick={e => e.stopPropagation()}
          >
            <p className="font-semibold text-[14px] mb-1" style={{ color: 'var(--text-1)' }}>
              Delete this chat?
            </p>
            <p className="text-[12px] mb-4" style={{ color: 'var(--text-2)' }}>
              This removes the conversation and the uploaded document. This can&rsquo;t be undone.
            </p>
            <div className="flex gap-1.5">
              <button
                onClick={confirmDelete}
                className="flex-1 text-[12px] font-medium rounded-[4px] px-3 py-1.5 hover:opacity-80 transition-opacity"
                style={{ backgroundColor: '#ef4444', color: '#fff' }}
              >
                Delete
              </button>
              <button
                onClick={() => setConfirmingDeleteId(null)}
                className="flex-1 text-[12px] rounded-[4px] border px-3 py-1.5 transition-colors"
                style={{ color: 'var(--text-2)', borderColor: 'var(--border)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="px-3 pt-3 pb-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: 'var(--text-3)' }}>
            Chats with Harry{chats.length > 0 ? ` · ${chats.length}` : ''}
          </span>
          <button
            onClick={() => setShowNewChatForm(v => !v)}
            className="text-[11px] font-medium px-2 py-1 rounded-[4px] leading-none cursor-pointer hover:opacity-80 transition-opacity"
            style={{ backgroundColor: 'var(--btn-primary)', color: '#fff' }}
          >
            + New chat
          </button>
        </div>

        {showNewChatForm && (
          <div className="flex flex-col gap-1.5 mt-1">
            <input
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="Chat name…"
              className="w-full text-[12px] rounded-[4px] border px-2 py-1.5 outline-none"
              style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-[12px] rounded-[4px] border px-2 py-1.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
            >
              {newFile ? newFile.name : 'Choose PDF…'}
            </button>
            {createError && (
              <p className="text-[11px]" style={{ color: 'var(--text-2)' }}>{createError}</p>
            )}
            <button
              onClick={handleCreate}
              disabled={!newTitle.trim() || !newFile || creating}
              className="text-[12px] font-medium rounded-[4px] px-2 py-1.5 transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
            >
              {creating ? 'Processing document…' : 'Create'}
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="animate-pulse">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-1.5 px-3 py-2">
                <div className="h-[12px] rounded-[3px] w-3/5" style={{ backgroundColor: 'var(--bg-hover)' }} />
                <div className="h-[10px] rounded-[3px] w-4/5" style={{ backgroundColor: 'var(--bg-hover)' }} />
              </div>
            ))}
          </div>
        ) : chats.length === 0 ? (
          <p className="px-3 py-2 text-[12px]" style={{ color: 'var(--text-3)' }}>
            No chats yet
          </p>
        ) : (
          chats.map(chat => {
            const isActive = String(chat.id) === activeId
            return (
              <div
                key={chat.id}
                onClick={() => router.push(`/harry/${chat.id}`)}
                onMouseEnter={() => setHoveredId(chat.id)}
                onMouseLeave={() => setHoveredId(null)}
                className="flex items-start gap-1 px-3 py-2 cursor-pointer"
                style={{
                  backgroundColor: isActive ? 'var(--bg-active)' : hoveredId === chat.id ? 'var(--bg-hover)' : 'transparent',
                  borderLeft: isActive ? '2px solid var(--active-bar)' : '2px solid transparent',
                }}
              >
                <div className="flex-1 min-w-0">
                  {renamingId === chat.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitRename()
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                      onClick={e => e.stopPropagation()}
                      className="w-full text-[12px] font-medium bg-transparent border-none outline-none"
                      style={{ color: 'var(--text-1)' }}
                    />
                  ) : (
                    <p className="text-[12px] font-medium truncate" style={{ color: 'var(--text-1)' }}>
                      {chat.title}
                    </p>
                  )}
                  <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-3)' }}>
                    {chat.doc_status === 'processing' && 'Processing document…'}
                    {chat.doc_status === 'failed' && (chat.doc_status_reason ?? 'Failed to process document')}
                    {chat.doc_status === 'ready' && chat.doc_filename}
                  </p>
                </div>
                {hoveredId === chat.id && (
                  <div className="flex-shrink-0 flex items-center gap-1 mt-0.5">
                    <button
                      onClick={e => startRename(e, chat)}
                      aria-label="Rename chat"
                      className="text-[11px] leading-none opacity-40 hover:opacity-80 transition-opacity cursor-pointer"
                      style={{ color: 'var(--text-2)' }}
                      title="Rename"
                    >
                      ✎
                    </button>
                    <button
                      onClick={e => handleDeleteClick(e, chat.id)}
                      aria-label="Delete chat"
                      className="text-[16px] leading-none opacity-40 hover:opacity-80 transition-opacity cursor-pointer"
                      style={{ color: 'var(--text-2)' }}
                      title="Delete chat"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </aside>
  )
}
