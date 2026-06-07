import Link from 'next/link';

export default function Home() {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen px-6"
      style={{ backgroundColor: 'var(--bg-sidebar)' }}
    >
      <div className="max-w-md text-center">
        <h1 className="text-[28px] font-bold tracking-tight" style={{ color: 'var(--text-1)' }}>
          Document Manager
        </h1>
        <p className="mt-4 text-[13px] leading-relaxed" style={{ color: 'var(--text-2)' }}>
          A personal workspace for your notes and documents. Create, edit, and
          find everything in one place — all stored in your browser.
        </p>
        <Link
          href="/docs"
          className="mt-8 inline-block text-[13px] font-medium px-6 py-3 rounded-[4px] text-white hover:opacity-90 transition-opacity"
          style={{ backgroundColor: 'var(--btn-primary)' }}
        >
          Open workspace →
        </Link>
      </div>
    </div>
  );
}
