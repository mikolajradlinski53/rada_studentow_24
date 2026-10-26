import { Search, X } from 'lucide-react';

/** Plain GET search form (works without JS; the query lives in the URL). */
export function SearchBox({ action, q, placeholder }: { action: string; q: string; placeholder: string }) {
  return (
    <form action={action} method="get" role="search" className="relative">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
      <label htmlFor="q" className="sr-only">{placeholder}</label>
      <input id="q" name="q" type="search" defaultValue={q} placeholder={placeholder} enterKeyHint="search"
        className="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-900/60 pl-10 pr-10 text-[16px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30" />
      {q && (
        <a href={action} aria-label="Wyczyść wyszukiwanie"
          className="press absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200">
          <X className="h-4 w-4" />
        </a>
      )}
    </form>
  );
}

/** Safe ilike pattern for a PostgREST .or() filter (strips filter syntax). */
export function searchPattern(q: string) {
  const clean = q.replace(/[%_,()*\\:."]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return clean ? `%${clean}%` : null;
}
