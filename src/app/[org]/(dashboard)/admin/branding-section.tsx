'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { OrgModule } from '@/types/database';
import { updateBranding } from './actions';

const MODULE_LABEL: Record<OrgModule, string> = {
  sessions: 'Posiedzenia', resolutions: 'Uchwały', audit: 'Logi (Komisja Rewizyjna)',
};
const TOGGLEABLE: OrgModule[] = ['resolutions', 'audit'];

export function BrandingSection({
  slug, name: name0, accentColor, logoUrl, enabledModules,
}: {
  slug: string;
  name: string;
  accentColor: string | null;
  logoUrl: string | null;
  enabledModules: OrgModule[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(name0);
  const [accent, setAccent] = useState(accentColor ?? '#4f46e5');
  const [logo, setLogo] = useState(logoUrl ?? '');
  const [modules, setModules] = useState<OrgModule[]>(enabledModules);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const toggle = (m: OrgModule) =>
    setModules((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));

  const save = () => {
    setError(null); setSaved(false);
    startTransition(async () => {
      const res = await updateBranding(slug, { name, accent_color: accent, logo_url: logo, enabled_modules: modules });
      if (res?.error) setError(res.error);
      else { setSaved(true); router.refresh(); }
    });
  };

  return (
    <div className="mb-10 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <h2 className="mb-3 text-sm font-medium text-zinc-300">Wygląd i moduły organizacji</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-zinc-400">Nazwa wyświetlana</label>
          <input value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }}
            className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-indigo-500 focus:outline-none" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-400">Kolor akcentu</label>
          <div className="flex items-center gap-2">
            <input type="color" value={accent} onChange={(e) => { setAccent(e.target.value); setSaved(false); }}
              className="h-9 w-12 shrink-0 cursor-pointer rounded border border-zinc-700 bg-zinc-800" />
            <input value={accent} onChange={(e) => { setAccent(e.target.value); setSaved(false); }}
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-indigo-500 focus:outline-none" />
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs text-zinc-400">Logo (URL)</label>
          <div className="flex items-center gap-3">
            <input value={logo} onChange={(e) => { setLogo(e.target.value); setSaved(false); }}
              placeholder="https://…/logo.png"
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-indigo-500 focus:outline-none" />
            {logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="Podgląd logo" className="h-9 w-9 shrink-0 rounded object-contain" />
            )}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 text-xs text-zinc-400">Włączone moduły</div>
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm text-zinc-500">
            <input type="checkbox" checked disabled className="accent-indigo-600" />
            {MODULE_LABEL.sessions} <span className="text-xs">(zawsze)</span>
          </label>
          {TOGGLEABLE.map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={modules.includes(m)} onChange={() => { toggle(m); setSaved(false); }} className="accent-indigo-600" />
              {MODULE_LABEL[m]}
            </label>
          ))}
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      <div className="mt-4 flex items-center gap-2">
        <button disabled={isPending} onClick={save}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors">
          {isPending ? 'Zapisywanie…' : 'Zapisz wygląd'}
        </button>
        {saved && <span className="text-xs text-emerald-400">✓ Zapisano — odśwież, by zobaczyć zmiany w menu</span>}
      </div>
    </div>
  );
}
