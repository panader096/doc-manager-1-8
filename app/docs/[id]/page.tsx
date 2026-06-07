'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  getDocument,
  updateDocument,
  updateDocumentTags,
  saveSnapshot,
  restoreDocument,
  Doc,
  DocSnapshot,
} from '../../lib/documents';

const AUTOSAVE_DELAY = 400;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

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

function wordCount(text: string): number {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
}
// ────────────────────────────────────────────────────────────────────────────

export default function DocPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const [doc, setDoc] = useState<Doc | null | undefined>(undefined);
  const [mode, setMode] = useState<'edit' | 'preview'>(
    searchParams.get('new') === '1' || searchParams.get('mode') === 'edit'
      ? 'edit'
      : 'preview'
  );
  const [saved, setSaved] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [previewSnapshot, setPreviewSnapshot] = useState<DocSnapshot | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const found = getDocument(id);
    setDoc(found ?? null);
    if (found?.deletedAt) setMode('preview');
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
    if (e.key === 'Enter') { e.preventDefault(); bodyRef.current?.focus(); }
  }

  function handleTagInput(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' && e.key !== ',') return;
    e.preventDefault();
    const input = tagInputRef.current;
    if (!input || !doc) return;
    const value = input.value.trim().replace(/,/g, '');
    if (value && !doc.tags.includes(value)) {
      const newTags = [...doc.tags, value];
      setDoc({ ...doc, tags: newTags });
      updateDocumentTags(id, newTags);
      window.dispatchEvent(new Event('docs-updated'));
    }
    input.value = '';
  }

  function removeTag(tag: string) {
    if (!doc) return;
    const newTags = doc.tags.filter((t) => t !== tag);
    setDoc({ ...doc, tags: newTags });
    updateDocumentTags(id, newTags);
    window.dispatchEvent(new Event('docs-updated'));
  }

  function handleSave() {
    saveSnapshot(id);
    const updated = getDocument(id);
    if (updated) setDoc(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function handleRestoreDoc() {
    restoreDocument(id);
    const updated = getDocument(id);
    setDoc(updated ?? null);
    window.dispatchEvent(new Event('docs-updated'));
  }

  function handleRestore(snap: DocSnapshot) {
    if (!doc) return;
    saveSnapshot(id);
    updateDocument(id, { title: snap.title, body: snap.body });
    const updated = getDocument(id);
    setDoc(updated ?? null);
    setPreviewSnapshot(null);
    setShowHistory(false);
    window.dispatchEvent(new Event('docs-updated'));
  }

  if (doc === undefined) return null;

  if (doc === null) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
        <p className="text-gray-900 dark:text-gray-100 font-medium">Document not found</p>
        <p className="text-sm text-gray-400 dark:text-gray-500">
          This document may have been deleted or the link is incorrect.
        </p>
        <Link href="/docs" className="text-sm text-blue-600 dark:text-blue-400 hover:underline mt-1">
          ← Back to workspace
        </Link>
      </div>
    );
  }

  const isInTrash = !!doc.deletedAt;
  const hasHistory = (doc.history ?? []).length > 0;

  return (
    <div className="flex flex-col h-full px-6 md:px-10 py-8 max-w-3xl mx-auto w-full">
      {/* Trash banner */}
      {isInTrash && (
        <div className="mb-4 px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 flex items-center justify-between">
          <span className="text-sm text-amber-700 dark:text-amber-400">
            This document is in trash.
          </span>
          <button
            onClick={handleRestoreDoc}
            className="text-sm font-medium text-amber-700 dark:text-amber-400 hover:underline ml-3"
          >
            Restore
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {isInTrash
            ? 'Read-only — restore to edit'
            : mode === 'edit'
            ? 'Tip: # Heading · **bold** · *italic* · - list'
            : 'Preview mode — click Edit to make changes'}
        </span>
        <div className="flex items-center gap-2">
          {!isInTrash && mode === 'edit' && (
            <button
              onClick={handleSave}
              className={`text-xs font-medium px-3 py-1 rounded border transition-colors ${
                saved
                  ? 'border-green-300 dark:border-green-700 text-green-600 dark:text-green-400'
                  : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              {saved ? 'Saved ✓' : 'Save'}
            </button>
          )}
          {hasHistory && (
            <button
              onClick={() => setShowHistory((s) => !s)}
              className={`text-xs font-medium px-3 py-1 rounded border transition-colors ${
                showHistory
                  ? 'border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950'
                  : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              History ({doc.history!.length})
            </button>
          )}
          {!isInTrash && (
            <button
              onClick={() => setMode(mode === 'edit' ? 'preview' : 'edit')}
              className="text-xs font-medium px-3 py-1 rounded border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              {mode === 'edit' ? 'Preview' : 'Edit'}
            </button>
          )}
        </div>
      </div>

      {/* History panel */}
      {showHistory && hasHistory && (
        <div className="mb-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Saved versions</span>
            <button onClick={() => setShowHistory(false)} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              Close
            </button>
          </div>
          {doc.history!.map((snap, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-2.5 border-b last:border-0 border-gray-100 dark:border-gray-700/50">
              <div>
                <p className="text-sm text-gray-800 dark:text-gray-200 font-medium">{snap.title || 'Untitled'}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{timeAgo(snap.savedAt)}</p>
              </div>
              <button
                onClick={() => setPreviewSnapshot(snap)}
                className="text-xs px-2.5 py-1 rounded border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 transition-colors"
              >
                Preview
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Title */}
      {mode === 'edit' && !isInTrash ? (
        <input
          type="text"
          value={doc.title}
          onChange={(e) => handleChange('title', e.target.value)}
          onKeyDown={handleTitleKeyDown}
          placeholder="Untitled"
          className="text-2xl font-bold text-gray-900 dark:text-gray-100 bg-transparent border-none outline-none w-full mb-3 placeholder-gray-300 dark:placeholder-gray-600"
        />
      ) : (
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">
          {doc.title || <span className="text-gray-300 dark:text-gray-600">Untitled</span>}
        </h1>
      )}

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5 items-center mb-5 min-h-[24px]">
        {doc.tags.map((tag) => (
          <span key={tag} className="flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-full">
            {tag}
            {mode === 'edit' && !isInTrash && (
              <button onClick={() => removeTag(tag)} aria-label={`Remove tag ${tag}`} className="hover:text-red-500 dark:hover:text-red-400 leading-none">
                ×
              </button>
            )}
          </span>
        ))}
        {mode === 'edit' && !isInTrash && (
          <input
            ref={tagInputRef}
            placeholder={doc.tags.length === 0 ? 'Add tag…' : ''}
            onKeyDown={handleTagInput}
            className="text-xs outline-none bg-transparent text-gray-600 dark:text-gray-400 placeholder-gray-300 dark:placeholder-gray-600 min-w-[60px]"
          />
        )}
      </div>

      {/* Body */}
      {mode === 'edit' && !isInTrash ? (
        <>
          <textarea
            ref={bodyRef}
            value={doc.body}
            onChange={(e) => handleChange('body', e.target.value)}
            placeholder="Start writing…"
            className="flex-1 text-gray-700 dark:text-gray-300 text-base leading-relaxed bg-transparent border-none outline-none resize-none placeholder-gray-300 dark:placeholder-gray-600 font-mono text-sm"
          />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 select-none">
            {wordCount(doc.body)} {wordCount(doc.body) === 1 ? 'word' : 'words'}
          </p>
        </>
      ) : (
        <div
          className="doc-preview flex-1 overflow-auto dark:text-gray-200"
          dangerouslySetInnerHTML={{
            __html: parseMarkdown(doc.body) || '<p class="text-gray-300 dark:text-gray-600">Nothing to preview yet.</p>',
          }}
        />
      )}

      {/* History preview modal */}
      {previewSnapshot && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setPreviewSnapshot(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 pt-5 pb-3 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Saved version · {timeAgo(previewSnapshot.savedAt)}</p>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{previewSnapshot.title || 'Untitled'}</h2>
            </div>
            <div className="doc-preview flex-1 overflow-auto px-6 py-4 dark:text-gray-200" dangerouslySetInnerHTML={{ __html: parseMarkdown(previewSnapshot.body) || '<p class="text-gray-300 dark:text-gray-600">Empty document.</p>' }} />
            <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-2 flex-shrink-0">
              <button onClick={() => setPreviewSnapshot(null)} className="text-sm px-4 py-1.5 rounded border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                Cancel
              </button>
              {!isInTrash && (
                <button onClick={() => handleRestore(previewSnapshot)} className="text-sm px-4 py-1.5 rounded bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-300 transition-colors font-medium">
                  Restore this version
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
