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
    setActiveTags((prev) => {
      const next = new Set(prev);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      return next;
    });
  }

  // tags from ALL docs (including trashed) per user requirement
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
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
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

  // ── Doc row (reused for folder groups and unfiled) ─────────────────────────
  function renderDocRow(doc: Doc) {
    return (
      <li
        key={doc.id}
        className={`border-b border-gray-100 dark:border-gray-700 ${activeId === doc.id ? 'bg-gray-100 dark:bg-gray-800' : ''}`}
      >
        {confirmId === doc.id ? (
          <div className="px-3 py-2.5">
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
              Move &ldquo;{doc.title || 'Untitled'}&rdquo; to trash?
            </p>
            <div className="flex gap-2">
              <button onClick={() => handleDelete(doc.id)} className="flex-1 text-xs font-medium bg-red-600 text-white rounded px-2 py-1 hover:bg-red-700 transition-colors">
                Move to trash
              </button>
              <button onClick={() => setConfirmId(null)} className="flex-1 text-xs text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600 rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
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
          >
            <button
              onClick={() => handleStar(doc.id)}
              aria-label={doc.starred ? 'Unstar' : 'Star'}
              className={`pl-2 pr-1 pt-2.5 text-base leading-none transition-colors flex-shrink-0 ${
                doc.starred ? 'text-amber-400' : 'text-gray-200 dark:text-gray-700 opacity-0 group-hover:opacity-100 hover:text-amber-300'
              }`}
            >
              ★
            </button>
            <Link href={`/docs/${doc.id}`} className="flex flex-col flex-1 px-1 py-2 min-w-0">
              <span className={`text-sm text-gray-900 dark:text-gray-100 truncate ${activeId === doc.id ? 'font-medium' : ''}`}>
                {doc.title || 'Untitled'}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{timeAgo(doc.updatedAt)}</span>
              {doc.tags && doc.tags.length > 0 && (
                <div className="flex flex-wrap gap-0.5 mt-1">
                  {doc.tags.map((tag) => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-full">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </Link>
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
    );
  }

  return (
    <aside className="w-64 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col h-full bg-gray-50 dark:bg-gray-900">

      {/* Folder delete confirmation modal */}
      {folderDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 z-40 flex items-center justify-center p-4" onClick={() => setFolderDeleteConfirm(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl p-5 max-w-xs w-full" onClick={(e) => e.stopPropagation()}>
            <p className="font-medium text-gray-900 dark:text-gray-100 mb-1">
              Delete &ldquo;{folderDeleteConfirm.name}&rdquo;?
            </p>
            {folderDeleteConfirm.docCount > 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                This folder contains {folderDeleteConfirm.docCount} document{folderDeleteConfirm.docCount !== 1 ? 's' : ''}. What should happen to them?
              </p>
            )}
            <div className="flex flex-col gap-2 mt-3">
              <button onClick={handleDeleteFolderWithDocs} className="text-sm px-3 py-2 rounded bg-red-600 text-white hover:bg-red-700 transition-colors text-left">
                Delete folder {folderDeleteConfirm.docCount > 0 ? 'and documents' : ''}
              </button>
              {folderDeleteConfirm.docCount > 0 && (
                <button onClick={handleDeleteFolderKeepDocs} className="text-sm px-3 py-2 rounded border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left">
                  Delete folder, move documents to unfiled
                </button>
              )}
              <button onClick={() => setFolderDeleteConfirm(null)} className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-center pt-1">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New document + New folder */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex flex-col gap-1.5">
        <button
          onClick={handleNew}
          className="w-full text-sm font-medium bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-md px-3 py-2 hover:bg-gray-700 dark:hover:bg-gray-300 transition-colors"
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
              className="w-full text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded px-2.5 py-1.5 outline-none focus:border-gray-400 dark:text-gray-200"
            />
            <div className="flex gap-1.5 mt-1.5">
              <button onClick={handleCreateFolder} className="flex-1 text-xs font-medium bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 rounded px-2 py-1 hover:bg-gray-600 transition-colors">
                Create
              </button>
              <button onClick={cancelNewFolder} className="flex-1 text-xs text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setNewFolderMode(true)}
            className="w-full text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-left px-1 py-0.5 transition-colors"
          >
            + New folder
          </button>
        )}
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
        {activeDocs.length === 0 ? (
          <div className="px-4 mt-10 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">No documents yet</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Click &ldquo;+ New document&rdquo; to get started.</p>
          </div>
        ) : filteredActive.length === 0 ? (
          <div className="px-4 mt-10 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">No results</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Try adjusting your search or tag filters.</p>
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
                    className={`flex items-center px-2 py-1.5 border-b border-gray-100 dark:border-gray-700 group/folder ${isDragOver ? 'bg-blue-50 dark:bg-blue-950/30' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); setDragOverTarget(folder.id); }}
                    onDragLeave={() => setDragOverTarget(null)}
                    onDrop={(e) => handleDrop(e, folder.id)}
                  >
                    <button
                      onClick={() => toggleFolderCollapse(folder.id)}
                      className="flex items-center gap-1 flex-1 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hover:text-gray-800 dark:hover:text-gray-200 transition-colors min-w-0"
                    >
                      <span className="text-[10px]">{isCollapsed ? '▸' : '▾'}</span>
                      <span className="truncate">{folder.name}</span>
                      <span className="font-normal text-gray-400 dark:text-gray-500 ml-0.5">({totalInFolder})</span>
                    </button>
                    <button
                      onClick={() => initiateDeleteFolder(folder)}
                      className="p-1 rounded text-gray-300 dark:text-gray-600 opacity-0 group-hover/folder:opacity-100 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-all flex-shrink-0"
                      aria-label={`Delete folder ${folder.name}`}
                    >
                      ✕
                    </button>
                  </div>
                  {!isCollapsed && (
                    <ul className="pl-3">
                      {folderDocs.length === 0 ? (
                        <li className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500 italic">Empty</li>
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
              className={`min-h-[8px] ${dragOverTarget === 'unfiled' ? 'bg-blue-50 dark:bg-blue-950/30' : ''}`}
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
          <div className="border-t border-gray-200 dark:border-gray-700 mt-1">
            <div className="flex items-center px-3 py-2">
              <button
                onClick={() => setTrashCollapsed((c) => !c)}
                className="flex items-center gap-1 flex-1 text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <span className="text-[10px]">{trashCollapsed ? '▸' : '▾'}</span>
                Trash ({trashedDocs.length})
              </button>
              {emptyTrashConfirm ? (
                <div className="flex items-center gap-1.5">
                  <button onClick={handleEmptyTrash} className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline">
                    Confirm
                  </button>
                  <button onClick={() => setEmptyTrashConfirm(false)} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setEmptyTrashConfirm(true)}
                  className="text-xs text-gray-400 dark:text-gray-500 hover:text-red-500 transition-colors"
                >
                  Empty
                </button>
              )}
            </div>
            {!trashCollapsed && filteredTrashed.map((doc) => (
              <div key={doc.id} className="flex items-center px-3 py-2 border-b border-gray-100 dark:border-gray-700/50 group/trash">
                <Link href={`/docs/${doc.id}`} className="flex-1 min-w-0">
                  <span className="text-sm text-gray-400 dark:text-gray-500 truncate block">
                    {doc.title || 'Untitled'}
                  </span>
                  <span className="text-xs text-gray-300 dark:text-gray-600">{timeAgo(doc.deletedAt!)}</span>
                </Link>
                <button
                  onClick={() => handleRestore(doc.id)}
                  aria-label="Restore document"
                  className="text-xs text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 px-1.5 flex-shrink-0 transition-colors"
                  title="Restore"
                >
                  ↩
                </button>
                <button
                  onClick={() => handlePermanentDelete(doc.id)}
                  aria-label="Delete permanently"
                  className="p-1 rounded text-gray-300 dark:text-gray-600 opacity-0 group-hover/trash:opacity-100 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-all flex-shrink-0"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2">
        <div className="flex gap-1">
          <button onClick={handleExport} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors px-2 py-1 rounded border border-gray-200 dark:border-gray-600">
            Export
          </button>
          <button onClick={() => fileRef.current?.click()} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors px-2 py-1 rounded border border-gray-200 dark:border-gray-600">
            Import
          </button>
          <input ref={fileRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
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
