'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { updateOrganTerm, type OrganTermFields } from './actions';

/** Organ + active term settings; the term label goes into every resolution signature. */
export function OrganSection({ slug, initial, signaturePattern }: { slug: string; initial: OrganTermFields; signaturePattern: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [f, setF] = useState<OrganTermFields>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof OrganTermFields>(k: K, v: OrganTermFields[K]) => { setF((cur) => ({ ...cur, [k]: v })); setSaved(false); };

  const save = () => {
    setError(null);
    startTransition(async () => {
      const res = await updateOrganTerm(slug, f);
      if (res.error) setError(res.error);
      else { setSaved(true); router.refresh(); }
    });
  };

  const field = 'h-12 w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 text-[16px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30';
  const label = 'mb-2 block px-1 text-[13px] font-medium text-zinc-400';
  const example = signaturePattern
    .replace('{nr}', '1')
    .replace('{kadencja}', f.termLabel || '…')
    .replace('{organ}', f.organShort || '…');

  return (
    <section>
      <h2 className="mb-2.5 text-[13px] font-medium uppercase tracking-wide text-zinc-500">Organ i kadencja</h2>
      <div className="space-y-5 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 sm:p-5">
        <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
          <div>
            <label htmlFor="o-name" className={label}>Nazwa organu</label>
            <input id="o-name" value={f.organName} onChange={(e) => set('organName', e.target.value)} className={field} />
          </div>
          <div>
            <label htmlFor="o-short" className={label}>Skrót</label>
            <input id="o-short" value={f.organShort} onChange={(e) => set('organShort', e.target.value)} className={field} />
          </div>
        </div>
        <div>
          <label htmlFor="o-seats" className={label}>Liczba miejsc w składzie</label>
          <input id="o-seats" type="number" inputMode="numeric" min={1} max={500} value={f.totalSeats}
            onChange={(e) => set('totalSeats', Number(e.target.value))} className={field} />
          <p className="mt-1.5 px-1 text-[13px] text-zinc-500">Od tego liczy się kworum (więcej niż połowa składu).</p>
        </div>

        <div className="border-t border-zinc-800/80 pt-5">
          <label htmlFor="t-label" className={label}>Kadencja</label>
          <input id="t-label" value={f.termLabel} onChange={(e) => set('termLabel', e.target.value)} placeholder="np. 2026-2027" className={field} />
          <p className="mt-1.5 px-1 text-[13px] text-zinc-500">
            Sygnatura uchwały: <span className="font-medium text-zinc-300">Uchwała {example}</span>
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="t-start" className={label}>Od</label>
            <input id="t-start" type="date" value={f.termStarts} onChange={(e) => set('termStarts', e.target.value)} className={field} />
          </div>
          <div>
            <label htmlFor="t-end" className={label}>Do</label>
            <input id="t-end" type="date" value={f.termEnds} onChange={(e) => set('termEnds', e.target.value)} className={field} />
          </div>
        </div>

        {error && <p role="alert" className="px-1 text-sm text-red-400">{error}</p>}
        <button disabled={isPending} onClick={save}
          className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-[15px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
          {saved ? <><Check className="h-4 w-4" /> Zapisano</> : isPending ? 'Zapisywanie…' : 'Zapisz organ i kadencję'}
        </button>
      </div>
    </section>
  );
}
