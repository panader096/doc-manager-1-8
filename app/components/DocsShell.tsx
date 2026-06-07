'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import CommandPalette from './CommandPalette';

export default function DocsShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg-app)' }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-10 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — always visible on desktop, drawer on mobile */}
      <div
        className={`fixed md:relative z-20 h-full transition-transform duration-200 md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <Sidebar />
      </div>

      {/* Content */}
      <main className="flex-1 overflow-auto min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <div
          className="flex items-center gap-3 px-4 py-3 border-b md:hidden flex-shrink-0"
          style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
            style={{ color: 'var(--text-2)' }}
            className="transition-colors hover:opacity-70"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect y="2" width="18" height="2" rx="1" fill="currentColor" />
              <rect y="8" width="18" height="2" rx="1" fill="currentColor" />
              <rect y="14" width="18" height="2" rx="1" fill="currentColor" />
            </svg>
          </button>
          <span className="text-[13px]" style={{ color: 'var(--text-3)' }}>Documents</span>
        </div>

        <div className="flex-1 overflow-auto">{children}</div>
      </main>
      <CommandPalette />
    </div>
  );
}
