'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import {
  getNotes, createNote, deleteNote,
  getCollections, createCollection,
  NoteListItem, Collection,
} from '../lib/db'

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
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed] = useState<Set<number | 'uncollected'>>(new Set())
  const [newCollectionMode, setNewCollectionMode] = useState(false)
  const [newCollectionName, setNewCollectionName] = useState('')
  const newCollectionInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const pathname = usePathname()

  const activeId = pathname.startsWith('/notes/') ? pathname.slice('/notes/'.length) : null

  async function fetchAll() {
    try {
      const [notesData, collectionsData] = await Promise.all([getNotes(), getCollections()])
      setNotes(notesData)
      setCollections(collectionsData)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
    window.addEventListener('notes-updated', fetchAll)
    return () => window.removeEventListener('notes-updated', fetchAll)
  }, [])

  useEffect(() => {
    if (newCollectionMode) newCollectionInputRef.current?.focus()
  }, [newCollectionMode])

  function toggleActiveTag(tag: string) {
    setActiveTags(prev => {
      const next = new Set(prev)
      next.has(tag) ? next.delete(tag) : next.add(tag)
      return next
    })
  }

  function toggleCollapse(key: number | 'uncollected') {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const allTags = Array.from(new Set(notes.flatMap(n => n.tags))).sort()

  const filteredNotes = notes.filter(n => {
    const q = !query ||
      n.title.toLowerCase().includes(query.toLowerCase()) ||
      n.body.toLowerCase().includes(query.toLowerCase())
    const t = activeTags.size === 0 || [...activeTags].every(tag => n.tags.includes(tag))
    return q && t
  })

  const notesByCollection = new Map<number, NoteListItem[]>()
  const uncollectedNotes: NoteListItem[] = []
  for (const note of filteredNotes) {
    if (note.collection_id != null) {
      notesByCollection.set(note.collection_id, [...(notesByCollection.get(note.collection_id) ?? []), note])
    } else {
      uncollectedNotes.push(note)
    }
  }

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

  async function handleCreateCollection() {
    if (!newCollectionName.trim()) return
    const collection = await createCollection(newCollectionName.trim())
    setCollections(prev => [...prev, collection].sort((a, b) => a.name.localeCompare(b.name)))
    setNewCollectionName('')
    setNewCollectionMode(false)
  }

  function cancelNewCollection() {
    setNewCollectionMode(false)
    setNewCollectionName('')
  }

  function renderNoteRow(note: NoteListItem) {
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
          <p className="text-[12px] font-medium truncate" style={{ color: 'var(--text-1)' }}>
            {note.title || 'Untitled'}
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>
            {formatDate(note.updated_at)}
          </p>
          {note.tags.length > 0 && (
            <div className="flex flex-wrap gap-0.5 mt-1">
              {note.tags.map(tag => (
                <span
                  key={tag}
                  className="text-[10px] px-1.5 py-px rounded-[4px] border font-mono"
                  style={{
                    backgroundColor: 'var(--tag-bg)',
                    color: 'var(--tag-text)',
                    borderColor: 'var(--tag-border)',
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
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
  }

  function renderGroup(key: number | 'uncollected', label: string, groupNotes: NoteListItem[]) {
    const isCollapsed = collapsed.has(key)
    return (
      <div key={key}>
        <button
          onClick={() => toggleCollapse(key)}
          className="w-full flex items-center gap-1 px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider transition-colors"
          style={{ color: 'var(--text-2)' }}
        >
          <span className="text-[10px] font-normal">{isCollapsed ? '▸' : '▾'}</span>
          <span className="truncate">{label}</span>
          <span className="font-normal ml-0.5 normal-case tracking-normal" style={{ color: 'var(--text-3)' }}>
            ({groupNotes.length})
          </span>
        </button>
        {!isCollapsed && (
          groupNotes.length === 0 ? (
            <p className="px-3 py-2 text-[12px] italic" style={{ color: 'var(--text-3)' }}>
              Empty
            </p>
          ) : (
            groupNotes.map(renderNoteRow)
          )
        )}
      </div>
    )
  }

  return (
    <aside
      className="h-full flex flex-col flex-shrink-0"
      style={{
        width: 260,
        backgroundColor: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border)',
      }}
    >
      <div className="px-3 pt-3 pb-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: 'var(--text-3)' }}>
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

        {newCollectionMode ? (
          <div>
            <input
              ref={newCollectionInputRef}
              value={newCollectionName}
              onChange={e => setNewCollectionName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreateCollection()
                if (e.key === 'Escape') cancelNewCollection()
              }}
              placeholder="Collection name…"
              className="w-full text-[12px] rounded-[4px] border px-2 py-1 outline-none"
              style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
            />
            <div className="flex gap-1.5 mt-1.5">
              <button
                onClick={handleCreateCollection}
                className="flex-1 text-[11px] font-medium rounded-[4px] px-2 py-1 hover:opacity-80 transition-opacity"
                style={{ backgroundColor: 'var(--text-1)', color: 'var(--bg-app)' }}
              >
                Create
              </button>
              <button
                onClick={cancelNewCollection}
                className="flex-1 text-[11px] rounded-[4px] border px-2 py-1 transition-colors"
                style={{ color: 'var(--text-2)', borderColor: 'var(--border)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setNewCollectionMode(true)}
            className="text-[11px] text-left transition-colors"
            style={{ color: 'var(--text-3)' }}
          >
            + New collection
          </button>
        )}
      </div>

      <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <input
          type="search"
          placeholder="Search notes…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full text-[13px] rounded-[4px] border px-2.5 py-1.5 outline-none"
          style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
        />
      </div>

      {allTags.length > 0 && (
        <div className="px-3 py-2 flex flex-wrap gap-1" style={{ borderBottom: '1px solid var(--border)' }}>
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => toggleActiveTag(tag)}
              className="text-[11px] px-2 py-px rounded-[4px] border font-mono transition-colors"
              style={
                activeTags.has(tag)
                  ? { backgroundColor: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' }
                  : { backgroundColor: 'var(--tag-bg)', color: 'var(--tag-text)', borderColor: 'var(--tag-border)' }
              }
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="px-3 py-2 text-[12px]" style={{ color: 'var(--text-3)' }}>
            Loading…
          </p>
        ) : notes.length === 0 ? (
          <p className="px-3 py-2 text-[12px]" style={{ color: 'var(--text-3)' }}>
            No notes yet
          </p>
        ) : filteredNotes.length === 0 ? (
          <div className="px-3 mt-6 text-center">
            <p className="text-[12px] font-medium" style={{ color: 'var(--text-2)' }}>No results</p>
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-3)' }}>
              Try adjusting your search or tag filters.
            </p>
          </div>
        ) : (
          <>
            {collections.map(collection =>
              renderGroup(collection.id, collection.name, notesByCollection.get(collection.id) ?? [])
            )}
            {renderGroup('uncollected', 'Uncollected', uncollectedNotes)}
          </>
        )}
      </div>
    </aside>
  )
}
