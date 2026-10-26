'use client';

import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Check, ChevronDown, Hourglass } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Ballot, Vote } from '@/types/database';
import type { AttendanceWithMandate } from '@/lib/use-live-session';

/**
 * Chair-only: present members who haven't voted yet. Open votes use the named
 * ballots; secret votes and elections use receipts (who voted, never how -
 * migration 021), refreshed whenever the turnout counter moves.
 */
export function PendingVoters({
  vote, attendance, openBallots,
}: { vote: Vote; attendance: AttendanceWithMandate[]; openBallots: Ballot[] }) {
  const [receipts, setReceipts] = useState<{ voteId: string; ids: Set<string> } | null>(null);
  const [open, setOpen] = useState(false);
  const named = vote.vote_type === 'open' && vote.vote_kind !== 'election';

  useEffect(() => {
    if (named) return;
    createClient().from('secret_ballot_receipts').select('mandate_id').eq('vote_id', vote.id)
      .then(({ data }) => setReceipts({ voteId: vote.id, ids: new Set((data ?? []).map((r) => r.mandate_id as string)) }));
  }, [named, vote.id, vote.secret_cast_count]);

  const voted = named
    ? new Set(openBallots.map((b) => b.mandate_id).filter(Boolean) as string[])
    : receipts?.voteId === vote.id ? receipts.ids : null;
  if (!voted) return null;

  const present = attendance.filter((a) => a.status === 'present' || a.status === 'late');
  const pending = present.filter((a) => !voted.has(a.mandate_id))
    .map((a) => a.mandate?.profile?.full_name ?? '-')
    .sort((a, b) => a.localeCompare(b, 'pl'));

  if (!present.length) return null;
  const done = pending.length === 0;

  return (
    <div className={clsx('rounded-2xl border px-4 py-3', done ? 'border-emerald-800/60 bg-emerald-950/20' : 'border-zinc-800 bg-zinc-900/50')}>
      <button onClick={() => setOpen((v) => !v)} disabled={done} aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left">
        <span className={clsx('flex items-center gap-2 text-[14px] font-medium', done ? 'text-emerald-300' : 'text-zinc-200')}>
          {done ? <Check className="h-4 w-4" strokeWidth={3} /> : <Hourglass className="h-4 w-4 text-amber-400" />}
          {done ? 'Wszyscy obecni zagłosowali' : `Jeszcze nie zagłosowało: ${pending.length}`}
        </span>
        {!done && <ChevronDown className={clsx('h-4 w-4 text-zinc-500 transition-transform', open && 'rotate-180')} />}
      </button>
      {open && !done && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {pending.map((n) => <span key={n} className="rounded-full bg-zinc-800 px-2.5 py-1 text-[13px] text-zinc-300">{n}</span>)}
        </div>
      )}
      {!named && !done && open && (
        <p className="mt-2 text-[12px] text-zinc-500">Widać tylko, kto oddał głos, nie jak głosował.</p>
      )}
    </div>
  );
}
