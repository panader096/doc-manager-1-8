import Link from 'next/link'
import { createClient } from '../lib/supabase/server'

const APPS = [
  { name: 'Sprint 1 - Document Manager', description: 'Documents, folders, and Markdown export.', href: '/docs' },
  { name: 'Sprint 2 - Notes app', description: 'Collections, tags, search, and more.', href: '/notes' },
  { name: 'Sprint 3 - Personal Journal', description: 'A private space for daily entries.', href: '/journal' },
]

export default async function WorkspacePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="flex flex-col items-center gap-8 px-6" style={{ paddingTop: '12vh' }}>
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-[20px] font-bold" style={{ color: 'var(--text-1)' }}>
          Welcome to your workspace
        </h1>
        <p className="text-[13px]" style={{ color: 'var(--text-2)' }}>
          Signed in as {user?.email}
        </p>
      </div>

      <div className="flex flex-col gap-2 w-full max-w-sm">
        {APPS.map(app => (
          <Link
            key={app.href}
            href={app.href}
            className="flex flex-col gap-0.5 rounded-[8px] border p-4 transition-colors hover:bg-[var(--bg-hover)]"
            style={{ backgroundColor: 'var(--bg-modal)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-modal)' }}
          >
            <span className="text-[14px] font-semibold" style={{ color: 'var(--text-1)' }}>
              {app.name}
            </span>
            <span className="text-[12px]" style={{ color: 'var(--text-3)' }}>
              {app.description}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
