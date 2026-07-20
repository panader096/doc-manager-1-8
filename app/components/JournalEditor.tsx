'use client'

import { useEffect, useRef, useState } from 'react'
import {
  getEntry,
  updateEntry,
  getEntryImageUrl,
  uploadEntryImage,
  removeEntryImage,
} from '../lib/journal'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

const STATUS_LABEL: Record<SaveStatus, string> = {
  idle: '',
  pending: 'Unsaved changes',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Failed to save',
}

function formatEntryDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

export default function JournalEditor({ entryId }: { entryId: string }) {
  const [entryDate, setEntryDate] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [imagePath, setImagePath] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageUploading, setImageUploading] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLoading(true)
    setNotFound(false)
    setStatus('idle')
    setImagePath(null)
    setImageUrl(null)
    setImageError(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)

    getEntry(entryId).then(entry => {
      if (!entry) {
        setNotFound(true)
      } else {
        setEntryDate(entry.entry_date)
        setTitle(entry.title ?? '')
        setBody(entry.body ?? '')
        setImagePath(entry.image_path)
        if (entry.image_path) {
          getEntryImageUrl(entry.image_path).then(setImageUrl)
        }
      }
    }).finally(() => setLoading(false))
  }, [entryId])

  function scheduleSave(newTitle: string, newBody: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setStatus('pending')

    debounceRef.current = setTimeout(async () => {
      setStatus('saving')
      try {
        await updateEntry(entryId, { title: newTitle, body: newBody })
        setStatus('saved')
        window.dispatchEvent(new Event('journal-updated'))
        setTimeout(() => setStatus(s => (s === 'saved' ? 'idle' : s)), 2000)
      } catch {
        setStatus('error')
      }
    }, 1000)
  }

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
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
    setImageUploading(true)
    try {
      const url = await uploadEntryImage(entryId, file)
      const entry = await getEntry(entryId)
      setImagePath(entry?.image_path ?? null)
      setImageUrl(url)
      window.dispatchEvent(new Event('journal-updated'))
    } catch {
      setImageError('Failed to upload image.')
    } finally {
      setImageUploading(false)
    }
  }

  async function handleImageRemove() {
    if (!imagePath) return
    setImageUploading(true)
    try {
      await removeEntryImage(entryId, imagePath)
      setImagePath(null)
      setImageUrl(null)
      window.dispatchEvent(new Event('journal-updated'))
    } catch {
      setImageError('Failed to remove image.')
    } finally {
      setImageUploading(false)
    }
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
        <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>Entry not found.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-10 pt-10 pb-1">
        <p className="text-[12px] font-mono" style={{ color: 'var(--text-3)' }}>
          {formatEntryDate(entryDate)}
        </p>
      </div>

      <div className="px-10 pt-2 pb-3">
        <input
          type="text"
          value={title}
          onChange={e => {
            setTitle(e.target.value)
            scheduleSave(e.target.value, body)
          }}
          placeholder="Untitled entry"
          className="w-full bg-transparent border-none outline-none text-[24px] font-bold leading-tight"
          style={{ color: 'var(--text-1)' }}
        />
      </div>

      <div className="px-10 pb-4 flex flex-wrap items-center gap-3">
        <input
          ref={imageInputRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(',')}
          onChange={handleImageSelect}
          className="hidden"
        />
        <button
          onClick={() => imageInputRef.current?.click()}
          disabled={imageUploading}
          className="text-[12px] rounded-[4px] border px-2 py-1 transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
          style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
        >
          {imageUploading ? 'Uploading…' : imagePath ? 'Replace image' : 'Add image'}
        </button>
      </div>

      {imageError && (
        <p className="px-10 pb-3 text-[12px] text-red-500">{imageError}</p>
      )}

      {imageUrl && (
        <div className="px-10 pb-4">
          <div className="relative inline-block">
            <img
              src={imageUrl}
              alt=""
              className="max-h-64 rounded-[6px] border"
              style={{ borderColor: 'var(--border)' }}
            />
            <button
              onClick={handleImageRemove}
              disabled={imageUploading}
              aria-label="Remove image"
              className="absolute top-1.5 right-1.5 text-[11px] rounded-[4px] px-1.5 py-0.5 disabled:opacity-50"
              style={{ backgroundColor: 'var(--bg-modal)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
            >
              Remove
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 px-10 pb-4">
        <textarea
          value={body}
          onChange={e => {
            setBody(e.target.value)
            scheduleSave(title, e.target.value)
          }}
          placeholder="Write about your day…"
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
