'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getDocument, updateDocument, Doc } from '../../lib/documents';

const AUTOSAVE_DELAY = 400;

// ── Markdown parser ──────────────────────────────────────────────────────────
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function applyInline(line: string): string {
  return escapeHtml(line)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

function parseMarkdown(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let inList = false;

  for (const line of lines) {
    if (line.startsWith('### ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h3>${applyInline(line.slice(4))}</h3>`);
    } else if (line.startsWith('## ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h2>${applyInline(line.slice(3))}</h2>`);
    } else if (line.startsWith('# ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h1>${applyInline(line.slice(2))}</h1>`);
    } else if (line.startsWith('- ')) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${applyInline(line.slice(2))}</li>`);
    } else if (line.trim() === '') {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push('<br>');
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<p>${applyInline(line)}</p>`);
    }
  }
  if (inList) out.push('</ul>');
  return out.join('');
}
// ────────────────────────────────────────────────────────────────────────────

export default function DocPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const [doc, setDoc] = useState<Doc | null | undefined>(undefined);
  const [mode, setMode] = useState<'edit' | 'preview'>(
    searchParams.get('new') === '1' ? 'edit' : 'preview'
  );
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const found = getDocument(id);
    setDoc(found ?? null);
  }, [id]);

  function handleChange(field: 'title' | 'body', value: string) {
    if (!doc) return;
    setDoc({ ...doc, [field]: value, updatedAt: new Date().toISOString() });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      updateDocument(id, { [field]: value });
      window.dispatchEvent(new Event('docs-updated'));
    }, AUTOSAVE_DELAY);
  }

  function handleTitleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      bodyRef.current?.focus();
    }
  }

  if (doc === undefined) return null;

  if (doc === null) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
        <p className="text-gray-900 font-medium">Document not found</p>
        <p className="text-sm text-gray-400">
          This document may have been deleted or the link is incorrect.
        </p>
        <Link href="/docs" className="text-sm text-blue-600 hover:underline mt-1">
          ← Back to workspace
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full px-6 md:px-10 py-8 max-w-3xl mx-auto w-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6">
        <span className="text-xs text-gray-400">
          {mode === 'edit'
            ? 'Tip: # Heading · **bold** · *italic* · - list'
            : 'Preview mode — click Edit to make changes'}
        </span>
        <button
          onClick={() => setMode(mode === 'edit' ? 'preview' : 'edit')}
          className="text-xs font-medium px-3 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          {mode === 'edit' ? 'Preview' : 'Edit'}
        </button>
      </div>

      {/* Title */}
      {mode === 'edit' ? (
        <input
          type="text"
          value={doc.title}
          onChange={(e) => handleChange('title', e.target.value)}
          onKeyDown={handleTitleKeyDown}
          placeholder="Untitled"
          className="text-2xl font-bold text-gray-900 bg-transparent border-none outline-none w-full mb-6 placeholder-gray-300"
        />
      ) : (
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          {doc.title || <span className="text-gray-300">Untitled</span>}
        </h1>
      )}

      {/* Body — edit or preview */}
      {mode === 'edit' ? (
        <textarea
          ref={bodyRef}
          value={doc.body}
          onChange={(e) => handleChange('body', e.target.value)}
          placeholder="Start writing…"
          className="flex-1 text-gray-700 text-base leading-relaxed bg-transparent border-none outline-none resize-none placeholder-gray-300 font-mono text-sm"
        />
      ) : (
        <div
          className="doc-preview flex-1 overflow-auto"
          dangerouslySetInnerHTML={{ __html: parseMarkdown(doc.body) || '<p class="text-gray-300">Nothing to preview yet.</p>' }}
        />
      )}
    </div>
  );
}
