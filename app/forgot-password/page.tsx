import Link from 'next/link'
import { requestPasswordResetAction } from '../lib/auth'

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; error?: string }>
}) {
  const { message, error } = await searchParams

  return (
    <div className="flex h-screen items-center justify-center" style={{ backgroundColor: 'var(--bg-app)' }}>
      <div
        className="w-full max-w-sm rounded-[8px] border p-6"
        style={{ backgroundColor: 'var(--bg-modal)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-modal)' }}
      >
        <h1 className="text-[18px] font-bold mb-2" style={{ color: 'var(--text-1)' }}>
          Reset your password
        </h1>
        <p className="text-[12px] mb-5" style={{ color: 'var(--text-2)' }}>
          Enter your email and we&rsquo;ll send you a link to reset your password.
        </p>

        {error && (
          <p className="text-[12px] mb-4 text-red-500">{error}</p>
        )}
        {message && (
          <p className="text-[12px] mb-4" style={{ color: 'var(--accent)' }}>{message}</p>
        )}

        <form action={requestPasswordResetAction} className="flex flex-col gap-3">
          <input
            type="email"
            name="email"
            placeholder="Email"
            required
            className="text-[13px] rounded-[4px] border px-2.5 py-1.5 outline-none"
            style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
          />
          <button
            type="submit"
            className="text-[13px] font-medium rounded-[4px] px-3 py-2 hover:opacity-90 transition-opacity"
            style={{ backgroundColor: 'var(--btn-primary)', color: '#fff' }}
          >
            Send reset link
          </button>
        </form>

        <p className="text-[12px] mt-5 text-center" style={{ color: 'var(--text-2)' }}>
          <Link href="/login" className="underline" style={{ color: 'var(--accent)' }}>
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
