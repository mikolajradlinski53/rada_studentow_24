'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export function AuditFilters({ actions }: { actions: [string, string][] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`);
  };

  const action = params.get('action') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const hasAny = action || from || to;

  return (
    <div className="mb-5 flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Akcja</label>
        <select value={action} onChange={(e) => setParam('action', e.target.value)}
          className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 focus:border-indigo-500 focus:outline-none">
          <option value="">Wszystkie</option>
          {actions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Od</label>
        <input type="date" value={from} onChange={(e) => setParam('from', e.target.value)}
          className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 focus:border-indigo-500 focus:outline-none" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Do</label>
        <input type="date" value={to} onChange={(e) => setParam('to', e.target.value)}
          className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 focus:border-indigo-500 focus:outline-none" />
      </div>
      {hasAny && (
        <button onClick={() => router.replace(pathname)}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
          Wyczyść
        </button>
      )}
    </div>
  );
}
