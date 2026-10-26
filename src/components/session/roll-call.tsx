'use client';

import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Download } from 'lucide-react';
import { format } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { toCsv, downloadCsv } from '@/lib/csv';
import type { AttendanceMode, AttendanceStatus, SessionRsvp } from '@/types/database';
import type { MandateWithProfile, AttendanceWithMandate } from '@/lib/use-live-session';

const OPTIONS: { value: AttendanceStatus; label: string; short: string; tone: string }[] = [
  { value: 'present', label: 'Obecny', short: 'Obecny', tone: 'bg-emerald-600 text-white' },
  { value: 'late', label: 'Spóźniony', short: 'Spóźn.', tone: 'bg-amber-600 text-white' },
  { value: 'excused', label: 'Usprawiedliwiony', short: 'Uspraw.', tone: 'bg-zinc-600 text-white' },
  { value: 'left_early', label: 'Wyszedł wcześniej', short: 'Wyszedł', tone: 'bg-orange-700 text-white' },
  { value: 'absent', label: 'Nieobecny', short: 'Nieob.', tone: 'bg-red-700 text-white' },
];

const STATUS_PL: Record<AttendanceStatus, string> = {
  present: 'Obecny', late: 'Spóźniony', excused: 'Usprawiedliwiony',
  left_early: 'Wyszedł wcześniej', absent: 'Nieobecny',
};

export function RollCall({
  sessionId, roster, attendance, mode,
}: {
  sessionId: string;
  roster: MandateWithProfile[];
  attendance: AttendanceWithMandate[];
  mode: AttendanceMode;
}) {
  const supabase = createClient();
  const statusBy = new Map(attendance.map((a) => [a.mandate_id, a.status]));

  // Pre-sitting "nie będę" answers - shown as a hint so the chair can mark excused in one tap.
  const [declined, setDeclined] = useState<Map<string, string | null>>(new Map());
  useEffect(() => {
    createClient().from('session_rsvps').select('mandate_id, status, note').eq('session_id', sessionId).eq('status', 'no')
      .then(({ data }) => setDeclined(new Map(((data as Pick<SessionRsvp, 'mandate_id' | 'note'>[]) ?? []).map((r) => [r.mandate_id, r.note]))));
  }, [sessionId]);
  const attBy = new Map(attendance.map((a) => [a.mandate_id, a]));

  const set = async (mandateId: string, status: AttendanceStatus) => {
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { session_id: sessionId, mandate_id: mandateId, status };
    if (status === 'present' || status === 'late') { patch.checked_in_at = now; patch.checked_out_at = null; }
    else if (status === 'left_early') { patch.checked_out_at = now; }
    else { patch.checked_in_at = null; patch.checked_out_at = null; }
    await supabase.from('attendance').upsert(patch, { onConflict: 'session_id,mandate_id' });
  };

  const setMode = async (next: AttendanceMode) => {
    await supabase.from('sessions').update({ attendance_mode: next }).eq('id', sessionId);
  };

  const sorted = [...roster].sort((a, b) =>
    (a.profile?.full_name ?? '').localeCompare(b.profile?.full_name ?? '', 'pl')
  );

  const exportCsv = () => {
    const t = (iso: string | null | undefined) => (iso ? format(new Date(iso), 'yyyy-MM-dd HH:mm') : '');
    const rows: string[][] = [['Imię i nazwisko', 'Status', 'Wejście', 'Wyjście']];
    for (const m of sorted) {
      const a = attBy.get(m.id);
      rows.push([m.profile?.full_name ?? '', STATUS_PL[a?.status ?? 'absent'], t(a?.checked_in_at), t(a?.checked_out_at)]);
    }
    downloadCsv(`obecnosc-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  };

  const presentN = sorted.filter((m) => ['present', 'late'].includes(statusBy.get(m.id) ?? 'absent')).length;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-zinc-100">
          Lista obecności <span className="font-normal tabular-nums text-zinc-500">· {presentN}/{sorted.length}</span>
        </h2>
        <button onClick={exportCsv} aria-label="Eksportuj listę obecności (CSV)"
          className="press flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-zinc-700 px-3 text-[13px] font-medium text-zinc-300 hover:border-zinc-500">
          <Download className="h-3.5 w-3.5" /> CSV
        </button>
      </div>

      <div role="radiogroup" aria-label="Kto zaznacza obecność" className="mt-3 grid grid-cols-2 rounded-xl bg-zinc-950/60 p-1 ring-1 ring-zinc-800">
        {([['chair', 'Prowadzący'], ['self', 'Radni sami']] as const).map(([v, l]) => (
          <button key={v} role="radio" aria-checked={mode === v} onClick={() => setMode(v)}
            className={clsx('h-9 rounded-lg text-[13px] font-medium transition-colors',
              mode === v ? 'bg-zinc-700/80 text-zinc-50 shadow-sm' : 'text-zinc-400 hover:text-zinc-200')}>
            {l}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-1.5">
        {sorted.map((m) => {
          const current = statusBy.get(m.id) ?? 'absent';
          return (
            <div key={m.id} className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-3 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-[15px] text-zinc-100">{m.profile?.full_name ?? '-'}</div>
                {declined.has(m.id) && (
                  <div className="truncate text-[12px] text-amber-400">
                    Zgłosił(a) nieobecność{declined.get(m.id) ? `: ${declined.get(m.id)}` : ''}
                  </div>
                )}
              </div>
              <div role="radiogroup" aria-label={`Status: ${m.profile?.full_name ?? ''}`} className="mt-2 grid grid-cols-3 gap-1 min-[400px]:grid-cols-5">
                {OPTIONS.map((o) => (
                  <button key={o.value} role="radio" aria-checked={current === o.value} onClick={() => set(m.id, o.value)}
                    title={o.label}
                    className={clsx('press h-9 min-w-0 truncate rounded-lg px-1 text-[12px] font-medium transition-colors',
                      current === o.value ? o.tone : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200')}>
                    {o.short}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {!sorted.length && <p className="text-[13px] text-zinc-500">Brak mandatów w kadencji.</p>}
      </div>
      {mode === 'self' && (
        <p className="mt-3 text-[13px] text-zinc-500">Radni mogą sami potwierdzać obecność w aplikacji.</p>
      )}
    </div>
  );
}
