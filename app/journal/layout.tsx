import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '../lib/supabase/server'
import { signOutAction } from '../lib/auth'

export default async function JournalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-app)' }}>
      <header
        className="flex items-center justify-between px-6 py-3"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <Link
          href="/workspace"
          className="text-[12px] font-medium transition-colors"
          style={{ color: 'var(--text-2)' }}
        >
          ← Workspace
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-[13px]" style={{ color: 'var(--text-2)' }}>
            {user.email}
          </span>
          <form action={signOutAction}>
            <button
              type="submit"
              className="text-[12px] font-medium rounded-[4px] border px-2.5 py-1 transition-colors"
              style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}
