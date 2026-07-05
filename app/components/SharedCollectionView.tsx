'use client'

import { useEffect, useState } from 'react'
import { getSharedCollection, getNoteImageUrl, Collection, NoteListItem } from '../lib/db'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function SharedCollectionView({ token }: { token: string }) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<{ collection: Collection; notes: NoteListItem[] } | null>(null)
  const [imageUrls, setImageUrls] = useState<Record<number, string>>({})

  useEffect(() => {
    getSharedCollection(token).then(async result => {
      setData(result)
      setLoading(false)
      if (!result) return

      const withImages = result.notes.filter(note => note.image_path)
      const entries = await Promise.all(
        withImages.map(async note => [note.id, await getNoteImageUrl(note.image_path!)] as const),
      )
      const urls: Record<number, string> = {}
      for (const [id, url] of entries) if (url) urls[id] = url
      setImageUrls(urls)
    })
  }, [token])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ backgroundColor: 'var(--bg-app)' }}>
        <p className="text-[13px]" style={{ color: 'var(--text-3)' }}>Loading…</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ backgroundColor: 'var(--bg-app)' }}>
        <p className="text-[13px]" style={{ color: 'var(--text-3)' }}>
          This share link is invalid or no longer active.
        </p>
      </div>
    )
  }

  const { collection, notes } = data

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-app)' }}>
      <div className="max-w-2xl mx-auto px-6 py-10">
        <p className="text-[11px] font-semibold tracking-widest uppercase mb-1" style={{ color: 'var(--text-3)' }}>
          Shared collection
        </p>
        <h1 className="text-[24px] font-bold mb-8" style={{ color: 'var(--text-1)' }}>
          {collection.name}
        </h1>

        {notes.length === 0 ? (
          <p className="text-[13px]" style={{ color: 'var(--text-3)' }}>This collection has no notes.</p>
        ) : (
          <div className="flex flex-col gap-8">
            {notes.map(note => (
              <article key={note.id} className="pb-8" style={{ borderBottom: '1px solid var(--border)' }}>
                <h2 className="text-[16px] font-semibold mb-1" style={{ color: 'var(--text-1)' }}>
                  {note.title || 'Untitled'}
                </h2>
                <p className="text-[11px] mb-3" style={{ color: 'var(--text-3)' }}>
                  Updated {formatDate(note.updated_at)}
                </p>
                {imageUrls[note.id] && (
                  <img
                    src={imageUrls[note.id]}
                    alt=""
                    className="max-h-64 rounded-[6px] border mb-3"
                    style={{ borderColor: 'var(--border)' }}
                  />
                )}
                <p className="text-[14px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-2)' }}>
                  {note.body}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
