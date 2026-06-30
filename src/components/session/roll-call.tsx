'use client';

import { clsx } from 'clsx';
import { createClient } from '@/lib/supabase/client';
import type { AttendanceMode, AttendanceStatus } from '@/types/database';
import type { MandateWithProfile, AttendanceWithMandate } from '@/lib/use-live-session';

const OPTIONS: { value: AttendanceStatus; label: string; tone: string }[] = [
  { value: 'present', label: 'Obecny', tone: 'bg-emerald-600 text-white' },
  { value: 'late', label: 'Spóźniony', tone: 'bg-amber-600 text-white' },
  { value: 'excused', label: 'Usprawiedliwiony', tone: 'bg-zinc-600 text-white' },
  { value: 'absent', label: 'Nieobecny', tone: 'bg-red-700 text-white' },
];

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

  const set = async (mandateId: string, status: AttendanceStatus) => {
    const inRoom = status === 'present' || status === 'late';
    await supabase.from('attendance').upsert(
      { session_id: sessionId, mandate_id: mandateId, status, checked_in_at: inRoom ? new Date().toISOString() : null },
      { onConflict: 'session_id,mandate_id' }
    );
  };

  const setMode = async (next: AttendanceMode) => {
    await supabase.from('sessions').update({ attendance_mode: next }).eq('id', sessionId);
  };

  const sorted = [...roster].sort((a, b) =>
    (a.profile?.full_name ?? '').localeCompare(b.profile?.full_name ?? '', 'pl')
  );

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-zinc-300">Lista obecności (prowadzący)</h2>
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
