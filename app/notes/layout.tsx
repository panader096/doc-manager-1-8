'use client'

import NotesSidebar from '../components/NotesSidebar'

export default function NotesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg-app)' }}>
      <NotesSidebar />
      <main className="flex-1 min-w-0 overflow-auto" style={{ backgroundColor: 'var(--bg-app)' }}>
        {children}
      </main>
    </div>
  )
}
