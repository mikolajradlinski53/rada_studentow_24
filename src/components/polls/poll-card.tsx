'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { Check, Clock, EyeOff, Lock, Trash2, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export type Poll = {
  id: string; title: string; description: string | null; multi: boolean; hide_names: boolean;
  closes_at: string | null; closed_at: string | null; created_at: string;
  options: { id: string; label: string; position: number }[];
};

type NamedAnswer = { option_id: string; mandate_id: string; mandate: { profile: { full_name: string } | null } | null };

function isClosed(p: Poll, now: number) {
  return !!p.closed_at || (!!p.closes_at && new Date(p.closes_at).getTime() <= now);
}

function deadline(iso: string) {
  return new Intl.DateTimeFormat('pl-PL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' })
    .format(new Date(iso));
}

export function PollCard({ poll, myMandateId, canManage, voters }: { poll: Poll; myMandateId: string; canManage: boolean; voters: number }) {
  const router = useRouter();
  const options = useMemo(() => [...poll.options].sort((a, b) => a.position - b.position), [poll.options]);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [named, setNamed] = useState<NamedAnswer[]>([]);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: res }, { data: answers }] = await Promise.all([
      supabase.rpc('poll_results', { p_poll_id: poll.id }),
      supabase.from('poll_answers').select('option_id, mandate_id, mandate:mandates(profile:profiles(full_name))').eq('poll_id', poll.id),
    ]);
    setCounts(new Map(((res as { option_id: string; answers: number }[]) ?? []).map((r) => [r.option_id, r.answers])));
    const rows = (answers as unknown as NamedAnswer[]) ?? [];
    setMine(new Set(rows.filter((r) => r.mandate_id === myMandateId).map((r) => r.option_id)));
    setNamed(rows);
    setNow(Date.now());
  }, [poll.id, myMandateId]);

  useEffect(() => {
    const t = setTimeout(() => { void load(); }, 0);
    const supabase = createClient();
    const channel = supabase
      .channel(`poll-${poll.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_answers', filter: `poll_id=eq.${poll.id}` }, () => { void load(); })
      .subscribe();
    return () => { clearTimeout(t); supabase.removeChannel(channel); };
  }, [poll.id, load]);

  const closed = now ? isClosed(poll, now) : !!poll.closed_at;
  const selection = picked ?? mine;
  const answered = mine.size > 0;
  const respondents = new Set(named.map((n) => n.mandate_id)).size;
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const showResults = closed || answered || canManage;
  const dirty = picked !== null && (picked.size !== mine.size || [...picked].some((x) => !mine.has(x)));

  const toggle = (id: string) => {
    if (closed || !myMandateId) return;
    setPicked((cur) => {
      const base = new Set(cur ?? mine);
      if (poll.multi) { if (base.has(id)) base.delete(id); else base.add(id); return base; }
      return new Set([id]);
    });
  };

  const save = async () => {
    if (!picked) return;
    setBusy(true);
    const { error } = await createClient().rpc('poll_answer', { p_poll_id: poll.id, p_mandate_id: myMandateId, p_option_ids: [...picked] });
    setBusy(false);
    if (error) { alert('Nie udało się zapisać odpowiedzi. Ankieta mogła się już zakończyć.'); return; }
    navigator.vibrate?.(30);
    setPicked(null);
    void load();
  };

  const closeNow = async () => {
    if (!confirm('Zakończyć ankietę? Nikt nie będzie mógł już odpowiedzieć.')) return;
    await createClient().from('polls').update({ closed_at: new Date().toISOString() }).eq('id', poll.id);
    router.refresh();
  };
  const remove = async () => {
    if (!confirm(`Usunąć ankietę „${poll.title}” razem z odpowiedziami?`)) return;
    await createClient().from('polls').delete().eq('id', poll.id);
    router.refresh();
  };

  return (
    <article className={clsx('overflow-hidden rounded-2xl border', closed ? 'border-zinc-800 bg-zinc-900/40' : 'border-indigo-800/60 bg-indigo-950/20')}>
      <div className="p-4">
        <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
          <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium',
            closed ? 'bg-zinc-800 text-zinc-400' : 'bg-indigo-600 text-white')}>
            {closed ? <Lock className="h-3 w-3" /> : <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />}
            {closed ? 'Zakończona' : 'Trwa'}
          </span>
          {poll.multi && <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-zinc-400">wiele odpowiedzi</span>}
          {poll.hide_names && <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-zinc-400"><EyeOff className="h-3 w-3" />bez nazwisk</span>}
          {!closed && poll.closes_at && (
            <span className="inline-flex items-center gap-1 text-zinc-500"><Clock className="h-3 w-3" />do {deadline(poll.closes_at)}</span>
          )}
        </div>
        <h3 className="mt-2.5 text-[17px] font-semibold leading-snug text-zinc-50">{poll.title}</h3>
        {poll.description && <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-zinc-400">{poll.description}</p>}

        <div role={poll.multi ? 'group' : 'radiogroup'} aria-label="Odpowiedzi" className="mt-4 space-y-2">
          {options.map((o) => {
            const on = selection.has(o.id);
            const n = counts.get(o.id) ?? 0;
            const pct = total ? Math.round((n / total) * 100) : 0;
            const names = poll.hide_names ? [] : named.filter((a) => a.option_id === o.id).map((a) => a.mandate?.profile?.full_name ?? '-');
            return (
              <div key={o.id}>
                <button role={poll.multi ? 'checkbox' : 'radio'} aria-checked={on} disabled={closed || !myMandateId} onClick={() => toggle(o.id)}
                  className={clsx('press relative flex w-full items-center gap-3 overflow-hidden rounded-xl px-3.5 py-3 text-left ring-1 transition-colors',
                    on ? 'bg-indigo-950/50 ring-indigo-500' : 'bg-zinc-900/60 ring-zinc-800 hover:ring-zinc-600', (closed || !myMandateId) && 'cursor-default')}>
                  {showResults && (
                    <span aria-hidden className="absolute inset-y-0 left-0 bg-indigo-500/15 transition-[width] duration-500" style={{ width: `${pct}%` }} />
                  )}
                  <span className={clsx('relative flex h-5 w-5 shrink-0 items-center justify-center border transition-colors',
                    poll.multi ? 'rounded-md' : 'rounded-full',
                    on ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-zinc-600')}>
                    {on && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <span className="relative min-w-0 flex-1 text-[15px] text-zinc-100">{o.label}</span>
                  {showResults && <span className="relative shrink-0 font-mono text-[13px] tabular-nums text-zinc-400">{n} · {pct}%</span>}
                </button>
                {showResults && names.length > 0 && (
                  <p className="mt-1 px-1 text-[12px] leading-snug text-zinc-500">{names.join(', ')}</p>
                )}
              </div>
            );
          })}
        </div>

        {!closed && myMandateId && (dirty || !answered) && (
          <button onClick={save} disabled={busy || !picked || picked.size === 0}
            className="press mt-4 h-12 w-full rounded-xl bg-indigo-600 text-[15px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-40">
            {busy ? 'Zapisywanie…' : answered ? 'Zmień odpowiedź' : 'Odpowiedz'}
          </button>
        )}
        {!closed && answered && !dirty && (
          <p className="mt-3 flex items-center gap-1.5 px-1 text-[13px] text-emerald-400">
            <Check className="h-3.5 w-3.5" strokeWidth={3} /> Odpowiedź zapisana. Możesz ją zmienić do końca ankiety.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800/80 px-4 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-[13px] tabular-nums text-zinc-500">
          <Users className="h-3.5 w-3.5" /> {poll.hide_names ? `${total} ${total === 1 ? "głos" : "głosów"}` : `Odpowiedziało ${respondents} z ${voters}`}
        </span>
        {canManage && (
          <div className="flex items-center gap-1">
            {!closed && (
              <button onClick={closeNow} className="press h-9 rounded-xl px-3 text-[13px] font-medium text-zinc-300 hover:bg-zinc-800/60">Zakończ</button>
            )}
            <button onClick={remove} aria-label="Usuń ankietę"
              className="press flex h-9 w-9 items-center justify-center rounded-xl text-zinc-500 hover:bg-red-950/30 hover:text-red-400">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
