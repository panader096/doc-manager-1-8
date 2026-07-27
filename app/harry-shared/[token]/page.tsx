import { notFound } from 'next/navigation'
import { createClient } from '../../lib/supabase/server'

export default async function SharedHarryMessagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createClient()
  // Goes through get_shared_reviewer_message(), not a direct table query --
  // the token must be supplied server-side to get anything back, and
  // share_token is never selectable by anon at all. See migration 0027.
  const { data } = await supabase.rpc('get_shared_reviewer_message', { p_token: token })
  const message = data?.[0] as { content: string; created_at: string } | undefined
  if (!message) notFound()

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: 'var(--bg-app)' }}>
      <div
        className="max-w-lg w-full rounded-[10px] p-6"
        style={{ backgroundColor: 'var(--bg-modal)', boxShadow: 'var(--shadow-modal)' }}
      >
        <p className="text-[11px] uppercase tracking-widest mb-3" style={{ color: 'var(--text-3)' }}>
          Shared answer from Harry
        </p>
        <p className="text-[14px] whitespace-pre-wrap" style={{ color: 'var(--text-1)' }}>
          {message.content}
        </p>
      </div>
    </div>
  )
}
