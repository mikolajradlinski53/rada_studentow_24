'use client';

import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { createClient } from '@/lib/supabase/client';
import { fetchElectionResults } from '@/lib/use-live-session';
import { broadcastPush } from '@/lib/push-client';
import type { AgendaItem, Vote, VoteCandidate, Mandate, ElectionResult, BallotChoice } from '@/types/database';

const now = () => new Date().toISOString();

/** Chair: open an election on an agenda item (enter candidates + seats). */
export function ElectionOpener({ sessionId, item }: { sessionId: string; item: AgendaItem }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [seats, setSeats] = useState(1);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    const names = text.split('\n').map((s) => s.trim()).filter(Boolean);
    if (names.length < 2) { alert('Podaj co najmniej dwóch kandydatów (po jednym w wierszu).'); return; }
    setBusy(true);
    const { data: vote } = await supabase.from('votes').insert({
      session_id: sessionId,
      agenda_item_id: item.id,
      title: `Wybory: ${item.title}`,
      vote_type: 'secret',
      vote_kind: 'election',
      seats,
      status: 'open',
      opened_at: now(),
    }).select('id').single();

    if (vote) {
      await supabase.from('vote_candidates').insert(
        names.map((name, i) => ({ vote_id: vote.id, name, position: i }))
      );
      await supabase.rpc('log_audit', { p_action: 'vote.opened', p_target_type: 'vote', p_target_id: vote.id, p_metadata: { kind: 'election' } });
      broadcastPush('vote_opened', vote.id); // after candidates exist, so the tap lands on a full ballot
    }
    setBusy(false); setOpen(false); setText('');
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="press h-9 rounded-xl px-3 text-[13px] font-medium bg-amber-600 text-white hover:bg-amber-500 transition-colors">
        Otwórz wybory
      </button>
    );
  }

  return (
    <div className="mt-2 w-full space-y-2 rounded-2xl border border-zinc-700 bg-zinc-900 p-3">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4}
        placeholder={'Kandydaci, jeden w wierszu:\nJan Kowalski\nAnna Nowak'}
        className="w-full h-11 rounded-xl border border-zinc-700 bg-zinc-800/80 px-3 text-[15px] text-zinc-100 placeholder-zinc-600 focus:border-indigo-500 focus:outline-none" />
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-zinc-400">Miejsca do obsadzenia</label>
        <input type="number" min={1} max={20} value={seats} onChange={(e) => setSeats(Math.max(1, Number(e.target.value)))}
          className="w-16 h-11 rounded-xl border border-zinc-700 bg-zinc-800/80 px-3 text-[15px] text-zinc-100 focus:border-indigo-500 focus:outline-none" />
        <button onClick={start} disabled={busy}
          className="press h-11 rounded-xl bg-amber-600 px-4 text-[15px] font-semibold text-white hover:bg-amber-500 disabled:opacity-50 transition-colors">
          {busy ? 'Otwieranie…' : 'Otwórz głosowanie'}
        </button>
        <button onClick={() => setOpen(false)} className="press h-9 rounded-xl px-3 text-[13px] text-zinc-400 hover:text-zinc-200">Anuluj</button>
      </div>
    </div>
  );
}

