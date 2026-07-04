'use client'

import { useEffect, useRef, useState } from 'react'
import { getNote, updateNote } from '../lib/notes'

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
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setLoading(true)
    setNotFound(false)
    setStatus('idle')
    if (debounceRef.current) clearTimeout(debounceRef.current)

    getNote(noteId).then(note => {
      if (!note) {
        setNotFound(true)
      } else {
        setTitle(note.title)
        setBody(note.body)
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
        setTimeout(() => setStatus(s => (s === 'saved' ? 'idle' : s)), 2000)
      } catch {
        setStatus('error')
      }
    }, 1000)
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
