import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-6">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
          Document Manager
        </h1>
        <p className="mt-4 text-gray-500 leading-relaxed">
          A personal workspace for your notes and documents. Create, edit, and
          find everything in one place — all stored in your browser.
        </p>
        <Link
          href="/docs"
          className="mt-8 inline-block bg-gray-900 text-white text-sm font-medium px-6 py-3 rounded-md hover:bg-gray-700 transition-colors"
        >
          Open workspace →
        </Link>
      </div>
    </div>
  );
}
