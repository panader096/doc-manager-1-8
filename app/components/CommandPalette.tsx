'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getDocuments, deleteDocument, Doc } from '../lib/documents';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [docs, setDocs] = useState<Doc[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  function loadDocs() {
    setDocs(
      getDocuments()
        .filter((d) => !d.deletedAt)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    );
  }

  useEffect(() => {
    function handleGlobalKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => {
          if (!prev) { loadDocs(); setQuery(''); setSelectedIndex(0); }
          return !prev;
        });
      }
    }
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const refresh = () => loadDocs();
    window.addEventListener('docs-updated', refresh);
    return () => window.removeEventListener('docs-updated', refresh);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const filtered = docs.filter((d) =>
    d.title.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => { setSelectedIndex(0); }, [query]);

  function close() { setOpen(false); setQuery(''); }

  function navigate(id: string, mode?: 'edit') {
    close();
    router.push(mode === 'edit' ? `/docs/${id}?mode=edit` : `/docs/${id}`);
  }

  function handleDelete(docId: string) {
    deleteDocument(docId);
    window.dispatchEvent(new Event('docs-updated'));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case 'Escape': close(); break;
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        if (filtered[selectedIndex]) navigate(filtered[selectedIndex].id);
        break;
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-[15vh] px-4"
      onClick={close}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-[6px] border"
        style={{
          backgroundColor: 'var(--bg-modal)',
          borderColor: 'var(--border)',
          boxShadow: 'var(--shadow-modal)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search documents…"
          className="w-full px-4 py-3 text-[13px] outline-none bg-transparent border-b"
          style={{
            borderColor: 'var(--border)',
            color: 'var(--text-1)',
          }}
        />

        <div className="max-h-80 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-[13px] text-center" style={{ color: 'var(--text-3)' }}>
              {query ? `No documents matching "${query}"` : 'No documents yet'}
            </p>
          ) : (
            filtered.map((doc, i) => (
              <div
                key={doc.id}
                className="flex items-center px-3 py-[7px] gap-2 cursor-pointer"
                style={i === selectedIndex ? { backgroundColor: 'var(--bg-active)' } : {}}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate" style={{ color: 'var(--text-1)' }}>
                    {doc.title || 'Untitled'}
                  </p>
                  <p className="font-mono text-[11px]" style={{ color: 'var(--text-3)' }}>
                    {timeAgo(doc.updatedAt)}
                  </p>
                </div>
                <div className="flex gap-0.5 flex-shrink-0">
                  <button
                    onClick={() => navigate(doc.id)}
                    className="text-[12px] px-2 py-1 rounded-[4px] transition-colors"
                    style={{ color: 'var(--text-2)' }}
                    onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                    onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '')}
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => navigate(doc.id, 'edit')}
                    className="text-[12px] px-2 py-1 rounded-[4px] transition-colors"
                    style={{ color: 'var(--text-2)' }}
                    onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                    onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '')}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(doc.id)}
                    className="text-[12px] px-2 py-1 rounded-[4px] transition-colors hover:text-red-500"
                    style={{ color: 'var(--text-2)' }}
                    onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                    onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '')}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-2 border-t flex gap-4 font-mono text-[11px]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}
        >
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  );
}
