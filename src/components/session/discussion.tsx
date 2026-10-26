'use client';

import { useState } from 'react';
import { clsx } from 'clsx';
import { Hand } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { broadcastPush } from '@/lib/push-client';
import { enactMotion } from '@/lib/motions';
import { SpeakerTimer } from './speaker-timer';
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
  const setLimit = async (seconds: number) => {
    await supabase.from('sessions').update({ speech_limit_seconds: seconds || null }).eq('id', sessionId);
  };
  const addTime = async (r: FloorRequest, seconds: number) => {
    await supabase.from('floor_requests').update({ extra_seconds: Math.min(3600, (r.extra_seconds ?? 0) + seconds) }).eq('id', r.id);
  };
  const reject = async (id: string) => { await supabase.from('floor_requests').update({ status: 'rejected' }).eq('id', id); };
  const acceptMotion = (r: FloorRequest) => enactMotion(supabase, sessionId, r);
  // Turn a formal motion into a quick open procedural vote. The vote remembers
  // the motion (floor_request_id): closing it enacts or rejects it (lib/motions).
  const voteOnMotion = async (r: FloorRequest) => {
    const { data: vote } = await supabase.from('votes').insert({
      session_id: sessionId,
      title: `Wniosek formalny: ${reqLabel(r)}`,
      vote_type: 'open',
      vote_kind: 'motion',
      status: 'open',
      opened_at: now(),
      floor_request_id: r.id,
    }).select('id').single();
    if (vote) {
      await supabase.rpc('log_audit', { p_action: 'vote.opened', p_target_type: 'vote', p_target_id: vote.id, p_metadata: { procedural: true } });
      broadcastPush('vote_opened', vote.id);
    }
  };
  const submitFormal = async () => {
    await request('formal', { formal_type: formalType, minutes: TIMED.includes(formalType) ? minutes : undefined, note });
    setShowFormal(false); setNote('');
  };

  return (
    <div className="space-y-3">
      <BreakBanner session={session} isChair={isChair} sessionId={sessionId} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-medium uppercase tracking-wide text-zinc-500">Dyskusja</h2>
        {isChair ? (
          <label className="flex items-center gap-2 text-[13px] text-zinc-400">
            Limit wypowiedzi
            <select value={session.speech_limit_seconds ?? 0} onChange={(e) => setLimit(Number(e.target.value))}
              className="h-9 rounded-xl border border-zinc-700 bg-zinc-800/80 px-2.5 text-[14px] text-zinc-100 outline-none focus:border-indigo-500">
              <option value={0}>bez limitu</option>
              {[60, 120, 180, 300, 600].map((s) => <option key={s} value={s}>{s / 60} min</option>)}
            </select>
          </label>
        ) : session.speech_limit_seconds ? (
          <span className="text-[13px] text-zinc-500">Limit wypowiedzi: {session.speech_limit_seconds / 60} min</span>
        ) : null}
      </div>

      {/* Member request controls */}
      {myMandate && live && (
        myReq ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-indigo-800/60 bg-indigo-950/20 px-4 py-3">
            <div className="text-sm text-zinc-200">
              {reqLabel(myReq)}
              <span className="ml-2 text-xs text-zinc-500">
                {myReq.status === 'speaking' ? '· masz głos' : '· w kolejce'}
              </span>
            </div>
            {myReq.status !== 'speaking' && (
              <button onClick={() => withdraw(myReq.id)} className="press h-9 shrink-0 rounded-xl border border-zinc-700 px-3 text-[13px] font-medium text-zinc-300 hover:border-red-900 hover:text-red-400">Wycofaj</button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button onClick={() => request('speak')}
                className="press flex h-12 items-center justify-center gap-2 rounded-xl bg-indigo-600 text-[15px] font-semibold text-white hover:bg-indigo-500"><Hand className="h-4 w-4" /> Zabierz głos</button>
              <button onClick={() => request('ad_vocem')}
                className="press h-12 rounded-xl bg-zinc-700 text-[15px] font-semibold text-zinc-100 hover:bg-zinc-600">Ad vocem</button>
              <button onClick={() => setShowFormal((v) => !v)}
                className="press h-12 rounded-xl border border-amber-700/70 text-[15px] font-semibold text-amber-300 hover:bg-amber-950/30">Wniosek formalny</button>
            </div>
            {showFormal && (
              <div className="space-y-2 rounded-2xl border border-zinc-700 bg-zinc-900 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select value={formalType} onChange={(e) => setFormalType(e.target.value as FormalMotionType)}
                    className="h-11 rounded-xl border border-zinc-700 bg-zinc-800/80 px-3 text-[15px] text-zinc-100 focus:border-indigo-500 focus:outline-none">
                    {(Object.keys(FORMAL_LABEL) as FormalMotionType[]).map((t) => <option key={t} value={t}>{FORMAL_LABEL[t]}</option>)}
                  </select>
                  {TIMED.includes(formalType) && (
                    <div className="flex items-center gap-1.5">
                      <input type="number" min={1} max={120} value={minutes} onChange={(e) => setMinutes(Math.max(1, Number(e.target.value)))}
                        className="w-16 h-11 rounded-xl border border-zinc-700 bg-zinc-800/80 px-3 text-[15px] text-zinc-100 focus:border-indigo-500 focus:outline-none" />
                      <span className="text-xs text-zinc-500">min</span>
                    </div>
                  )}
                </div>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Uzasadnienie (opcjonalnie)"
                  className="w-full h-11 rounded-xl border border-zinc-700 bg-zinc-800/80 px-3 text-[15px] text-zinc-100 placeholder-zinc-600 focus:border-indigo-500 focus:outline-none" />
                <button onClick={submitFormal} className="press h-11 rounded-xl bg-amber-600 px-4 text-[15px] font-semibold text-white hover:bg-amber-500 transition-colors">Złóż wniosek</button>
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
                className={clsx('flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-2xl border px-4 py-3',
                  isSpeaking ? 'border-indigo-600 bg-indigo-950/30'
                    : isFormal ? 'border-amber-800/70 bg-amber-950/10'
                    : 'border-zinc-800 bg-zinc-900/50')}>
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="w-4 shrink-0 text-xs text-zinc-600 tabular-nums">{idx + 1}</span>
                  <div className="min-w-0">
                    <div className="truncate text-[15px] text-zinc-100">{r.mandate?.profile?.full_name ?? '-'}</div>
                    <div className={clsx('flex flex-wrap items-center gap-2 text-[13px]', isFormal ? 'text-amber-400' : isSpeaking ? 'text-indigo-300' : 'text-zinc-500')}>
                      <span>{isSpeaking ? 'Głos ma' : reqLabel(r)}{r.note ? ` · ${r.note}` : ''}</span>
                      {isSpeaking && (
                        <SpeakerTimer calledAt={r.called_at} limitSeconds={session.speech_limit_seconds} extraSeconds={r.extra_seconds ?? 0} />
                      )}
                    </div>
                  </div>
                </div>

                {isChair && (
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {isSpeaking ? (
                      <>
                        {session.speech_limit_seconds ? (
                          <button onClick={() => addTime(r, 60)} className="press h-9 rounded-xl border border-zinc-700 px-3 text-[13px] font-medium text-zinc-200 hover:border-zinc-500">+1 min</button>
                        ) : null}
                        <button onClick={() => endSpeaker(r.id)} className="press h-9 rounded-xl px-3 text-[13px] font-medium bg-zinc-700 text-zinc-200 hover:bg-zinc-600 transition-colors">Zakończ</button>
                      </>
                    ) : isFormal ? (
                      <>
                        {canOpenVote && (
                          <button onClick={() => voteOnMotion(r)} className="press h-9 rounded-xl px-3 text-[13px] font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition-colors">Głosuj</button>
                        )}
                        <button onClick={() => acceptMotion(r)} className="press h-9 rounded-xl px-3 text-[13px] font-medium bg-amber-600 text-white hover:bg-amber-500 transition-colors">Przyjmij</button>
                        <button onClick={() => reject(r.id)} className="press h-9 rounded-xl px-3 text-[13px] font-medium text-zinc-500 hover:text-red-400 transition-colors">Odrzuć</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => callSpeaker(r.id)} className="press h-9 rounded-xl px-3 text-[13px] font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition-colors">Udziel głosu</button>
                        <button onClick={() => reject(r.id)} className="press h-9 rounded-xl px-3 text-[13px] font-medium text-zinc-500 hover:text-red-400 transition-colors">Odrzuć</button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-800 px-4 py-4 text-center text-[13px] text-zinc-500">
          Brak zgłoszeń do głosu.
        </div>
      )}
    </div>
  );
}
