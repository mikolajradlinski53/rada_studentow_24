'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { Check, Upload } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { OrgModule } from '@/types/database';
import { updateBranding } from './actions';

const MODULE_LABEL: Record<OrgModule, string> = {
  sessions: 'Posiedzenia', resolutions: 'Uchwały', audit: 'Logi (Komisja Rewizyjna)',
};
const TOGGLEABLE: OrgModule[] = ['resolutions', 'audit'];

export function BrandingSection({
  slug, orgId, name: name0, accentColor, logoUrl, enabledModules,
}: {
  slug: string;
  orgId: string;
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

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const uploadLogo = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) { setError('Logo może mieć najwyżej 2 MB.'); return; }
    setUploading(true); setError(null);
    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${orgId}/logo-${Date.now()}.${ext}`;
    const supabase = createClient();
    const { error: upErr } = await supabase.storage.from('branding').upload(path, file, { contentType: file.type, upsert: true });
    setUploading(false);
    if (upErr) { setError('Nie udało się wgrać logo.'); return; }
    setLogo(supabase.storage.from('branding').getPublicUrl(path).data.publicUrl);
    setSaved(false);
  };

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

  const field = 'h-12 w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 text-[16px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30';
  const label = 'mb-2 block px-1 text-[13px] font-medium text-zinc-400';

  return (
    <section>
      <h2 className="mb-2.5 text-[13px] font-medium uppercase tracking-wide text-zinc-500">Wygląd</h2>
      <div className="space-y-5 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 sm:p-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="b-name" className={label}>Nazwa wyświetlana</label>
            <input id="b-name" value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} className={field} />
          </div>
          <div>
            <label htmlFor="b-accent" className={label}>Kolor akcentu</label>
            <div className="flex items-center gap-2.5">
              <input type="color" value={accent} aria-label="Wybierz kolor" onChange={(e) => { setAccent(e.target.value); setSaved(false); }}
                className="h-12 w-14 shrink-0 cursor-pointer rounded-xl border border-zinc-700 bg-zinc-800 p-1" />
              <input id="b-accent" value={accent} onChange={(e) => { setAccent(e.target.value); setSaved(false); }} className={clsx(field, 'font-mono')} />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="b-logo" className={label}>Logo (adres obrazka)</label>
            <div className="flex items-center gap-2.5">
              <input id="b-logo" value={logo} onChange={(e) => { setLogo(e.target.value); setSaved(false); }}
                placeholder="https://…/logo.png" className={field} />
              {logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="Podgląd logo" className="h-12 w-12 shrink-0 rounded-xl border border-zinc-800 bg-zinc-950 object-contain p-1.5" />
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ''; }} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="press mt-2 flex h-10 items-center gap-1.5 rounded-xl border border-zinc-700 px-3.5 text-[13px] font-medium text-zinc-200 hover:border-zinc-500 disabled:opacity-50">
              <Upload className="h-4 w-4" /> {uploading ? 'Wgrywanie…' : 'Wgraj plik z logo'}
            </button>
            <p className="mt-1.5 px-1 text-[12px] text-zinc-500">PNG, JPG, WebP lub SVG do 2 MB. Najlepiej kwadratowe, na przezroczystym tle.</p>
          </div>
        </div>

        <div>
          <div className={label}>Moduły</div>
          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/40">
            <ModuleRow label={MODULE_LABEL.sessions} hint="Zawsze włączone" checked disabled onChange={() => {}} />
            {TOGGLEABLE.map((m) => (
              <ModuleRow key={m} label={MODULE_LABEL[m]} checked={modules.includes(m)} onChange={() => { toggle(m); setSaved(false); }} />
            ))}
          </div>
        </div>

        {error && <p role="alert" className="px-1 text-sm text-red-400">{error}</p>}
        <button disabled={isPending} onClick={save}
          className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-[15px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
          {saved ? <><Check className="h-4 w-4" /> Zapisano</> : isPending ? 'Zapisywanie…' : 'Zapisz wygląd'}
        </button>
      </div>
    </section>
  );
}

function ModuleRow({ label, hint, checked, disabled, onChange }: { label: string; hint?: string; checked: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-zinc-800/80 px-4 py-3 first:border-t-0">
      <div className="min-w-0">
        <div className={clsx('text-[15px]', disabled ? 'text-zinc-400' : 'text-zinc-100')}>{label}</div>
        {hint && <div className="text-[12px] text-zinc-500">{hint}</div>}
      </div>
      <button role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={onChange}
        className={clsx('relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50',
          checked ? 'bg-emerald-500' : 'bg-zinc-700')}>
        <span className={clsx('absolute top-[2px] left-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-md transition-transform duration-200 ease-[var(--ease-out)]',
          checked && 'translate-x-5')} />
      </button>
    </div>
  );
}
