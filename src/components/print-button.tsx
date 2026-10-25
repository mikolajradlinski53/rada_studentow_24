'use client';

import { Printer } from 'lucide-react';

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="press flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-500 print:hidden"
    >
      <Printer className="h-4 w-4" />
      <span className="hidden sm:inline">Drukuj / PDF</span><span className="sm:hidden">PDF</span>
    </button>
  );
}
