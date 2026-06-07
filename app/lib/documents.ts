export interface DocSnapshot {
  title: string;
  body: string;
  savedAt: string;
}

export interface Doc {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  starred?: boolean;
  tags: string[];
  history?: DocSnapshot[];
  folderId?: string;
  deletedAt?: string;
}

export interface Folder {
  id: string;
  name: string;
  createdAt: string;
}

const STORAGE_KEY = 'doc_manager_documents';
const FOLDERS_KEY = 'doc_manager_folders';

export function getDocuments(): Doc[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as Doc[];
    return raw.map((d) => ({ ...d, tags: d.tags ?? [], history: d.history ?? [] }));
  } catch {
    return [];
  }
}

export function saveDocuments(docs: Doc[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
}

export function getFolders(): Folder[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(FOLDERS_KEY) || '[]') as Folder[];
  } catch {
    return [];
  }
}

export function saveFolders(folders: Folder[]): void {
  localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
}

export function createFolder(name: string): Folder {
  const folder: Folder = {
    id: crypto.randomUUID(),
    name: name.trim(),
    createdAt: new Date().toISOString(),
  };
  saveFolders([...getFolders(), folder]);
  return folder;
}

export function deleteFolder(id: string): void {
  saveFolders(getFolders().filter((f) => f.id !== id));
}

export function moveDocumentToFolder(docId: string, folderId: string | null): void {
  saveDocuments(
    getDocuments().map((d) =>
      d.id === docId ? { ...d, folderId: folderId ?? undefined } : d
    )
  );
}

export function createDocument(): Doc {
  const doc: Doc = {
    id: crypto.randomUUID(),
    title: 'Untitled',
    body: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    starred: false,
    tags: [],
    history: [],
  };
  saveDocuments([doc, ...getDocuments()]);
  return doc;
}

export function getDocument(id: string): Doc | undefined {
  return getDocuments().find((d) => d.id === id);
}

export function updateDocument(
  id: string,
  changes: Partial<Pick<Doc, 'title' | 'body'>>
): void {
  saveDocuments(
    getDocuments().map((d) =>
      d.id === id ? { ...d, ...changes, updatedAt: new Date().toISOString() } : d
    )
  );
}

export function updateDocumentTags(id: string, tags: string[]): void {
  saveDocuments(getDocuments().map((d) => (d.id === id ? { ...d, tags } : d)));
}

export function toggleStar(id: string): void {
  saveDocuments(
    getDocuments().map((d) => (d.id === id ? { ...d, starred: !d.starred } : d))
  );
}

export function saveSnapshot(id: string): void {
  const docs = getDocuments();
  const doc = docs.find((d) => d.id === id);
  if (!doc) return;
  const snapshot: DocSnapshot = { title: doc.title, body: doc.body, savedAt: new Date().toISOString() };
  const history = [snapshot, ...(doc.history ?? [])].slice(0, 3);
  saveDocuments(docs.map((d) => (d.id === id ? { ...d, history } : d)));
}

// Soft-delete — moves document to trash
export function deleteDocument(id: string): void {
  saveDocuments(
    getDocuments().map((d) =>
      d.id === id ? { ...d, deletedAt: new Date().toISOString() } : d
    )
  );
}

export function restoreDocument(id: string): void {
  saveDocuments(
    getDocuments().map((d) =>
      d.id === id ? { ...d, deletedAt: undefined } : d
    )
  );
}

export function permanentlyDeleteDocument(id: string): void {
  saveDocuments(getDocuments().filter((d) => d.id !== id));
}

export function emptyTrash(): void {
  saveDocuments(getDocuments().filter((d) => !d.deletedAt));
}

export function exportWorkspace(): string {
  return JSON.stringify(getDocuments(), null, 2);
}

export function importWorkspace(incoming: Doc[]): void {
  const existing = getDocuments();
  const usedIds = new Set(existing.map((d) => d.id));
  const toImport = incoming.map((doc) => {
    let newId = doc.id;
    if (usedIds.has(newId)) {
      let n = 1;
      while (usedIds.has(`${doc.id}(${n})`)) n++;
      newId = `${doc.id}(${n})`;
    }
    usedIds.add(newId);
    return { ...doc, tags: doc.tags ?? [], history: doc.history ?? [], id: newId };
  });
  saveDocuments([...existing, ...toImport]);
}
