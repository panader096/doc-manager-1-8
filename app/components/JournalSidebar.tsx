'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getEntries, getOrCreateTodayEntry, deleteEntry, searchEntries, JournalEntry } from '../lib/journal'

function formatEntryDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

function preview(text: string | null): string {
  const trimmed = text?.trim() ?? ''
  if (!trimmed) return 'No content yet'
  return trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed
}

export default function JournalSidebar() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [matchingIds, setMatchingIds] = useState<Set<number> | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light'
    return localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'
  })
  const router = useRouter()
  const pathname = usePathname()

  const activeId = pathname.startsWith('/journal/') ? pathname.slice('/journal/'.length) : null

  async function fetchEntries() {
    try {
      const data = await getEntries()
      setEntries(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEntries()
    window.addEventListener('journal-updated', fetchEntries)
    return () => window.removeEventListener('journal-updated', fetchEntries)
  }, [])

  useEffect(() => {
    if (!query.trim()) {
      setMatchingIds(null)
      return
    }
    const timer = setTimeout(() => {
      searchEntries(query).then(setMatchingIds)
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const filteredEntries = entries.filter(e => matchingIds === null || matchingIds.has(e.id))

  async function handleToday() {
    const entry = await getOrCreateTodayEntry()
    setEntries(prev => (prev.some(e => e.id === entry.id) ? prev : [entry, ...prev]))
    router.push(`/journal/${entry.id}`)
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
    await deleteEntry(id)
    const next = entries.filter(en => en.id !== id)
    setEntries(next)
    if (activeId === String(id)) {
      router.push(next.length > 0 ? `/journal/${next[0].id}` : '/journal')
    }
  }

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    localStorage.setItem('theme', next)
    document.documentElement.classList.toggle('dark', next === 'dark')
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
              Delete this entry?
            </p>
            <p className="text-[12px] mb-4" style={{ color: 'var(--text-2)' }}>
              This can&rsquo;t be undone.
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
            Entries{entries.length > 0 ? ` · ${entries.length}` : ''}
          </span>
          <button
            onClick={handleToday}
            className="text-[11px] font-medium px-2 py-1 rounded-[4px] leading-none cursor-pointer hover:opacity-80 transition-opacity"
            style={{ backgroundColor: 'var(--btn-primary)', color: '#fff' }}
          >
            Today
          </button>
        </div>
      </div>

      <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <input
          type="search"
          placeholder="Search entries…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full text-[13px] rounded-[4px] border px-2.5 py-1.5 outline-none"
          style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
        />
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
        ) : entries.length === 0 ? (
          <p className="px-3 py-2 text-[12px]" style={{ color: 'var(--text-3)' }}>
            No entries yet
          </p>
        ) : filteredEntries.length === 0 ? (
          <div className="px-3 mt-6 text-center">
            <p className="text-[12px] font-medium" style={{ color: 'var(--text-2)' }}>No results</p>
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-3)' }}>Try a different search.</p>
          </div>
        ) : (
          filteredEntries.map(entry => {
            const isActive = String(entry.id) === activeId
            return (
              <div
                key={entry.id}
                data-testid="journal-entry-row"
                onClick={() => router.push(`/journal/${entry.id}`)}
                onMouseEnter={() => setHoveredId(entry.id)}
                onMouseLeave={() => setHoveredId(null)}
                className="flex items-start gap-1 px-3 py-2 cursor-pointer"
                style={{
                  backgroundColor: isActive ? 'var(--bg-active)' : hoveredId === entry.id ? 'var(--bg-hover)' : 'transparent',
                  borderLeft: isActive ? '2px solid var(--active-bar)' : '2px solid transparent',
                }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium truncate" style={{ color: 'var(--text-1)' }}>
                    {formatEntryDate(entry.entry_date)}
                  </p>
                  <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-3)' }}>
                    {entry.title?.trim() || preview(entry.body)}
                  </p>
                </div>
                {hoveredId === entry.id && (
                  <button
                    onClick={e => handleDeleteClick(e, entry.id)}
                    aria-label="Delete entry"
                    className="flex-shrink-0 text-[16px] leading-none opacity-40 hover:opacity-80 transition-opacity cursor-pointer mt-0.5"
                    style={{ color: 'var(--text-2)' }}
                    title="Delete entry"
                  >
                    ×
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>

      <div className="px-3 py-2.5 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)' }}>
        <button
          onClick={toggleTheme}
          suppressHydrationWarning
          className="text-[12px] transition-colors"
          style={{ color: 'var(--text-2)' }}
        >
          {theme === 'light' ? 'Dark' : 'Light'}
        </button>
      </div>
    </aside>
  )
}
