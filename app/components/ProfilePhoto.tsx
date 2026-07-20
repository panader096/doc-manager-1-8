'use client'

import { useEffect, useRef, useState } from 'react'
import { getProfilePhotoUrl, uploadProfilePhoto, removeProfilePhoto } from '../lib/profile'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

export default function ProfilePhoto() {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getProfilePhotoUrl().then(url => {
      setPhotoUrl(url)
      setLoading(false)
    })
  }, [])

  async function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError('Unsupported image type.')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('Image must be 5MB or smaller.')
      return
    }

    setError(null)
    setUploading(true)
    try {
      const url = await uploadProfilePhoto(file)
      setPhotoUrl(url)
    } catch {
      setError('Failed to upload photo.')
    } finally {
      setUploading(false)
    }
  }

  async function handleRemove() {
    setUploading(true)
    try {
      await removeProfilePhoto()
      setPhotoUrl(null)
    } catch {
      setError('Failed to remove photo.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center border"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-hover)' }}
      >
        {loading ? null : photoUrl ? (
          <img src={photoUrl} alt="Profile photo" className="w-full h-full object-cover" />
        ) : (
          <span className="text-[10px] text-center px-1" style={{ color: 'var(--text-3)' }}>
            No photo
          </span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        onChange={handleSelect}
        className="hidden"
      />
      <div className="flex gap-2">
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading || loading}
          className="text-[11px] rounded-[4px] border px-2 py-1 transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
          style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
        >
          {uploading ? 'Uploading…' : photoUrl ? 'Replace' : 'Add photo'}
        </button>
        {photoUrl && (
          <button
            onClick={handleRemove}
            disabled={uploading}
            className="text-[11px] rounded-[4px] border px-2 py-1 transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
            style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
          >
            Remove
          </button>
        )}
      </div>

      {error && <p className="text-[11px] text-red-500">{error}</p>}
    </div>
  )
}
