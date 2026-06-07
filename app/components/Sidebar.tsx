'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  getDocuments,
  createDocument,
  deleteDocument,
  toggleStar,
  exportWorkspace,
  importWorkspace,
  Doc,
} from '../lib/documents';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const activeId = pathname.startsWith('/docs/') ? pathname.split('/')[2] : undefined;

  const [docs, setDocs] = useState<Doc[]>([]);
  const [query, setQuery] = useState('');
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    return localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';
  });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function refresh() { setDocs(getDocuments()); }
    refresh();
    window.addEventListener('docs-updated', refresh);
    return () => window.removeEventListener('docs-updated', refresh);
  }, []);

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('theme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  }

  function toggleActiveTag(tag: string) {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  const allTags = Array.from(new Set(docs.flatMap((d) => d.tags ?? [])));

  const filtered = docs
    .filter((d) => {
      if (!d.title.toLowerCase().includes(query.toLowerCase())) return false;
      if (activeTags.size > 0) {
        return [...activeTags].every((t) => (d.tags ?? []).includes(t));
      }
      return true;
    })
    .sort((a, b) => {
      if (a.starred && !b.starred) return -1;
      if (!a.starred && b.starred) return 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });

  function handleNew() {
    const doc = createDocument();
    window.dispatchEvent(new Event('docs-updated'));
    router.push(`/docs/${doc.id}?new=1`);
  }

  function handleStar(id: string) {
    toggleStar(id);
    window.dispatchEvent(new Event('docs-updated'));
  }

  function handleDelete(id: string) {
    deleteDocument(id);
    window.dispatchEvent(new Event('docs-updated'));
    setConfirmId(null);
    if (activeId === id) router.push('/docs');
  }

  function handleExport() {
    const blob = new Blob([exportWorkspace()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'documents-workspace.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const incoming = JSON.parse(reader.result as string) as Doc[];
        if (!Array.isArray(incoming)) throw new Error();
        importWorkspace(incoming);
        window.dispatchEvent(new Event('docs-updated'));
      } catch {
        // silently ignore malformed files
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  return (
    <aside className="w-64 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* New document */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={handleNew}
          className="w-full text-sm font-medium bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-md px-3 py-2 hover:bg-gray-700 dark:hover:bg-gray-300 transition-colors"
        >
          + New document
        </button>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <input
          type="search"
          placeholder="Search documents…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setConfirmId(null); }}
          className="w-full text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md px-3 py-1.5 outline-none focus:border-gray-400 dark:focus:border-gray-400 placeholder-gray-400 dark:text-gray-200"
        />
      </div>

      {/* Tag filter */}
      {allTags.length > 0 && (
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex flex-wrap gap-1">
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleActiveTag(tag)}
              className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                activeTags.has(tag)
                  ? 'bg-blue-500 text-white'
                  : 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Document list */}
      <nav className="flex-1 overflow-y-auto">
        {docs.length === 0 ? (
          <div className="px-4 mt-10 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">No documents yet</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Click &ldquo;+ New document&rdquo; to get started.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 mt-10 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">No results</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Try adjusting your search or tag filters.
            </p>
          </div>
        ) : (
          <ul>
            {filtered.map((doc) => (
              <li
                key={doc.id}
                className={`border-b border-gray-100 dark:border-gray-700 ${
                  activeId === doc.id ? 'bg-gray-100 dark:bg-gray-800' : ''
                }`}
              >
                {confirmId === doc.id ? (
                  <div className="px-3 py-2.5">
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                      Delete &ldquo;{doc.title || 'Untitled'}&rdquo;?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="flex-1 text-xs font-medium bg-red-600 text-white rounded px-2 py-1 hover:bg-red-700 transition-colors"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        className="flex-1 text-xs text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600 rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start group">
                    {/* Star */}
                    <button
                      onClick={() => handleStar(doc.id)}
                      aria-label={doc.starred ? 'Unstar' : 'Star'}
                      className={`pl-2 pr-1 pt-2.5 text-base leading-none transition-colors flex-shrink-0 ${
                        doc.starred
                          ? 'text-amber-400'
                          : 'text-gray-200 dark:text-gray-700 opacity-0 group-hover:opacity-100 hover:text-amber-300'
                      }`}
                    >
                      ★
                    </button>

                    <Link
                      href={`/docs/${doc.id}`}
                      className="flex flex-col flex-1 px-1 py-2 min-w-0"
                    >
                      <span
                        className={`text-sm text-gray-900 dark:text-gray-100 truncate ${
                          activeId === doc.id ? 'font-medium' : ''
                        }`}
                      >
                        {doc.title || 'Untitled'}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {timeAgo(doc.updatedAt)}
                      </span>
                      {doc.tags && doc.tags.length > 0 && (
                        <div className="flex flex-wrap gap-0.5 mt-1">
                          {doc.tags.map((tag) => (
                            <span
                              key={tag}
                              className="text-[10px] px-1.5 py-0.5 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-full"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </Link>

                    {/* Delete */}
                    <button
                      onClick={() => setConfirmId(doc.id)}
                      aria-label="Delete document"
                      className="mr-2 mt-2.5 p-1 rounded text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-all flex-shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2">
        <div className="flex gap-1">
          <button
            onClick={handleExport}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors px-2 py-1 rounded border border-gray-200 dark:border-gray-600"
          >
            Export
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors px-2 py-1 rounded border border-gray-200 dark:border-gray-600"
          >
            Import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
        </div>
        <button
          onClick={toggleTheme}
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors px-2 py-1 rounded border border-gray-200 dark:border-gray-600"
        >
          {theme === 'light' ? 'Dark' : 'Light'}
        </button>
      </div>
    </aside>
  );
}
