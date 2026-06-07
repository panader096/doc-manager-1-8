export interface Doc {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  starred?: boolean;
}

const STORAGE_KEY = 'doc_manager_documents';

export function getDocuments(): Doc[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveDocuments(docs: Doc[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
}

export function createDocument(): Doc {
  const doc: Doc = {
    id: crypto.randomUUID(),
    title: 'Untitled',
    body: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    starred: false,
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

export function toggleStar(id: string): void {
  saveDocuments(
    getDocuments().map((d) =>
      d.id === id ? { ...d, starred: !d.starred } : d
    )
  );
}

export function deleteDocument(id: string): void {
  saveDocuments(getDocuments().filter((d) => d.id !== id));
}
