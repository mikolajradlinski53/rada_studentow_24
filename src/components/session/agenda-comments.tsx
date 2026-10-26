'use client';

import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { ChevronDown, MessageCircle, Send, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Comment = {
  id: string;
  mandate_id: string;
  body: string;
  created_at: string;
  mandate: { profile: { full_name: string } | null } | null;
};

const SELECT = 'id, mandate_id, body, created_at, mandate:mandates(profile:profiles(full_name))';

function ago(iso: string, now: number) {
  const min = Math.round((now - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'przed chwilą';
  if (min < 60) return `${min} min temu`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} godz. temu`;
  return new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' })
    .format(new Date(iso));
}

/**
 * Questions and remarks on one agenda item - members raise them before the
 * sitting, the chair sees them live. Authors (and the chair) can delete.
 */
export function AgendaComments({
  itemId, myMandateId, canModerate,
}: { itemId: string; myMandateId?: string | null; canModerate: boolean }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    const load = () => supabase.from('agenda_comments').select(SELECT).eq('agenda_item_id', itemId).order('created_at')
      .then(({ data }) => { setComments((data as unknown as Comment[]) ?? []); setNow(Date.now()); });
    load();
    const channel = supabase
      .channel(`agenda-comments-${itemId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agenda_comments', filter: `agenda_item_id=eq.${itemId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [itemId]);

  const send = async () => {
    const body = text.trim();
    if (!body || !myMandateId) return;
    setBusy(true);
    const { data, error } = await createClient().from('agenda_comments')
      .insert({ agenda_item_id: itemId, mandate_id: myMandateId, body }).select(SELECT).single();
    setBusy(false);
    if (error || !data) { alert('Nie udało się dodać wpisu.'); return; }
    setComments((cur) => (cur.some((c) => c.id === (data as unknown as Comment).id) ? cur : [...cur, data as unknown as Comment]));
    setNow(Date.now());
    setText('');
  };

  const remove = async (c: Comment) => {
    if (!confirm('Usunąć ten wpis?')) return;
    const { error } = await createClient().from('agenda_comments').delete().eq('id', c.id);
    if (!error) setComments((cur) => cur.filter((x) => x.id !== c.id));
  };

  const count = comments.length;
  if (!count && !myMandateId) return null;

  return (
    <div className="mt-2">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className={clsx('press flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-medium',
          count ? 'text-sky-300 hover:bg-sky-950/40' : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300')}>
        <MessageCircle className="h-3.5 w-3.5" />
        {count ? `Pytania i uwagi · ${count}` : 'Zadaj pytanie'}
        <ChevronDown className={clsx('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="mt-1.5 space-y-2 rounded-xl bg-zinc-950/40 p-3 ring-1 ring-zinc-800">
          {comments.map((c) => (
            <div key={c.id} className="group flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 text-[12px]">
                  <span className="font-semibold text-zinc-200">{c.mandate?.profile?.full_name ?? '-'}</span>
                  <span className="text-zinc-500">{now ? ago(c.created_at, now) : ''}</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-[14px] leading-snug text-zinc-300">{c.body}</p>
              </div>
              {(c.mandate_id === myMandateId || canModerate) && (
                <button onClick={() => remove(c)} aria-label="Usuń wpis"
                  className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-600 hover:bg-red-950/30 hover:text-red-400">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          {!count && <p className="text-[13px] text-zinc-500">Nikt jeszcze nie pytał. Pytania zobaczy prowadzący.</p>}

          {myMandateId && (
            <div className="flex items-end gap-2 pt-1">
              <label htmlFor={`c-${itemId}`} className="sr-only">Twoje pytanie lub uwaga</label>
              <textarea id={`c-${itemId}`} rows={1} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }}
                placeholder="Twoje pytanie lub uwaga…"
                className="max-h-32 min-h-11 w-full resize-y rounded-xl border border-zinc-700 bg-zinc-800/80 px-3.5 py-2.5 text-[16px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30" />
              <button onClick={send} disabled={busy || !text.trim()} aria-label="Wyślij"
                className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white disabled:opacity-40">
                <Send className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
