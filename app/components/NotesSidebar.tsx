'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getNotes, createNote, deleteNote, NoteListItem } from '../lib/notes'

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export default function NotesSidebar() {
  const [notes, setNotes] = useState<NoteListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const router = useRouter()
  const pathname = usePathname()

  const activeId = pathname.startsWith('/notes/') ? pathname.slice('/notes/'.length) : null

  async function fetchNotes() {
    try {
      const data = await getNotes()
      setNotes(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchNotes() }, [])

  async function handleCreate() {
    const note = await createNote()
    setNotes(prev => [note, ...prev])
    router.push(`/notes/${note.id}`)
  }

  async function handleDelete(e: React.MouseEvent, id: number) {
    e.stopPropagation()
    e.preventDefault()
    await deleteNote(id)
    const next = notes.filter(n => n.id !== id)
    setNotes(next)
    if (activeId === String(id)) {
      router.push(next.length > 0 ? `/notes/${next[0].id}` : '/notes')
    }
  }

  return (
    <aside
      className="h-full flex flex-col flex-shrink-0"
      style={{
        width: 240,
        backgroundColor: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border)',
      }}
    >
      <div className="flex items-center justify-between px-3 py-3">
        <span
          className="text-[11px] font-semibold tracking-widest uppercase"
          style={{ color: 'var(--text-3)' }}
        >
          Notes{notes.length > 0 ? ` · ${notes.length}` : ''}
        </span>
        <button
          onClick={handleCreate}
          className="text-[11px] font-medium px-2 py-1 rounded-[4px] leading-none cursor-pointer hover:opacity-80 transition-opacity"
          style={{ backgroundColor: 'var(--btn-primary)', color: '#fff' }}
        >
          + New
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="px-3 py-2 text-[12px]" style={{ color: 'var(--text-3)' }}>
            Loading…
          </p>
        ) : notes.length === 0 ? (
          <p className="px-3 py-2 text-[12px]" style={{ color: 'var(--text-3)' }}>
            No notes yet
          </p>
        ) : (
          notes.map(note => {
            const isActive = String(note.id) === activeId
            return (
              <div
                key={note.id}
                onClick={() => router.push(`/notes/${note.id}`)}
                onMouseEnter={() => setHoveredId(note.id)}
                onMouseLeave={() => setHoveredId(null)}
                className="flex items-start gap-1 px-3 py-2 cursor-pointer"
                style={{
                  backgroundColor: isActive
                    ? 'var(--bg-active)'
                    : hoveredId === note.id
                      ? 'var(--bg-hover)'
                      : 'transparent',
                  borderLeft: isActive
                    ? '2px solid var(--active-bar)'
                    : '2px solid transparent',
                }}
              >
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[12px] font-medium truncate"
                    style={{ color: 'var(--text-1)' }}
                  >
                    {note.title || 'Untitled'}
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>
                    {formatDate(note.updated_at)}
                  </p>
                </div>
                {hoveredId === note.id && (
                  <button
                    onClick={e => handleDelete(e, note.id)}
                    className="flex-shrink-0 text-[16px] leading-none opacity-40 hover:opacity-80 transition-opacity cursor-pointer mt-0.5"
                    style={{ color: 'var(--text-2)' }}
                    title="Delete note"
                  >
                    ×
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>
    </aside>
  )
}
