'use client'

import { useEffect, useRef, useState } from 'react'
import { getNote, updateNote, getCollections, setNoteCollection, setNoteTags, Collection, NoteTag } from '../lib/db'

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

const STATUS_LABEL: Record<SaveStatus, string> = {
  idle: '',
  pending: 'Unsaved changes',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Failed to save',
}

export default function NoteEditor({ noteId }: { noteId: string }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [collectionId, setCollectionId] = useState<number | null>(null)
  const [tags, setTags] = useState<NoteTag[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLoading(true)
    setNotFound(false)
    setStatus('idle')
    if (debounceRef.current) clearTimeout(debounceRef.current)

    Promise.all([getNote(noteId), getCollections()]).then(([note, cols]) => {
      setCollections(cols)
      if (!note) {
        setNotFound(true)
      } else {
        setTitle(note.title)
        setBody(note.body)
        setCollectionId(note.collection_id)
        setTags(note.tags)
      }
    }).finally(() => setLoading(false))
  }, [noteId])

  function scheduleSave(newTitle: string, newBody: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setStatus('pending')

    debounceRef.current = setTimeout(async () => {
      setStatus('saving')
      try {
        await updateNote(noteId, { title: newTitle, body: newBody })
        setStatus('saved')
        window.dispatchEvent(new Event('notes-updated'))
        setTimeout(() => setStatus(s => (s === 'saved' ? 'idle' : s)), 2000)
      } catch {
        setStatus('error')
      }
    }, 1000)
  }

  async function handleCollectionChange(value: string) {
    const newCollectionId = value === '' ? null : Number(value)
    setCollectionId(newCollectionId)
    await setNoteCollection(noteId, newCollectionId)
    window.dispatchEvent(new Event('notes-updated'))
  }

  async function applyTagChange(newTagNames: string[]) {
    await setNoteTags(noteId, newTagNames)
    const refreshed = await getNote(noteId)
    if (refreshed) setTags(refreshed.tags)
    window.dispatchEvent(new Event('notes-updated'))
  }

  async function handleTagInput(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' && e.key !== ',') return
    e.preventDefault()
    const input = tagInputRef.current
    if (!input) return
    const value = input.value.trim().replace(/,/g, '')
    const tagNames = tags.map(t => t.name)
    if (value && !tagNames.includes(value)) {
      await applyTagChange([...tagNames, value])
    }
    input.value = ''
  }

  async function removeTag(tagName: string) {
    await applyTagChange(tags.map(t => t.name).filter(name => name !== tagName))
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>Loading…</p>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>Note not found.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-10 pt-10 pb-3">
        <input
          type="text"
          value={title}
          onChange={e => {
            setTitle(e.target.value)
            scheduleSave(e.target.value, body)
          }}
          placeholder="Untitled"
          className="w-full bg-transparent border-none outline-none text-[24px] font-bold leading-tight"
          style={{ color: 'var(--text-1)' }}
        />
      </div>

      <div className="px-10 pb-4 flex flex-wrap items-center gap-3">
        <select
          value={collectionId ?? ''}
          onChange={e => handleCollectionChange(e.target.value)}
          className="text-[12px] rounded-[4px] border px-2 py-1 outline-none"
          style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
        >
          <option value="">No collection</option>
          {collections.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <div className="flex flex-wrap items-center gap-1">
          {tags.map(tag => (
            <span
              key={tag.name}
              className="flex items-center gap-1 text-[11px] px-1.5 py-px rounded-[4px] border font-mono"
              style={{
                backgroundColor: 'var(--tag-bg)',
                color: 'var(--tag-text)',
                borderColor: 'var(--tag-border)',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
              {tag.name}
              <button
                onClick={() => removeTag(tag.name)}
                aria-label={`Remove tag ${tag.name}`}
                className="opacity-60 hover:opacity-100 transition-opacity"
              >
                ×
              </button>
            </span>
          ))}
          <input
            ref={tagInputRef}
            placeholder={tags.length === 0 ? 'Add tag…' : ''}
            onKeyDown={handleTagInput}
            className="text-[11px] outline-none bg-transparent font-mono min-w-[60px]"
            style={{ color: 'var(--text-2)' }}
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 px-10 pb-4">
        <textarea
          value={body}
          onChange={e => {
            setBody(e.target.value)
            scheduleSave(title, e.target.value)
          }}
          placeholder="Start writing…"
          className="w-full h-full resize-none bg-transparent border-none outline-none text-[14px] leading-relaxed"
          style={{ color: 'var(--text-2)' }}
        />
      </div>

      <div className="px-10 pb-4 text-[11px]" style={{ color: 'var(--text-3)' }}>
        {STATUS_LABEL[status]}
      </div>
    </div>
  )
}
