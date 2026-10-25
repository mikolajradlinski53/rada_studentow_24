'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { clsx } from 'clsx';
import { ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const TYPES = [
  { value: 'regular', label: 'Zwyczajne' },
  { value: 'extraordinary', label: 'Nadzwyczajne' },
] as const;
const MODES = [
  { value: 'in_person', label: 'Stacjonarnie' },
  { value: 'remote', label: 'Zdalnie' },
  { value: 'hybrid', label: 'Hybrydowo' },
] as const;

const field = 'h-12 w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 text-[16px] text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30';

export default function NewSessionPage() {
  const router = useRouter();
  const { org: orgSlug } = useParams<{ org: string }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<(typeof TYPES)[number]['value']>('regular');
  const [mode, setMode] = useState<(typeof MODES)[number]['value']>('in_person');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    // Active term + organ of THIS org (scoped by slug), so a multi-org user
    // always creates the session in the org whose page they're on.
    const { data: term } = await supabase
      .from('terms')
      .select('id, organ_id, organs!inner(org_id, organizations!inner(slug))')
      .eq('organs.organizations.slug', orgSlug)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (!term) {
      setError('Brak aktywnej kadencji dla tej organizacji.');
      setLoading(false);
      return;
    }

    // Date + time are the chair's local (Polish) wall clock → send a real
    // instant. A bare "…T17:00:00" would be stored as 17:00 UTC (migration 016).
    const scheduledAt = new Date(`${form.get('date')}T${form.get('time')}`).toISOString();

    const { data: session, error: insertError } = await supabase
      .from('sessions')
      .insert({
        organ_id: term.organ_id,
        term_id: term.id,
        title: (form.get('title') as string).trim(),
        session_type: type,
        mode,
        // In-person sittings default to chair-run roll call; remote/hybrid to self.
        attendance_mode: mode === 'in_person' ? 'chair' : 'self',
        scheduled_at: scheduledAt,
        location: ((form.get('location') as string) || '').trim() || null,
        status: 'scheduled',
        chaired_by: user.id,
        created_by: user.id,
      })
      .select('id')
      .single();

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    router.push(`/${orgSlug}/sessions/${session.id}`);
  };

  return (
    <div className="max-w-lg">
      <Link href={`/${orgSlug}/sessions`}
        className="press -ml-2 mb-3 inline-flex h-9 items-center gap-0.5 rounded-xl pl-1 pr-3 text-[15px] text-indigo-300 hover:bg-zinc-800/40">
        <ChevronLeft className="h-5 w-5" /> Posiedzenia
      </Link>
      <h1 className="mb-6 text-[22px] font-semibold tracking-tight text-zinc-50">Nowe posiedzenie</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <label htmlFor="title" className="block px-1 text-[13px] font-medium text-zinc-400">Nazwa</label>
          <input id="title" name="title" type="text" required autoComplete="off"
            placeholder="np. IV Posiedzenie RUSS 2026/2027" className={field} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label htmlFor="date" className="block px-1 text-[13px] font-medium text-zinc-400">Data</label>
            <input id="date" name="date" type="date" required className={field} />
          </div>
          <div className="space-y-2">
            <label htmlFor="time" className="block px-1 text-[13px] font-medium text-zinc-400">Godzina</label>
            <input id="time" name="time" type="time" required defaultValue="17:00" className={field} />
          </div>
        </div>

        <Segmented label="Typ" options={TYPES} value={type} onChange={setType} />
        <Segmented label="Tryb" options={MODES} value={mode} onChange={setMode}
          hint={mode === 'in_person' ? 'Obecność zaznacza prowadzący.' : 'Radni sami potwierdzają obecność w aplikacji.'} />

        <div className="space-y-2">
          <label htmlFor="location" className="block px-1 text-[13px] font-medium text-zinc-400">
            Miejsce <span className="font-normal text-zinc-600">(opcjonalnie)</span>
          </label>
          <input id="location" name="location" type="text" placeholder="np. Sala Senatu, bud. A" className={field} />
        </div>

        {error && <p role="alert" className="px-1 text-sm text-red-400">{error}</p>}

        <div className="grid grid-cols-[1fr_2fr] gap-2.5 pt-2">
          <button type="button" onClick={() => router.back()}
            className="press h-12 rounded-xl border border-zinc-700 text-[15px] text-zinc-300 hover:border-zinc-500">
            Anuluj
          </button>
          <button type="submit" disabled={loading}
            className="press h-12 rounded-xl bg-indigo-600 text-[15px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
            {loading ? 'Tworzenie…' : 'Utwórz posiedzenie'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Segmented<T extends string>({
  label, options, value, onChange, hint,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="px-1 text-[13px] font-medium text-zinc-400">{label}</div>
      <div role="radiogroup" aria-label={label}
        className="grid rounded-xl bg-zinc-900 p-1 ring-1 ring-zinc-800" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
            className={clsx('h-10 rounded-lg text-[14px] font-medium transition-colors',
              value === o.value ? 'bg-zinc-700/80 text-zinc-50 shadow-sm' : 'text-zinc-400 hover:text-zinc-200')}>
            {o.label}
          </button>
        ))}
      </div>
      {hint && <p className="px-1 text-[13px] text-zinc-500">{hint}</p>}
    </div>
  );
}
