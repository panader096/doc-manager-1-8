import { redirect } from 'next/navigation'
import { createClient } from '../lib/supabase/server'
import NotesSidebar from '../components/NotesSidebar'

export default async function NotesLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg-app)' }}>
      <NotesSidebar />
      <main className="flex-1 min-w-0 overflow-auto" style={{ backgroundColor: 'var(--bg-app)' }}>
        {children}
      </main>
    </div>
  )
}
