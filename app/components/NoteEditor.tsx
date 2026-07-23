'use client'

import { useEffect, useRef, useState } from 'react'
import {
  getNote,
  updateNote,
  getCollections,
  setNoteCollection,
  setNoteTags,
  getNoteImageUrl,
  uploadNoteImage,
  removeNoteImage,
  Collection,
  NoteTag,
} from '../lib/db'
import { reembedNoteAction } from '../lib/embeddings-actions'

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

export default function NoteEditor({ noteId }: { noteId: string }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [collectionId, setCollectionId] = useState<number | null>(null)
  const [tags, setTags] = useState<NoteTag[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [imagePath, setImagePath] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageUploading, setImageUploading] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLoading(true)
    setNotFound(false)
    setStatus('idle')
    setImagePath(null)
    setImageUrl(null)
    setImageError(null)
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
        setImagePath(note.image_path)
        if (note.image_path) {
          getNoteImageUrl(note.image_path).then(setImageUrl)
        }
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
        // Re-embedding runs after the note itself is safely saved, and its
        // success/failure is independent of save status -- a slow or failed
        // OpenRouter call must never block typing or show "Failed to save".
        reembedNoteAction(Number(noteId)).catch(err => console.error('Failed to re-embed note', err))
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

  function handleExportMarkdown() {
    const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled'
    const markdown = `# ${title || 'Untitled'}\n\n${body}`
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slug}.md`
    a.click()
    URL.revokeObjectURL(url)
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
      const url = await uploadNoteImage(noteId, file)
      const note = await getNote(noteId)
      setImagePath(note?.image_path ?? null)
      setImageUrl(url)
      window.dispatchEvent(new Event('notes-updated'))
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
      await removeNoteImage(noteId, imagePath)
      setImagePath(null)
      setImageUrl(null)
      window.dispatchEvent(new Event('notes-updated'))
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
          className="ml-auto text-[12px] rounded-[4px] border px-2 py-1 transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
          style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
        >
          {imageUploading ? 'Uploading…' : imagePath ? 'Replace image' : 'Add image'}
        </button>

        <button
          onClick={handleExportMarkdown}
          className="text-[12px] rounded-[4px] border px-2 py-1 transition-colors hover:bg-[var(--bg-hover)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
          title="Download this note as a .md file"
        >
          Export .md
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
