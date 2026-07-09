'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  getDocuments, createDocument, deleteDocument, toggleStar,
  getFolders, createFolder, deleteFolder, moveDocumentToFolder,
  restoreDocument, permanentlyDeleteDocument, emptyTrash,
  exportWorkspace, importWorkspace,
  Doc, Folder,
} from '../lib/documents';
import { toggleInSet } from '../lib/utils';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

type FolderDeleteConfirm = { id: string; name: string; docCount: number } | null;

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const activeId = pathname.startsWith('/docs/') ? pathname.split('/')[2] : undefined;

  const [docs, setDocs] = useState<Doc[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [query, setQuery] = useState('');
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  const [newFolderMode, setNewFolderMode] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderDeleteConfirm, setFolderDeleteConfirm] = useState<FolderDeleteConfirm>(null);
  const [emptyTrashConfirm, setEmptyTrashConfirm] = useState(false);
  const [trashCollapsed, setTrashCollapsed] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    return localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  function refresh() {
    setDocs(getDocuments());
    setFolders(getFolders());
  }

  useEffect(() => {
    refresh();
    window.addEventListener('docs-updated', refresh);
    return () => window.removeEventListener('docs-updated', refresh);
  }, []);

  useEffect(() => {
    if (newFolderMode) newFolderInputRef.current?.focus();
  }, [newFolderMode]);

  // ── Theme ──────────────────────────────────────────────────────────────────
  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('theme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  }

  // ── Tag filter ─────────────────────────────────────────────────────────────
  function toggleActiveTag(tag: string) {
    setActiveTags((prev) => toggleInSet(prev, tag));
  }

  const allTags = Array.from(new Set(docs.flatMap((d) => d.tags ?? [])));

  // ── Derived lists ──────────────────────────────────────────────────────────
  const activeDocs = docs.filter((d) => !d.deletedAt);
  const trashedDocs = docs.filter((d) => !!d.deletedAt);

  const filteredActive = activeDocs
    .filter((d) => {
      const q = !query || d.title.toLowerCase().includes(query.toLowerCase());
      const t = activeTags.size === 0 || [...activeTags].every((tag) => d.tags.includes(tag));
      return q && t;
    })
    .sort((a, b) => {
      if (a.starred && !b.starred) return -1;
      if (!a.starred && b.starred) return 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });

  const docsByFolder = new Map<string, Doc[]>();
  const unfiledDocs: Doc[] = [];
  for (const doc of filteredActive) {
    if (doc.folderId) {
      docsByFolder.set(doc.folderId, [...(docsByFolder.get(doc.folderId) ?? []), doc]);
    } else {
      unfiledDocs.push(doc);
    }
  }

  const filteredTrashed = trashedDocs
    .filter((d) => activeTags.size === 0 || [...activeTags].every((t) => d.tags.includes(t)))
    .sort((a, b) => b.deletedAt!.localeCompare(a.deletedAt!));

  // ── New document ───────────────────────────────────────────────────────────
  function handleNew() {
    const doc = createDocument();
    window.dispatchEvent(new Event('docs-updated'));
    router.push(`/docs/${doc.id}?new=1`);
  }

  // ── Folders ────────────────────────────────────────────────────────────────
  function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    createFolder(newFolderName.trim());
    setNewFolderName('');
    setNewFolderMode(false);
    refresh();
  }

  function cancelNewFolder() {
    setNewFolderMode(false);
    setNewFolderName('');
  }

  function toggleFolderCollapse(id: string) {
    setCollapsedFolders((prev) => toggleInSet(prev, id));
  }

  function initiateDeleteFolder(folder: Folder) {
    const docCount = activeDocs.filter((d) => d.folderId === folder.id).length;
    setFolderDeleteConfirm({ id: folder.id, name: folder.name, docCount });
  }

  function handleDeleteFolderWithDocs() {
    if (!folderDeleteConfirm) return;
    const inFolder = activeDocs.filter((d) => d.folderId === folderDeleteConfirm.id);
    inFolder.forEach((d) => deleteDocument(d.id));
    deleteFolder(folderDeleteConfirm.id);
    if (activeId && inFolder.some((d) => d.id === activeId)) router.push('/docs');
    window.dispatchEvent(new Event('docs-updated'));
    setFolderDeleteConfirm(null);
  }

  function handleDeleteFolderKeepDocs() {
    if (!folderDeleteConfirm) return;
    activeDocs.filter((d) => d.folderId === folderDeleteConfirm.id)
      .forEach((d) => moveDocumentToFolder(d.id, null));
    deleteFolder(folderDeleteConfirm.id);
    window.dispatchEvent(new Event('docs-updated'));
    setFolderDeleteConfirm(null);
  }

  // ── Drag and drop ──────────────────────────────────────────────────────────
  function handleDrop(e: React.DragEvent, targetFolderId: string | null) {
    e.preventDefault();
    const docId = e.dataTransfer.getData('docId');
    if (docId) {
      moveDocumentToFolder(docId, targetFolderId);
      window.dispatchEvent(new Event('docs-updated'));
    }
    setDragOverTarget(null);
  }

  // ── Document actions ───────────────────────────────────────────────────────
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

  function handleRestore(id: string) {
    restoreDocument(id);
    window.dispatchEvent(new Event('docs-updated'));
  }

  function handlePermanentDelete(id: string) {
    permanentlyDeleteDocument(id);
    window.dispatchEvent(new Event('docs-updated'));
    if (activeId === id) router.push('/docs');
  }

  function handleEmptyTrash() {
    emptyTrash();
    window.dispatchEvent(new Event('docs-updated'));
    setEmptyTrashConfirm(false);
    if (activeId && trashedDocs.some((d) => d.id === activeId)) router.push('/docs');
  }

  // ── Export / Import ────────────────────────────────────────────────────────
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
      } catch { /* ignore malformed files */ }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // ── Doc row ───────────────────────────────────────────────────────────────
  function renderDocRow(doc: Doc) {
    const isActive = activeId === doc.id;
    return (
      <li
        key={doc.id}
        className="border-l-2 border-b"
        style={{
          borderBottomColor: 'var(--border)',
          borderLeftColor: isActive ? 'var(--active-bar)' : 'transparent',
          backgroundColor: isActive ? 'var(--bg-active)' : undefined,
        }}
      >
        {confirmId === doc.id ? (
          <div className="px-3 py-2">
            <p className="text-[12px] mb-1.5" style={{ color: 'var(--text-2)' }}>
              Move &ldquo;{doc.title || 'Untitled'}&rdquo; to trash?
            </p>
            <div className="flex gap-1.5">
              <button
                onClick={() => handleDelete(doc.id)}
                className="flex-1 text-[12px] font-medium bg-red-600 text-white rounded-[4px] px-2 py-1 hover:bg-red-700 transition-colors"
              >
                Move to trash
              </button>
              <button
                onClick={() => setConfirmId(null)}
                className="flex-1 text-[12px] rounded-[4px] border px-2 py-1 transition-colors"
                style={{ color: 'var(--text-2)', borderColor: 'var(--border)' }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '')}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div
            className="flex items-start group"
            draggable
            onDragStart={(e) => { e.dataTransfer.setData('docId', doc.id); setConfirmId(null); }}
            onDragEnd={() => setDragOverTarget(null)}
            onMouseOver={(e) => {
              if (!isActive) (e.currentTarget.parentElement as HTMLElement).style.backgroundColor = 'var(--bg-hover)';
            }}
            onMouseOut={(e) => {
              if (!isActive) (e.currentTarget.parentElement as HTMLElement).style.backgroundColor = '';
            }}
          >
            <button
              onClick={() => handleStar(doc.id)}
              aria-label={doc.starred ? 'Unstar' : 'Star'}
              className={`pl-2.5 pr-1 py-[7px] text-[13px] leading-none transition-colors flex-shrink-0 ${
                doc.starred ? 'text-amber-400' : 'opacity-0 group-hover:opacity-100 hover:text-amber-300'
              }`}
              style={doc.starred ? {} : { color: 'var(--border)' }}
            >
              ★
            </button>
            <Link href={`/docs/${doc.id}`} className="flex flex-col flex-1 px-1 py-[7px] min-w-0">
              <span
                className={`text-[13px] truncate leading-tight ${isActive ? 'font-medium' : ''}`}
                style={{ color: 'var(--text-1)' }}
              >
                {doc.title || 'Untitled'}
              </span>
              <span className="font-mono text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>
                {timeAgo(doc.updatedAt)}
              </span>
              {doc.tags && doc.tags.length > 0 && (
                <div className="flex flex-wrap gap-0.5 mt-1">
                  {doc.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] px-1.5 py-px rounded-[4px] border font-mono"
                      style={{
                        backgroundColor: 'var(--tag-bg)',
                        color: 'var(--tag-text)',
                        borderColor: 'var(--tag-border)',
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </Link>
            <button
              onClick={() => setConfirmId(doc.id)}
              aria-label="Delete document"
              className="mr-2.5 mt-[6px] p-1 rounded-[4px] opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all flex-shrink-0 text-[11px]"
              style={{ color: 'var(--text-3)' }}
            >
              ✕
            </button>
          </div>
        )}
      </li>
    );
  }

  return (
    <aside
      className="w-64 flex-shrink-0 border-r flex flex-col h-full"
      style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}
    >

      {/* Folder delete confirmation modal */}
      {folderDeleteConfirm && (
        <div
          className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4"
          onClick={() => setFolderDeleteConfirm(null)}
        >
          <div
            className="rounded-[8px] border p-5 max-w-xs w-full"
            style={{
              backgroundColor: 'var(--bg-modal)',
              borderColor: 'var(--border)',
              boxShadow: 'var(--shadow-modal)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-semibold text-[14px] mb-1" style={{ color: 'var(--text-1)' }}>
              Delete &ldquo;{folderDeleteConfirm.name}&rdquo;?
            </p>
            {folderDeleteConfirm.docCount > 0 && (
              <p className="text-[13px] mb-4" style={{ color: 'var(--text-2)' }}>
                This folder contains {folderDeleteConfirm.docCount} document{folderDeleteConfirm.docCount !== 1 ? 's' : ''}. What should happen to them?
              </p>
            )}
            <div className="flex flex-col gap-2 mt-3">
              <button
                onClick={handleDeleteFolderWithDocs}
                className="text-[13px] px-3 py-2 rounded-[4px] bg-red-600 text-white hover:bg-red-700 transition-colors text-left"
              >
                Delete folder {folderDeleteConfirm.docCount > 0 ? 'and documents' : ''}
              </button>
              {folderDeleteConfirm.docCount > 0 && (
                <button
                  onClick={handleDeleteFolderKeepDocs}
                  className="text-[13px] px-3 py-2 rounded-[4px] border text-left transition-colors"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
                  onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '')}
                >
                  Delete folder, move documents to unfiled
                </button>
              )}
              <button
                onClick={() => setFolderDeleteConfirm(null)}
                className="text-[13px] text-center pt-1 transition-colors"
                style={{ color: 'var(--text-2)' }}
                onMouseOver={(e) => (e.currentTarget.style.color = 'var(--text-1)')}
                onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-2)')}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header: New document + New folder */}
      <div className="px-3 pt-3 pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <button
          onClick={handleNew}
          className="w-full text-[13px] font-medium text-white rounded-[4px] px-3 py-1.5 mb-1.5 hover:opacity-90 transition-opacity"
          style={{ backgroundColor: 'var(--btn-primary)' }}
        >
          + New document
        </button>
        {newFolderMode ? (
          <div>
            <input
              ref={newFolderInputRef}
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder();
                if (e.key === 'Escape') cancelNewFolder();
              }}
              placeholder="Folder name…"
              className="w-full text-[13px] rounded-[4px] border px-2.5 py-1.5 outline-none"
              style={{
                backgroundColor: 'var(--bg-input)',
                borderColor: 'var(--border)',
                color: 'var(--text-1)',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--border-focus)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
            <div className="flex gap-1.5 mt-1.5">
              <button
                onClick={handleCreateFolder}
                className="flex-1 text-[12px] font-medium rounded-[4px] px-2 py-1 hover:opacity-80 transition-opacity"
                style={{ backgroundColor: 'var(--text-1)', color: 'var(--bg-app)' }}
              >
                Create
              </button>
              <button
                onClick={cancelNewFolder}
                className="flex-1 text-[12px] rounded-[4px] border px-2 py-1 transition-colors"
                style={{ color: 'var(--text-2)', borderColor: 'var(--border)' }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '')}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setNewFolderMode(true)}
            className="text-[12px] text-left transition-colors"
            style={{ color: 'var(--text-3)' }}
            onMouseOver={(e) => (e.currentTarget.style.color = 'var(--text-2)')}
            onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
          >
            + New folder
          </button>
        )}
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <input
          type="search"
          placeholder="Search documents…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setConfirmId(null); }}
          className="w-full text-[13px] rounded-[4px] border px-2.5 py-1.5 outline-none"
          style={{
            backgroundColor: 'var(--bg-input)',
            borderColor: 'var(--border)',
            color: 'var(--text-1)',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--border-focus)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        />
      </div>

      {/* Tag filter */}
      {allTags.length > 0 && (
        <div className="px-3 py-2 border-b flex flex-wrap gap-1" style={{ borderColor: 'var(--border)' }}>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleActiveTag(tag)}
              className="text-[11px] px-2 py-px rounded-[4px] border font-mono transition-colors"
              style={
                activeTags.has(tag)
                  ? { backgroundColor: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' }
                  : { backgroundColor: 'var(--tag-bg)', color: 'var(--tag-text)', borderColor: 'var(--tag-border)' }
              }
              onMouseOver={(e) => {
                if (!activeTags.has(tag)) e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
              }}
              onMouseOut={(e) => {
                if (!activeTags.has(tag)) e.currentTarget.style.backgroundColor = 'var(--tag-bg)';
              }}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Document list */}
      <nav className="flex-1 overflow-y-auto">
        {activeDocs.length === 0 ? (
          <div className="px-4 mt-10 text-center">
            <p className="text-[13px] font-medium" style={{ color: 'var(--text-2)' }}>No documents yet</p>
            <p className="text-[12px] mt-1" style={{ color: 'var(--text-3)' }}>
              Click &ldquo;+ New document&rdquo; to get started.
            </p>
          </div>
        ) : filteredActive.length === 0 ? (
          <div className="px-4 mt-10 text-center">
            <p className="text-[13px] font-medium" style={{ color: 'var(--text-2)' }}>No results</p>
            <p className="text-[12px] mt-1" style={{ color: 'var(--text-3)' }}>
              Try adjusting your search or tag filters.
            </p>
          </div>
        ) : (
          <>
            {/* Folders */}
            {folders.map((folder) => {
              const folderDocs = docsByFolder.get(folder.id) ?? [];
              const isCollapsed = collapsedFolders.has(folder.id);
              const isDragOver = dragOverTarget === folder.id;
              const totalInFolder = activeDocs.filter((d) => d.folderId === folder.id).length;

              return (
                <div key={folder.id}>
                  <div
                    className="flex items-center px-2.5 py-1.5 border-b group/folder"
                    style={{
                      borderColor: 'var(--border)',
                      backgroundColor: isDragOver ? 'rgba(0,122,255,0.08)' : undefined,
                    }}
                    onDragOver={(e) => { e.preventDefault(); setDragOverTarget(folder.id); }}
                    onDragLeave={() => setDragOverTarget(null)}
                    onDrop={(e) => handleDrop(e, folder.id)}
                  >
                    <button
                      onClick={() => toggleFolderCollapse(folder.id)}
                      className="flex items-center gap-1 flex-1 text-left text-[11px] font-semibold uppercase tracking-wider transition-colors min-w-0"
                      style={{ color: 'var(--text-2)' }}
                      onMouseOver={(e) => (e.currentTarget.style.color = 'var(--text-1)')}
                      onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-2)')}
                    >
                      <span className="text-[10px] font-normal">{isCollapsed ? '▸' : '▾'}</span>
                      <span className="truncate">{folder.name}</span>
                      <span className="font-normal ml-0.5 normal-case tracking-normal" style={{ color: 'var(--text-3)' }}>
                        ({totalInFolder})
                      </span>
                    </button>
                    <button
                      onClick={() => initiateDeleteFolder(folder)}
                      className="p-1 rounded-[4px] opacity-0 group-hover/folder:opacity-100 hover:text-red-500 transition-all flex-shrink-0 text-[11px]"
                      style={{ color: 'var(--text-3)' }}
                      aria-label={`Delete folder ${folder.name}`}
                    >
                      ✕
                    </button>
                  </div>
                  {!isCollapsed && (
                    <ul className="pl-2">
                      {folderDocs.length === 0 ? (
                        <li className="px-3 py-2 text-[12px] italic" style={{ color: 'var(--text-3)' }}>
                          Empty
                        </li>
                      ) : (
                        folderDocs.map((doc) => renderDocRow(doc))
                      )}
                    </ul>
                  )}
                </div>
              );
            })}

            {/* Unfiled */}
            <div
              className="min-h-[8px]"
              style={dragOverTarget === 'unfiled' ? { backgroundColor: 'rgba(0,122,255,0.08)' } : {}}
              onDragOver={(e) => { e.preventDefault(); setDragOverTarget('unfiled'); }}
              onDragLeave={() => setDragOverTarget(null)}
              onDrop={(e) => handleDrop(e, null)}
            >
              <ul>
                {unfiledDocs.map((doc) => renderDocRow(doc))}
              </ul>
            </div>
          </>
        )}

        {/* Trash section */}
        {trashedDocs.length > 0 && (
          <div className="border-t mt-2" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center px-2.5 py-1.5">
              <button
                onClick={() => setTrashCollapsed((c) => !c)}
                className="flex items-center gap-1 flex-1 text-left text-[11px] font-semibold uppercase tracking-wider transition-colors"
                style={{ color: 'var(--text-3)' }}
                onMouseOver={(e) => (e.currentTarget.style.color = 'var(--text-2)')}
                onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
              >
                <span className="text-[10px] font-normal">{trashCollapsed ? '▸' : '▾'}</span>
                Trash ({trashedDocs.length})
              </button>
              {emptyTrashConfirm ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleEmptyTrash}
                    className="text-[12px] font-medium text-red-600 hover:underline"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setEmptyTrashConfirm(false)}
                    className="text-[12px] transition-colors"
                    style={{ color: 'var(--text-3)' }}
                    onMouseOver={(e) => (e.currentTarget.style.color = 'var(--text-2)')}
                    onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setEmptyTrashConfirm(true)}
                  className="text-[12px] transition-colors hover:text-red-500"
                  style={{ color: 'var(--text-3)' }}
                >
                  Empty
                </button>
              )}
            </div>
            {!trashCollapsed && filteredTrashed.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center px-2.5 py-[6px] border-b group/trash"
                style={{ borderColor: 'var(--border)' }}
              >
                <Link href={`/docs/${doc.id}`} className="flex-1 min-w-0">
                  <span className="text-[13px] truncate block" style={{ color: 'var(--text-3)' }}>
                    {doc.title || 'Untitled'}
                  </span>
                  <span className="font-mono text-[11px]" style={{ color: 'var(--text-3)' }}>
                    {timeAgo(doc.deletedAt!)}
                  </span>
                </Link>
                <button
                  onClick={() => handleRestore(doc.id)}
                  aria-label="Restore document"
                  className="text-[12px] px-1.5 flex-shrink-0 hover:opacity-70 transition-opacity"
                  style={{ color: 'var(--accent)' }}
                  title="Restore"
                >
                  ↩
                </button>
                <button
                  onClick={() => handlePermanentDelete(doc.id)}
                  aria-label="Delete permanently"
                  className="p-1 rounded-[4px] opacity-0 group-hover/trash:opacity-100 hover:text-red-500 transition-all flex-shrink-0 text-[11px]"
                  style={{ color: 'var(--text-3)' }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="px-3 py-2.5 border-t flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
        <div className="flex gap-3">
          <button
            onClick={handleExport}
            className="text-[12px] transition-colors"
            style={{ color: 'var(--text-2)' }}
            onMouseOver={(e) => (e.currentTarget.style.color = 'var(--text-1)')}
            onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-2)')}
          >
            Export
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="text-[12px] transition-colors"
            style={{ color: 'var(--text-2)' }}
            onMouseOver={(e) => (e.currentTarget.style.color = 'var(--text-1)')}
            onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-2)')}
          >
            Import
          </button>
          <input ref={fileRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
        </div>
        <button
          onClick={toggleTheme}
          suppressHydrationWarning
          className="text-[12px] transition-colors"
          style={{ color: 'var(--text-2)' }}
          onMouseOver={(e) => (e.currentTarget.style.color = 'var(--text-1)')}
          onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-2)')}
        >
          {theme === 'light' ? 'Dark' : 'Light'}
        </button>
      </div>
    </aside>
  );
}
