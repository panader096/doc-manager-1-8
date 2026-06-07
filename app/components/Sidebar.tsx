'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getDocuments, createDocument, Doc } from '../lib/documents';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Sidebar({ activeId }: { activeId?: string }) {
  const router = useRouter();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    setDocs(getDocuments());
  }, [activeId]);

  const filtered = docs
    .filter((d) => d.title.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  function handleNew() {
    const doc = createDocument();
    setDocs(getDocuments());
    router.push(`/docs/${doc.id}`);
  }

  return (
    <aside className="w-64 flex-shrink-0 border-r border-gray-200 flex flex-col h-full bg-gray-50">
      <div className="p-3 border-b border-gray-200">
        <button
          onClick={handleNew}
          className="w-full text-sm font-medium bg-gray-900 text-white rounded-md px-3 py-2 hover:bg-gray-700 transition-colors"
        >
          + New document
        </button>
      </div>

      <div className="p-3 border-b border-gray-200">
        <input
          type="search"
          placeholder="Search documents…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full text-sm bg-white border border-gray-200 rounded-md px-3 py-1.5 outline-none focus:border-gray-400 placeholder-gray-400"
        />
      </div>

      <nav className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-xs text-gray-400 text-center mt-8 px-3">
            {query ? 'No documents match your search.' : 'No documents yet.'}
          </p>
        ) : (
          <ul>
            {filtered.map((doc) => (
              <li key={doc.id}>
                <Link
                  href={`/docs/${doc.id}`}
                  className={`flex flex-col px-3 py-2.5 border-b border-gray-100 hover:bg-gray-100 transition-colors ${
                    activeId === doc.id ? 'bg-gray-100 font-medium' : ''
                  }`}
                >
                  <span className="text-sm text-gray-900 truncate">
                    {doc.title || 'Untitled'}
                  </span>
                  <span className="text-xs text-gray-400 mt-0.5">
                    {timeAgo(doc.updatedAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </nav>
    </aside>
  );
}
