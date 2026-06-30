'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function NewSessionPage() {
  const router = useRouter();
  const { org: orgSlug } = useParams<{ org: string }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

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
      setError('Brak aktywnej kadencji dla tej organizacji');
      setLoading(false);
      return;
    }

    const scheduledDate = form.get('date') as string;
    const scheduledTime = form.get('time') as string;
    const mode = form.get('mode') as string;

    const { data: session, error: insertError } = await supabase
      .from('sessions')
      .insert({
        organ_id: term.organ_id,
        term_id: term.id,
        title: form.get('title') as string,
        session_type: form.get('type') as string,
        mode,
        // In-person sittings default to chair-run roll call; remote/hybrid to self.
        attendance_mode: mode === 'in_person' ? 'chair' : 'self',
        scheduled_at: `${scheduledDate}T${scheduledTime}:00`,
        location: (form.get('location') as string) || null,
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
      <h1 className="text-xl font-semibold text-zinc-100 mb-8">
        Nowe posiedzenie
      </h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Title */}
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-zinc-300 mb-1.5">
            Nazwa posiedzenia
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            placeholder="np. IV Posiedzenie RUSS 2025-2026"
            className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Date + Time */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="date" className="block text-sm font-medium text-zinc-300 mb-1.5">
              Data
            </label>
            <input
              id="date"
              name="date"
              type="date"
              required
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label htmlFor="time" className="block text-sm font-medium text-zinc-300 mb-1.5">
              Godzina
            </label>
            <input
              id="time"
              name="time"
              type="time"
              required
              defaultValue="17:00"
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Type */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Typ posiedzenia
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2.5 cursor-pointer has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-950/30">
              <input type="radio" name="type" value="regular" defaultChecked className="text-indigo-600" />
              <span className="text-sm text-zinc-300">Zwyczajne</span>
            </label>
            <label className="flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2.5 cursor-pointer has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-950/30">
              <input type="radio" name="type" value="extraordinary" className="text-indigo-600" />
              <span className="text-sm text-zinc-300">Nadzwyczajne</span>
            </label>
          </div>
        </div>

        {/* Mode */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Tryb
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'in_person', label: 'Stacjonarnie' },
              { value: 'remote', label: 'Zdalnie' },
              { value: 'hybrid', label: 'Hybrydowo' },
            ].map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2.5 cursor-pointer has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-950/30">
                <input
                  type="radio"
                  name="mode"
                  value={opt.value}
                  defaultChecked={opt.value === 'in_person'}
                  className="text-indigo-600"
                />
                <span className="text-sm text-zinc-300">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Location */}
        <div>
          <label htmlFor="location" className="block text-sm font-medium text-zinc-300 mb-1.5">
            Miejsce
          </label>
          <input
            id="location"
            name="location"
            type="text"
            placeholder="np. Sala Senatu, bud. A"
            className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Tworzenie...' : 'Utwórz posiedzenie'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors"
          >
            Anuluj
          </button>
        </div>
      </form>
    </div>
  );
}
