import { notFound } from 'next/navigation'
import { createClient } from '../../lib/supabase/server'

export default async function SharedHarryMessagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('reviewer_shares')
    .select('reviewer_messages(content, created_at)')
    .eq('share_token', token)
    .maybeSingle()

  const message = data?.reviewer_messages as unknown as { content: string; created_at: string } | undefined
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
