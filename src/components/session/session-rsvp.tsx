'use client';

import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Check, ChevronDown, UserCheck, UserX } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { SessionRsvp } from '@/types/database';

type RosterEntry = { mandateId: string; name: string };

/**
 * "Będę / nie będę" before a sitting. A "no" with a reason is the member's
 * usprawiedliwienie. Everyone sees the counts and the quorum forecast; the
 * chair also sees names (who to chase before the sitting).
 */
export function SessionRsvpCard({
  sessionId, myMandateId, canManage, roster, required, initial,
}: {
  sessionId: string;
  myMandateId: string;
  canManage: boolean;
  roster: RosterEntry[];
  required: number;
  initial: SessionRsvp[];
}) {
  const [rows, setRows] = useState<SessionRsvp[]>(initial);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState(initial.find((r) => r.mandate_id === myMandateId)?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [showNames, setShowNames] = useState(false);

  // Live: others' answers appear without reload.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`rsvp-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_rsvps', filter: `session_id=eq.${sessionId}` }, () => {
        supabase.from('session_rsvps').select('*').eq('session_id', sessionId)
          .then(({ data }) => setRows((data as SessionRsvp[]) ?? []));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId]);

  const mine = rows.find((r) => r.mandate_id === myMandateId) ?? null;
  const isMember = !!myMandateId && roster.some((r) => r.mandateId === myMandateId);

  const byStatus = useMemo(() => {
    const yes = new Set(rows.filter((r) => r.status === 'yes').map((r) => r.mandate_id));
    const no = new Map(rows.filter((r) => r.status === 'no').map((r) => [r.mandate_id, r.note]));
    return {
      yes: roster.filter((m) => yes.has(m.mandateId)),
      no: roster.filter((m) => no.has(m.mandateId)).map((m) => ({ ...m, note: no.get(m.mandateId) })),
      none: roster.filter((m) => !yes.has(m.mandateId) && !no.has(m.mandateId)),
    };
  }, [rows, roster]);

  const answer = async (status: 'yes' | 'no', withNote?: string) => {
    if (!myMandateId) return;
    setBusy(true);
    const payload = {
      session_id: sessionId, mandate_id: myMandateId, status,
      note: status === 'no' ? (withNote ?? note).trim() || null : null, updated_at: new Date().toISOString(),
    };
    const { error } = await createClient().from('session_rsvps').upsert(payload, { onConflict: 'session_id,mandate_id' });
    setBusy(false);
    if (error) { alert('Nie udało się zapisać odpowiedzi.'); return; }
    navigator.vibrate?.(20);
    setRows((cur) => [...cur.filter((r) => r.mandate_id !== myMandateId), payload as SessionRsvp]);
    setNoteOpen(false);
  };

  const forecastOk = byStatus.yes.length >= required;

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50">
      {isMember && (
        <div className="border-b border-zinc-800/80 p-4">
          <div className="text-[15px] font-medium text-zinc-100">Będziesz na posiedzeniu?</div>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <button onClick={() => answer('yes')} disabled={busy} aria-pressed={mine?.status === 'yes'}
              className={clsx('press flex h-12 items-center justify-center gap-2 rounded-xl text-[15px] font-semibold',
                mine?.status === 'yes' ? 'bg-emerald-600 text-white' : 'border border-zinc-700 text-zinc-200 hover:border-zinc-500')}>
              <UserCheck className="h-4 w-4" /> Będę
            </button>
            <button onClick={() => (mine?.status === 'no' ? setNoteOpen((v) => !v) : (setNoteOpen(true), answer('no', note)))} disabled={busy}
              aria-pressed={mine?.status === 'no'}
              className={clsx('press flex h-12 items-center justify-center gap-2 rounded-xl text-[15px] font-semibold',
                mine?.status === 'no' ? 'bg-zinc-700 text-zinc-50' : 'border border-zinc-700 text-zinc-200 hover:border-zinc-500')}>
              <UserX className="h-4 w-4" /> Nie będę
            </button>
          </div>
          {mine?.status === 'no' && (noteOpen || !mine.note) && (
            <div className="mt-3 space-y-2">
              <label htmlFor="rsvp-note" className="block px-1 text-[13px] font-medium text-zinc-400">
                Usprawiedliwienie <span className="font-normal text-zinc-600">(opcjonalnie)</span>
              </label>
              <textarea id="rsvp-note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="np. kolokwium, zajęcia obowiązkowe"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-3 text-[16px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30" />
              <button onClick={() => answer('no')} disabled={busy}
                className="press h-10 rounded-xl bg-indigo-600 px-4 text-[14px] font-semibold text-white disabled:opacity-50">
                Zapisz usprawiedliwienie
              </button>
            </div>
          )}
          {mine?.status === 'no' && mine.note && !noteOpen && (
            <p className="mt-2 px-1 text-[13px] text-zinc-500">Usprawiedliwienie: {mine.note}</p>
          )}
        </div>
      )}

      <div className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 text-[14px] tabular-nums">
            <span className="text-emerald-400"><b className="font-semibold">{byStatus.yes.length}</b> będzie</span>
            <span className="text-zinc-400"><b className="font-semibold">{byStatus.no.length}</b> nie</span>
            <span className="text-zinc-500"><b className="font-semibold">{byStatus.none.length}</b> bez odpowiedzi</span>
          </div>
          <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-medium',
            forecastOk ? 'bg-emerald-900/50 text-emerald-300' : 'bg-amber-900/40 text-amber-300')}>
            {forecastOk && <Check className="h-3 w-3" strokeWidth={3} />}
            {forecastOk ? 'Kworum zapowiada się' : `Do kworum brakuje ${required - byStatus.yes.length}`}
          </span>
        </div>

        {canManage && (
          <>
            <button onClick={() => setShowNames((v) => !v)} aria-expanded={showNames}
              className="press mt-3 flex h-9 items-center gap-1 rounded-xl px-2 text-[13px] font-medium text-indigo-300 hover:bg-indigo-950/40">
              {showNames ? 'Ukryj listę' : 'Pokaż kto'} <ChevronDown className={clsx('h-4 w-4 transition-transform', showNames && 'rotate-180')} />
            </button>
            {showNames && (
              <div className="mt-2 space-y-3 text-[14px]">
                <NameGroup title="Będzie" tone="text-emerald-400" names={byStatus.yes.map((m) => m.name)} />
                <NameGroup title="Nie będzie" tone="text-zinc-300" names={byStatus.no.map((m) => (m.note ? `${m.name} (${m.note})` : m.name))} />
                <NameGroup title="Bez odpowiedzi" tone="text-amber-300" names={byStatus.none.map((m) => m.name)} />
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function NameGroup({ title, tone, names }: { title: string; tone: string; names: string[] }) {
  if (!names.length) return null;
  return (
    <div>
      <div className={clsx('mb-1 px-1 text-[12px] font-semibold uppercase tracking-wide', tone)}>{title} · {names.length}</div>
      <div className="flex flex-wrap gap-1.5">
        {names.map((n) => <span key={n} className="rounded-full bg-zinc-800 px-2.5 py-1 text-[13px] text-zinc-300">{n}</span>)}
      </div>
    </div>
  );
}
