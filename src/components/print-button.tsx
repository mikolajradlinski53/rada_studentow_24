'use client';

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors print:hidden"
    >
      Drukuj / Zapisz jako PDF
    </button>
  );
}
