'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { broadcastPush } from '@/lib/push-client';

const field = 'h-12 w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 text-[16px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30';
const label = 'mb-2 block px-1 text-[13px] font-medium text-zinc-400';

/** <input type="datetime-local"> value for now + hours, in the device's local time. */
function localIn(hours: number) {
  const d = new Date(Date.now() + hours * 3600_000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const PRESETS = [{ h: 24, l: '24 h' }, { h: 48, l: '48 h' }, { h: 72, l: '3 dni' }, { h: 168, l: '7 dni' }];

export default function NewCircularVotePage() {
  const router = useRouter();
  const { org } = useParams<{ org: string }>();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [secret, setSecret] = useState(false);
  const [closesAt, setClosesAt] = useState(() => localIn(48));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const deadline = new Date(closesAt);
    if (!title.trim()) return;
    if (!(deadline.getTime() > Date.now() + 10 * 60_000)) { setError('Termin musi być co najmniej 10 minut od teraz.'); return; }
    setBusy(true); setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: term } = await supabase
      .from('terms').select('id, organ_id, organs!inner(organizations!inner(slug))')
      .eq('organs.organizations.slug', org).eq('is_active', true).limit(1).maybeSingle();
    if (!term || !user) { setBusy(false); setError('Brak aktywnej kadencji.'); return; }

    const now = new Date().toISOString();
    const { data: session, error: e1 } = await supabase.from('sessions').insert({
      organ_id: term.organ_id, term_id: term.id, kind: 'circular', title: title.trim(),
      session_type: 'extraordinary', mode: 'remote', attendance_mode: 'self',
      scheduled_at: now, opened_at: now, status: 'in_progress', chaired_by: user.id, created_by: user.id,
    }).select('id').single();
    if (e1 || !session) { setBusy(false); setError(e1?.message ?? 'Nie udało się utworzyć głosowania.'); return; }

    const { data: item } = await supabase.from('agenda_items').insert({
      session_id: session.id, position: 1, title: title.trim(), item_type: 'resolution',
      description: body.trim() || null, status: 'in_progress',
    }).select('id').single();
    const { data: vote, error: e3 } = await supabase.from('votes').insert({
      session_id: session.id, agenda_item_id: item?.id ?? null, title: `Głosowanie: ${title.trim()}`,
      vote_type: secret ? 'secret' : 'open', vote_kind: 'motion', status: 'open', opened_at: now,
      closes_at: deadline.toISOString(),
    }).select('id').single();
    if (e3 || !vote) {
      await supabase.from('sessions').delete().eq('id', session.id);
      setBusy(false); setError(e3?.message ?? 'Nie udało się otworzyć głosowania.'); return;
    }
    await supabase.rpc('log_audit', { p_action: 'vote.opened', p_target_type: 'vote', p_target_id: vote.id, p_metadata: { circular: true, vote_type: secret ? 'secret' : 'open' } });
    broadcastPush('vote_opened', vote.id);
    router.push(`/${org}/circular/${session.id}`);
  };

  return (
    <div className="max-w-lg">
      <Link href={`/${org}/sessions`}
        className="press -ml-2 mb-3 inline-flex h-9 items-center gap-0.5 rounded-xl pl-1 pr-3 text-[15px] text-indigo-300 hover:bg-zinc-800/40">
        <ChevronLeft className="h-5 w-5" /> Posiedzenia
      </Link>
      <h1 className="text-[22px] font-semibold tracking-tight text-zinc-50">Głosowanie obiegowe</h1>
      <p className="mt-1 text-sm text-zinc-500">Radni głosują zdalnie do wybranego terminu. Obowiązuje kworum: musi zagłosować ponad połowa składu.</p>

      <form onSubmit={submit} className="mt-6 space-y-6">
        <div>
          <label htmlFor="c-title" className={label}>W sprawie</label>
          <input id="c-title" required value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300}
            placeholder="np. przyjęcia budżetu Juwenaliów 2027" className={field} />
        </div>
        <div>
          <label htmlFor="c-body" className={label}>Projekt uchwały / uzasadnienie <span className="font-normal text-zinc-600">(opcjonalnie)</span></label>
          <textarea id="c-body" rows={6} value={body} onChange={(e) => setBody(e.target.value)}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-3 text-[16px] leading-relaxed text-zinc-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30" />
          <p className="mt-1.5 px-1 text-[12px] text-zinc-500">Załączniki (PDF itp.) dodasz na stronie głosowania zaraz po utworzeniu.</p>
        </div>

        <div>
          <div className={label}>Rodzaj</div>
          <div role="radiogroup" aria-label="Rodzaj głosowania" className="grid grid-cols-2 rounded-xl bg-zinc-900 p-1 ring-1 ring-zinc-800">
            {[{ v: false, l: 'Jawne' }, { v: true, l: 'Tajne' }].map((o) => (
              <button key={o.l} type="button" role="radio" aria-checked={secret === o.v} onClick={() => setSecret(o.v)}
                className={clsx('h-10 rounded-lg text-[14px] font-medium transition-colors',
                  secret === o.v ? 'bg-zinc-700/80 text-zinc-50 shadow-sm' : 'text-zinc-400 hover:text-zinc-200')}>
                {o.l}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="c-deadline" className={label}>Termin zakończenia</label>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button key={p.h} type="button" onClick={() => setClosesAt(localIn(p.h))}
                className="press h-9 rounded-full bg-zinc-800 px-3.5 text-[13px] font-medium text-zinc-300 hover:bg-zinc-700">
                za {p.l}
              </button>
            ))}
          </div>
          <input id="c-deadline" type="datetime-local" required suppressHydrationWarning value={closesAt} onChange={(e) => setClosesAt(e.target.value)} className={field} />
          <p className="mt-1.5 px-1 text-[12px] text-zinc-500">Po terminie głosowanie zamknie się samo i policzy wynik.</p>
        </div>

        {error && <p role="alert" className="px-1 text-sm text-red-400">{error}</p>}
        <div className="grid grid-cols-[1fr_2fr] gap-2.5">
          <button type="button" onClick={() => router.back()}
            className="press h-12 rounded-xl border border-zinc-700 text-[15px] text-zinc-300 hover:border-zinc-500">Anuluj</button>
          <button type="submit" disabled={busy || !title.trim()}
            className="press h-12 rounded-xl bg-indigo-600 text-[15px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
            {busy ? 'Otwieranie…' : 'Otwórz głosowanie'}
          </button>
        </div>
      </form>
    </div>
  );
}
