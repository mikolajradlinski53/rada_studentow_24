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

  const field = 'h-11 w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-3 text-[15px] text-zinc-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30';

  return (
    <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
      <div className="col-span-2 sm:col-span-1">
        <label htmlFor="f-action" className="mb-1.5 block px-1 text-[13px] font-medium text-zinc-400">Akcja</label>
        <select id="f-action" value={action} onChange={(e) => setParam('action', e.target.value)} className={field}>
          <option value="">Wszystkie</option>
          {actions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="f-from" className="mb-1.5 block px-1 text-[13px] font-medium text-zinc-400">Od</label>
        <input id="f-from" type="date" value={from} onChange={(e) => setParam('from', e.target.value)} className={field} />
      </div>
      <div>
        <label htmlFor="f-to" className="mb-1.5 block px-1 text-[13px] font-medium text-zinc-400">Do</label>
        <input id="f-to" type="date" value={to} onChange={(e) => setParam('to', e.target.value)} className={field} />
      </div>
      {hasAny && (
        <button onClick={() => router.replace(pathname)}
          className="press col-span-2 h-11 rounded-xl border border-zinc-700 px-4 text-[14px] text-zinc-300 hover:border-zinc-500 sm:col-span-1">
          Wyczyść
        </button>
      )}
    </div>
  );
}
