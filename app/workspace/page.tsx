import { createClient } from '../lib/supabase/server'

export default async function WorkspacePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6" style={{ paddingTop: '15vh' }}>
      <h1 className="text-[20px] font-bold" style={{ color: 'var(--text-1)' }}>
        Welcome to your workspace
      </h1>
      <p className="text-[13px]" style={{ color: 'var(--text-2)' }}>
        Signed in as {user?.email}
      </p>
    </div>
  )
}
