'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createOrganization, type NewOrgFields } from './actions';

const EMPTY: NewOrgFields = {
  name: '', slug: '', organName: '', organShort: '', totalSeats: 15,
  termLabel: '2026-2027', termStarts: '2026-10-01', termEnds: '2027-09-30', adminEmail: '',
};

function slugify(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

export function NewOrgForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [f, setF] = useState<NewOrgFields>(EMPTY);
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof NewOrgFields>(k: K, v: NewOrgFields[K]) => setF((cur) => ({ ...cur, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createOrganization(f);
      if (res.error) { setError(res.error); return; }
      router.push(`/${res.slug}/admin?tab=organizacja`);
    });
  };

  const field = 'h-12 w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 text-[16px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30';
  const label = 'mb-2 block px-1 text-[13px] font-medium text-zinc-400';

  return (
    <form onSubmit={submit} className="space-y-5 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 sm:p-5">
      <div>
        <label htmlFor="n-name" className={label}>Nazwa organizacji</label>
        <input id="n-name" required value={f.name} placeholder="np. Samorząd Studentów UWr"
          onChange={(e) => { set('name', e.target.value); if (!slugTouched) set('slug', slugify(e.target.value)); }} className={field} />
      </div>
      <div>
        <label htmlFor="n-slug" className={label}>Adres w aplikacji</label>
        <div className="flex items-center gap-2">
          <span className="text-[15px] text-zinc-500">/</span>
          <input id="n-slug" required value={f.slug} onChange={(e) => { setSlugTouched(true); set('slug', e.target.value); }}
            placeholder="uwr" className={field} />
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
        <div>
          <label htmlFor="n-organ" className={label}>Organ</label>
          <input id="n-organ" required value={f.organName} placeholder="Rada Uczelniana Samorządu Studentów"
            onChange={(e) => set('organName', e.target.value)} className={field} />
        </div>
        <div>
          <label htmlFor="n-short" className={label}>Skrót</label>
          <input id="n-short" required value={f.organShort} placeholder="RUSS" onChange={(e) => set('organShort', e.target.value)} className={field} />
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="n-seats" className={label}>Miejsca w składzie</label>
          <input id="n-seats" type="number" min={1} inputMode="numeric" value={f.totalSeats}
            onChange={(e) => set('totalSeats', Number(e.target.value))} className={field} />
        </div>
        <div>
          <label htmlFor="n-term" className={label}>Kadencja</label>
          <input id="n-term" required value={f.termLabel} onChange={(e) => set('termLabel', e.target.value)} className={field} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="n-from" className={label}>Od</label>
          <input id="n-from" type="date" required value={f.termStarts} onChange={(e) => set('termStarts', e.target.value)} className={field} />
        </div>
        <div>
          <label htmlFor="n-to" className={label}>Do</label>
          <input id="n-to" type="date" required value={f.termEnds} onChange={(e) => set('termEnds', e.target.value)} className={field} />
        </div>
      </div>
      <div>
        <label htmlFor="n-admin" className={label}>Email pierwszego administratora <span className="font-normal text-zinc-600">(opcjonalnie)</span></label>
        <input id="n-admin" type="email" inputMode="email" value={f.adminEmail} onChange={(e) => set('adminEmail', e.target.value)}
          placeholder="przewodniczacy@uczelnia.pl" className={field} />
      </div>

      {error && <p role="alert" className="px-1 text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={isPending}
        className="press h-12 w-full rounded-xl bg-indigo-600 text-[15px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
        {isPending ? 'Tworzenie…' : 'Utwórz organizację'}
      </button>
    </form>
  );
}