/** Active election card — members pick a candidate; chair closes. Anonymous. */
export function ElectionActive({
  vote, candidates, myMandate, myBallot, isCheckedIn, isChair, presentCount,
}: {
  vote: Vote;
  candidates: VoteCandidate[];
  myMandate: Mandate | null;
  myBallot: BallotChoice | null;
  isCheckedIn: boolean;
  isChair: boolean;
  presentCount: number;
}) {
  const supabase = createClient();
  const [selected, setSelected] = useState<string[]>([]);
  const multi = vote.seats > 1;

  const toggle = (id: string) => {
    setSelected((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= vote.seats) return multi ? cur : [id]; // single-seat: replace
      return [...cur, id];
    });
  };

  const submit = async () => {
    if (!myMandate || myBallot || selected.length < 1) return;
    const { error } = await supabase.rpc('cast_election_ballots', {
      p_vote_id: vote.id, p_mandate_id: myMandate.id, p_candidate_ids: selected,
    });
    if (error) { alert('Nie udało się oddać głosu. Odśwież stronę.'); return; }
    await supabase.rpc('log_audit', { p_action: 'ballot.cast', p_target_type: 'vote', p_target_id: vote.id, p_metadata: { vote_type: 'secret' } });
  };

  const close = async () => {
    await supabase.from('votes').update({ status: 'closed', closed_at: now() }).eq('id', vote.id);
    await supabase.rpc('log_audit', { p_action: 'vote.closed', p_target_type: 'vote', p_target_id: vote.id, p_metadata: { kind: 'election' } });
  };

  return (
    <div className="rounded-2xl border-2 border-amber-600 bg-amber-950/20 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="h-2 w-2 shrink-0 rounded-full bg-amber-400 animate-pulse" />
          <h2 className="truncate text-[13px] font-semibold uppercase tracking-wide text-amber-300">
            Wybory · {vote.seats} {vote.seats === 1 ? 'miejsce' : vote.seats < 5 ? 'miejsca' : 'miejsc'}
          </h2>
        </div>
        <span className="shrink-0 whitespace-nowrap text-[13px] tabular-nums text-zinc-400">{vote.secret_cast_count} / {presentCount} głosów</span>
      </div>
      <p className="mb-4 text-base font-medium text-zinc-100">{vote.title}</p>

      {isCheckedIn && !myBallot ? (
        <div className="space-y-3">
          {multi && (
            <p className="text-xs text-amber-300/90">Wybierz do {vote.seats} kandydatów · zaznaczono {selected.length}/{vote.seats}</p>
          )}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {candidates.map((c) => {
              const on = selected.includes(c.id);
              return (
                <button key={c.id} onClick={() => toggle(c.id)}
                  className={clsx('rounded-xl py-4 text-sm font-semibold transition-colors active:scale-95',
                    on ? 'bg-amber-600 text-white' : 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700')}>
                  {multi && <span className="mr-1">{on ? '☑' : '☐'}</span>}{c.name}
                </button>
              );
            })}
          </div>
          <button onClick={submit} disabled={selected.length < 1}
            className="w-full rounded-lg bg-amber-600 py-3.5 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-40 transition-colors active:scale-95">
            Oddaj głos{multi ? ` (${selected.length}/${vote.seats})` : ''}
          </button>
        </div>
      ) : myBallot ? (
        <div className="text-center text-sm text-amber-300">Głos oddany (tajnie)</div>
      ) : (
        <p className="text-center text-sm text-zinc-500">Potwierdź obecność, aby głosować.</p>
      )}

      {isChair && (
        <button onClick={close}
          className="mt-4 w-full rounded-xl border border-amber-600 py-2 text-sm text-amber-300 hover:bg-amber-900/30 transition-colors">
          Zamknij wybory i pokaż wynik
        </button>
      )}
    </div>
  );
}

/** Closed election — per-candidate results with elected badges. */
export function ElectionResultRow({ vote }: { vote: Vote }) {
  const supabase = createClient();
  const [results, setResults] = useState<ElectionResult[]>([]);
  useEffect(() => {
    fetchElectionResults(supabase, vote).then(setResults);
  }, [vote, supabase]);

  return (
    <div className="mt-2 space-y-1 pl-7">
      {results.map((r) => (
        <div key={r.candidate.id} className="flex items-center justify-between text-xs">
          <span className={clsx(r.elected ? 'text-amber-300 font-medium' : 'text-zinc-400')}>
            {r.candidate.name}{r.elected ? ' · wybrany/a' : ''}
          </span>
          <span className="tabular-nums text-zinc-500">{r.count}</span>
        </div>
      ))}
    </div>
  );
}
