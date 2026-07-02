'use client';

import { clsx } from 'clsx';
import { format } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { toCsv, downloadCsv } from '@/lib/csv';
import type { AttendanceMode, AttendanceStatus } from '@/types/database';
import type { MandateWithProfile, AttendanceWithMandate } from '@/lib/use-live-session';

const OPTIONS: { value: AttendanceStatus; label: string; tone: string }[] = [
  { value: 'present', label: 'Obecny', tone: 'bg-emerald-600 text-white' },
  { value: 'late', label: 'Spóźniony', tone: 'bg-amber-600 text-white' },
  { value: 'excused', label: 'Usprawiedliwiony', tone: 'bg-zinc-600 text-white' },
  { value: 'left_early', label: 'Wyszedł', tone: 'bg-orange-700 text-white' },
  { value: 'absent', label: 'Nieobecny', tone: 'bg-red-700 text-white' },
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

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-zinc-300">Lista obecności (prowadzący)</h2>
        <div className="flex items-center gap-2">
          <button onClick={exportCsv}
            className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors">
            Eksport CSV
          </button>
          <div className="flex items-center gap-1 rounded-md border border-zinc-700 p-0.5 text-xs">
            <button onClick={() => setMode('chair')}
              className={clsx('rounded px-2 py-1 transition-colors', mode === 'chair' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200')}>
              Prowadzący
            </button>
            <button onClick={() => setMode('self')}
              className={clsx('rounded px-2 py-1 transition-colors', mode === 'self' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200')}>
              Samodzielnie
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        {sorted.map((m) => {
          const current = statusBy.get(m.id) ?? 'absent';
          return (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-800/80 bg-zinc-900/40 px-3 py-2">
              <span className="min-w-0 truncate text-sm text-zinc-200">{m.profile?.full_name ?? '—'}</span>
              <div className="flex flex-wrap gap-1">
                {OPTIONS.map((o) => (
                  <button key={o.value} onClick={() => set(m.id, o.value)}
                    className={clsx('rounded px-2 py-1 text-xs transition-colors',
                      current === o.value ? o.tone : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200')}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {!sorted.length && <p className="text-xs text-zinc-600">Brak mandatów w kadencji.</p>}
      </div>
      {mode === 'self' && (
        <p className="mt-3 text-xs text-zinc-600">Tryb „Samodzielnie": radni mogą sami potwierdzać obecność.</p>
      )}
    </div>
  );
}
