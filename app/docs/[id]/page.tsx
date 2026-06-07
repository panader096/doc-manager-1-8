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
        <p className="text-[14px] font-medium" style={{ color: 'var(--text-1)' }}>Document not found</p>
        <p className="text-[13px]" style={{ color: 'var(--text-3)' }}>
          This document may have been deleted or the link is incorrect.
        </p>
        <Link href="/docs" className="text-[13px] mt-1 hover:underline" style={{ color: 'var(--accent)' }}>
          ← Back to workspace
        </Link>
      </div>
    );
  }

  const isInTrash = !!doc.deletedAt;
  const hasHistory = (doc.history ?? []).length > 0;

  return (
    <div className="flex flex-col h-full px-8 py-8 max-w-[800px] mx-auto w-full">

      {/* Trash banner */}
      {isInTrash && (
        <div
          className="mb-4 px-3 py-2 rounded-[4px] border flex items-center justify-between"
          style={{ backgroundColor: 'rgba(253,224,71,0.12)', borderColor: 'rgba(251,191,36,0.35)' }}
        >
          <span className="text-[13px] text-amber-600">This document is in trash.</span>
          <button
            onClick={handleRestoreDoc}
            className="text-[13px] font-medium text-amber-600 hover:underline ml-3"
          >
            Restore
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-[12px]" style={{ color: 'var(--text-3)' }}>
          {isInTrash
            ? 'Read-only — restore to edit'
            : mode === 'edit'
            ? 'Tip: # Heading · **bold** · *italic* · - list'
            : 'Preview mode — click Edit to make changes'}
        </span>
        <div className="flex items-center gap-1.5">
          {!isInTrash && mode === 'edit' && (
            <button
              onClick={handleSave}
              className="text-[12px] font-medium px-3 py-1 rounded-[4px] border transition-colors"
              style={
                saved
                  ? { borderColor: '#86efac', color: '#16a34a' }
                  : { borderColor: 'var(--border)', color: 'var(--text-2)' }
              }
              onMouseOver={(e) => {
                if (!saved) e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
              }}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '')}
            >
              {saved ? 'Saved ✓' : 'Save'}
            </button>
          )}
          {hasHistory && (
            <button
              onClick={() => setShowHistory((s) => !s)}
              className="text-[12px] font-medium px-3 py-1 rounded-[4px] border transition-colors"
              style={
                showHistory
                  ? { borderColor: 'var(--accent)', color: 'var(--accent)' }
                  : { borderColor: 'var(--border)', color: 'var(--text-2)' }
              }
              onMouseOver={(e) => {
                if (!showHistory) e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
              }}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '')}
            >
              History ({doc.history!.length})
            </button>
          )}
          {!isInTrash && (
            <button
              onClick={() => setMode(mode === 'edit' ? 'preview' : 'edit')}
              className="text-[12px] font-medium px-3 py-1 rounded-[4px] border transition-colors"
              style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '')}
            >
              {mode === 'edit' ? 'Preview' : 'Edit'}
            </button>
          )}
        </div>
      </div>

      {/* History panel */}
      {showHistory && hasHistory && (
        <div
          className="mb-4 rounded-[4px] border overflow-hidden"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
        >
          <div
            className="px-3 py-2 border-b flex items-center justify-between"
            style={{ borderColor: 'var(--border)' }}
          >
            <span className="text-[12px] font-medium" style={{ color: 'var(--text-1)' }}>Saved versions</span>
            <button
              onClick={() => setShowHistory(false)}
              className="text-[12px] transition-colors"
              style={{ color: 'var(--text-3)' }}
              onMouseOver={(e) => (e.currentTarget.style.color = 'var(--text-2)')}
              onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
            >
              Close
            </button>
          </div>
          {doc.history!.map((snap, i) => (
            <div
              key={i}
              className="flex items-center justify-between px-3 py-2 border-b last:border-0"
              style={{ borderColor: 'var(--border)' }}
            >
              <div>
                <p className="text-[13px] font-medium" style={{ color: 'var(--text-1)' }}>
                  {snap.title || 'Untitled'}
                </p>
                <p className="font-mono text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>
                  {timeAgo(snap.savedAt)}
                </p>
              </div>
              <button
                onClick={() => setPreviewSnapshot(snap)}
                className="text-[12px] px-2.5 py-1 rounded-[4px] border transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '')}
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
          className="text-[22px] font-bold bg-transparent border-none outline-none w-full mb-3"
          style={{ color: 'var(--text-1)' }}
        />
      ) : (
        <h1 className="text-[22px] font-bold mb-3" style={{ color: 'var(--text-1)' }}>
          {doc.title || <span style={{ color: 'var(--text-3)' }}>Untitled</span>}
        </h1>
      )}

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5 items-center mb-5 min-h-[24px]">
        {doc.tags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 text-[10px] px-2 py-px rounded-[4px] border font-mono"
            style={{
              backgroundColor: 'var(--tag-bg)',
              color: 'var(--tag-text)',
              borderColor: 'var(--tag-border)',
            }}
          >
            {tag}
            {mode === 'edit' && !isInTrash && (
              <button
                onClick={() => removeTag(tag)}
                aria-label={`Remove tag ${tag}`}
                className="hover:text-red-500 leading-none"
              >
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
            className="text-[11px] outline-none bg-transparent font-mono min-w-[60px]"
            style={{ color: 'var(--text-2)' }}
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
            className="flex-1 text-[13px] leading-relaxed bg-transparent border-none outline-none resize-none font-mono"
            style={{ color: 'var(--text-1)' }}
          />
          <p className="font-mono text-[11px] mt-2 select-none" style={{ color: 'var(--text-3)' }}>
            {wordCount(doc.body)} {wordCount(doc.body) === 1 ? 'word' : 'words'}
          </p>
        </>
      ) : (
        <div
          className="doc-preview flex-1 overflow-auto"
          dangerouslySetInnerHTML={{
            __html: parseMarkdown(doc.body) || `<p style="color:var(--text-3)">Nothing to preview yet.</p>`,
          }}
        />
      )}

      {/* History preview modal */}
      {previewSnapshot && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewSnapshot(null)}
        >
          <div
            className="rounded-[8px] border max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden"
            style={{
              backgroundColor: 'var(--bg-modal)',
              borderColor: 'var(--border)',
              boxShadow: 'var(--shadow-modal)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="px-6 pt-5 pb-3 border-b flex-shrink-0"
              style={{ borderColor: 'var(--border)' }}
            >
              <p className="font-mono text-[11px] mb-1" style={{ color: 'var(--text-3)' }}>
                Saved version · {timeAgo(previewSnapshot.savedAt)}
              </p>
              <h2 className="text-[20px] font-bold" style={{ color: 'var(--text-1)' }}>
                {previewSnapshot.title || 'Untitled'}
              </h2>
            </div>
            <div
              className="doc-preview flex-1 overflow-auto px-6 py-4"
              dangerouslySetInnerHTML={{
                __html: parseMarkdown(previewSnapshot.body) || `<p style="color:var(--text-3)">Empty document.</p>`,
              }}
            />
            <div
              className="px-6 py-4 border-t flex justify-end gap-2 flex-shrink-0"
              style={{ borderColor: 'var(--border)' }}
            >
              <button
                onClick={() => setPreviewSnapshot(null)}
                className="text-[13px] px-4 py-1.5 rounded-[4px] border transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '')}
              >
                Cancel
              </button>
              {!isInTrash && (
                <button
                  onClick={() => handleRestore(previewSnapshot)}
                  className="text-[13px] px-4 py-1.5 rounded-[4px] font-medium hover:opacity-80 transition-opacity"
                  style={{ backgroundColor: 'var(--text-1)', color: 'var(--bg-app)' }}
                >
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
