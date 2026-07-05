import Link from 'next/link'
import { signInAction, signInWithGoogleAction, signInWithGitHubAction } from '../lib/auth'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>
}) {
  const { error, message } = await searchParams

  return (
    <div className="flex h-screen items-center justify-center" style={{ backgroundColor: 'var(--bg-app)' }}>
      <div
        className="w-full max-w-sm rounded-[8px] border p-6"
        style={{ backgroundColor: 'var(--bg-modal)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-modal)' }}
      >
        <h1 className="text-[18px] font-bold mb-5" style={{ color: 'var(--text-1)' }}>
          Sign in
        </h1>

        {error && (
          <p className="text-[12px] mb-4 text-red-500">{error}</p>
        )}
        {message && (
          <p className="text-[12px] mb-4" style={{ color: 'var(--accent)' }}>{message}</p>
        )}

        <form action={signInAction} className="flex flex-col gap-3">
          <input
            type="email"
            name="email"
            placeholder="Email"
            required
            className="text-[13px] rounded-[4px] border px-2.5 py-1.5 outline-none"
            style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
          />
          <input
            type="password"
            name="password"
            placeholder="Password"
            required
            className="text-[13px] rounded-[4px] border px-2.5 py-1.5 outline-none"
            style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
          />
          <button
            type="submit"
            className="text-[13px] font-medium rounded-[4px] px-3 py-2 hover:opacity-90 transition-opacity"
            style={{ backgroundColor: 'var(--btn-primary)', color: '#fff' }}
          >
            Sign in
          </button>
        </form>

        <p className="text-[12px] mt-2 text-right">
          <Link href="/forgot-password" className="underline" style={{ color: 'var(--text-3)' }}>
            Forgot your password?
          </Link>
        </p>

        <div className="flex items-center gap-2 my-4">
          <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border)' }} />
          <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>or</span>
          <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border)' }} />
        </div>

        <form action={signInWithGoogleAction}>
          <button
            type="submit"
            className="w-full text-[13px] font-medium rounded-[4px] border px-3 py-2 transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
          >
            Sign in with Google
          </button>
        </form>

        <form action={signInWithGitHubAction} className="mt-2">
          <button
            type="submit"
            className="w-full text-[13px] font-medium rounded-[4px] border px-3 py-2 transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
          >
            Sign in with GitHub
          </button>
        </form>

        <p className="text-[12px] mt-5 text-center" style={{ color: 'var(--text-2)' }}>
          Don&rsquo;t have an account?{' '}
          <Link href="/signup" className="underline" style={{ color: 'var(--accent)' }}>
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
