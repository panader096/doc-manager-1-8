'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getDocument, updateDocument, Doc } from '../../lib/documents';

const AUTOSAVE_DELAY = 400;

export default function DocPage() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<Doc | null | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const found = getDocument(id);
    setDoc(found ?? null);
  }, [id]);

  function handleChange(field: 'title' | 'body', value: string) {
    if (!doc) return;
    const updated = { ...doc, [field]: value, updatedAt: new Date().toISOString() };
    setDoc(updated);

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      updateDocument(id, { [field]: value });
      window.dispatchEvent(new Event('docs-updated'));
    }, AUTOSAVE_DELAY);
  }

  // Loading
  if (doc === undefined) return null;

  // Not found
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
    <div className="flex flex-col h-full px-10 py-10 max-w-3xl mx-auto w-full">
      <input
        type="text"
        value={doc.title}
        onChange={(e) => handleChange('title', e.target.value)}
        placeholder="Untitled"
        className="text-2xl font-bold text-gray-900 bg-transparent border-none outline-none w-full mb-6 placeholder-gray-300"
      />
      <textarea
        value={doc.body}
        onChange={(e) => handleChange('body', e.target.value)}
        placeholder="Start writing…"
        className="flex-1 text-gray-700 text-base leading-relaxed bg-transparent border-none outline-none resize-none placeholder-gray-300"
      />
    </div>
  );
}
