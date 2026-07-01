'use client';

import { useState } from 'react';
import { clsx } from 'clsx';
import { createClient } from '@/lib/supabase/client';
import type { FloorRequest, FormalMotionType, Mandate, Session } from '@/types/database';
import { BreakBanner } from './break-banner';

const KIND_LABEL: Record<FloorRequest['kind'], string> = {
  speak: 'Zabranie głosu',
  ad_vocem: 'Ad vocem',
  formal: 'Wniosek formalny',
};

const FORMAL_LABEL: Record<FormalMotionType, string> = {
  break: 'Przerwa',
  extend_time: 'Przedłużenie czasu',
  close_list: 'Zamknięcie listy mówców',
  reconsider: 'Reasumpcja',
  other: 'Inny wniosek',
};

const TIMED: FormalMotionType[] = ['break', 'extend_time'];

function reqLabel(r: FloorRequest): string {
  if (r.kind === 'formal') {
    const base = r.formal_type ? FORMAL_LABEL[r.formal_type] : 'Wniosek formalny';
    return TIMED.includes(r.formal_type ?? 'other') && r.minutes ? `${base} (${r.minutes} min)` : base;
  }
  return KIND_LABEL[r.kind];
}

export function Discussion({
  sessionId, session, floorRequests, myMandate, isChair, canOpenVote,
}: {
  sessionId: string;
  session: Session;
  floorRequests: FloorRequest[];
  myMandate: Mandate | null;
  isChair: boolean;
  /** true when the chair can open a vote right now (no other vote active). */
  canOpenVote: boolean;
}) {
  const supabase = createClient();
  const [showFormal, setShowFormal] = useState(false);
  const [formalType, setFormalType] = useState<FormalMotionType>('break');
  const [minutes, setMinutes] = useState(10);
  const [note, setNote] = useState('');

  const now = () => new Date().toISOString();
  const live = session.status === 'in_progress';
  const myReq = floorRequests.find((r) => r.mandate_id === myMandate?.id);
  const speaker = floorRequests.find((r) => r.status === 'speaking') ?? null;

  // === actions ===
  const request = async (kind: FloorRequest['kind'], opts?: { formal_type?: FormalMotionType; minutes?: number; note?: string }) => {
    if (!myMandate) return;
    await supabase.from('floor_requests').insert({
      session_id: sessionId,
      mandate_id: myMandate.id,
      kind,
      formal_type: opts?.formal_type ?? null,
      minutes: opts?.minutes ?? null,
      note: opts?.note?.trim() || null,
    });
  };
  const withdraw = async (id: string) => { await supabase.from('floor_requests').update({ status: 'withdrawn' }).eq('id', id); };
  const callSpeaker = async (id: string) => {
    await supabase.from('floor_requests').update({ status: 'done', ended_at: now() }).eq('session_id', sessionId).eq('status', 'speaking');
    await supabase.from('floor_requests').update({ status: 'speaking', called_at: now() }).eq('id', id);
  };
  const endSpeaker = async (id: string) => { await supabase.from('floor_requests').update({ status: 'done', ended_at: now() }).eq('id', id); };
  const reject = async (id: string) => { await supabase.from('floor_requests').update({ status: 'rejected' }).eq('id', id); };
  const acceptMotion = async (r: FloorRequest) => {
    if (r.formal_type === 'break' && r.minutes) {
      const until = new Date(Date.now() + r.minutes * 60000).toISOString();
      await supabase.from('sessions').update({ on_break_until: until }).eq('id', sessionId);
    }
    await supabase.from('floor_requests').update({ status: 'done' }).eq('id', r.id);
  };
  // Turn a formal motion into a quick open procedural vote. The motion stays in
  // the queue; after it passes the chair still clicks "Przyjmij" to enact it.
  const voteOnMotion = async (r: FloorRequest) => {
    const { data: vote } = await supabase.from('votes').insert({
      session_id: sessionId,
      title: `Wniosek formalny: ${reqLabel(r)}`,
      vote_type: 'open',
      vote_kind: 'motion',
      status: 'open',
      opened_at: now(),
    }).select('id').single();
    if (vote) {
      await supabase.rpc('log_audit', { p_action: 'vote.opened', p_target_type: 'vote', p_target_id: vote.id, p_metadata: { procedural: true } });
    }
  };
  const submitFormal = async () => {
    await request('formal', { formal_type: formalType, minutes: TIMED.includes(formalType) ? minutes : undefined, note });
    setShowFormal(false); setNote('');
  };

  return (
    <div className="space-y-3">
      <BreakBanner session={session} isChair={isChair} sessionId={sessionId} />

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-400">Dyskusja · głos i wnioski</h2>
        {speaker && (
          <span className="text-xs text-indigo-300">
            Głos ma: <span className="font-medium">{speaker.mandate?.profile?.full_name ?? '—'}</span>
          </span>
        )}
      </div>

      {/* Member request controls */}
      {myMandate && live && (
        myReq ? (
          <div className="flex items-center justify-between rounded-lg border border-indigo-800/60 bg-indigo-950/20 px-4 py-3">
            <div className="text-sm text-zinc-200">
              {reqLabel(myReq)}
              <span className="ml-2 text-xs text-zinc-500">
                {myReq.status === 'speaking' ? '· masz głos' : '· w kolejce'}
              </span>
            </div>
            {myReq.status !== 'speaking' && (
              <button onClick={() => withdraw(myReq.id)} className="text-xs text-zinc-500 hover:text-red-400 transition-colors">Wycofaj</button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button onClick={() => request('speak')}
                className="rounded-lg bg-indigo-600 py-3 text-sm font-medium text-white hover:bg-indigo-500 transition-colors active:scale-95">✋ Zabierz głos</button>
              <button onClick={() => request('ad_vocem')}
                className="rounded-lg bg-zinc-700 py-3 text-sm font-medium text-zinc-100 hover:bg-zinc-600 transition-colors active:scale-95">Ad vocem</button>
              <button onClick={() => setShowFormal((v) => !v)}
                className="rounded-lg border border-amber-700/70 py-3 text-sm font-medium text-amber-300 hover:bg-amber-950/30 transition-colors active:scale-95">Wniosek formalny</button>
            </div>
            {showFormal && (
              <div className="space-y-2 rounded-lg border border-zinc-700 bg-zinc-900 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select value={formalType} onChange={(e) => setFormalType(e.target.value as FormalMotionType)}
                    className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 focus:border-indigo-500 focus:outline-none">
                    {(Object.keys(FORMAL_LABEL) as FormalMotionType[]).map((t) => <option key={t} value={t}>{FORMAL_LABEL[t]}</option>)}
                  </select>
                  {TIMED.includes(formalType) && (
                    <div className="flex items-center gap-1.5">
                      <input type="number" min={1} max={120} value={minutes} onChange={(e) => setMinutes(Math.max(1, Number(e.target.value)))}
                        className="w-16 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 focus:border-indigo-500 focus:outline-none" />
                      <span className="text-xs text-zinc-500">min</span>
                    </div>
                  )}
                </div>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Uzasadnienie (opcjonalnie)"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-indigo-500 focus:outline-none" />
                <button onClick={submitFormal} className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500 transition-colors">Złóż wniosek</button>
              </div>
            )}
          </div>
        )
      )}

      {/* Queue (visible to everyone) */}
      {floorRequests.length > 0 ? (
        <div className="space-y-1.5">
          {floorRequests.map((r, idx) => {
            const isFormal = r.kind === 'formal';
            const isSpeaking = r.status === 'speaking';
            return (
              <div key={r.id}
                className={clsx('flex items-center justify-between rounded-lg border px-4 py-2.5',
                  isSpeaking ? 'border-indigo-600 bg-indigo-950/30'
                    : isFormal ? 'border-amber-800/70 bg-amber-950/10'
                    : 'border-zinc-800 bg-zinc-900/50')}>
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="w-4 shrink-0 text-xs text-zinc-600 tabular-nums">{idx + 1}</span>
                  <div className="min-w-0">
                    <div className="truncate text-sm text-zinc-200">{r.mandate?.profile?.full_name ?? '—'}</div>
                    <div className={clsx('text-xs', isFormal ? 'text-amber-400' : isSpeaking ? 'text-indigo-300' : 'text-zinc-500')}>
                      {isSpeaking ? 'Głos ma' : reqLabel(r)}{r.note ? ` · ${r.note}` : ''}
                    </div>
                  </div>
                </div>

                {isChair && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    {isSpeaking ? (
                      <button onClick={() => endSpeaker(r.id)} className="rounded px-2 py-1 text-xs bg-zinc-700 text-zinc-200 hover:bg-zinc-600 transition-colors">Zakończ</button>
                    ) : isFormal ? (
                      <>
                        {canOpenVote && (
                          <button onClick={() => voteOnMotion(r)} className="rounded px-2 py-1 text-xs bg-indigo-600 text-white hover:bg-indigo-500 transition-colors">Głosuj</button>
                        )}
                        <button onClick={() => acceptMotion(r)} className="rounded px-2 py-1 text-xs bg-amber-600 text-white hover:bg-amber-500 transition-colors">Przyjmij</button>
                        <button onClick={() => reject(r.id)} className="rounded px-2 py-1 text-xs text-zinc-500 hover:text-red-400 transition-colors">Odrzuć</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => callSpeaker(r.id)} className="rounded px-2 py-1 text-xs bg-indigo-600 text-white hover:bg-indigo-500 transition-colors">Udziel głosu</button>
                        <button onClick={() => reject(r.id)} className="rounded px-2 py-1 text-xs text-zinc-500 hover:text-red-400 transition-colors">Odrzuć</button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-zinc-800 px-4 py-3 text-center text-xs text-zinc-600">
          Brak zgłoszeń do głosu.
        </div>
      )}
    </div>
  );
}
