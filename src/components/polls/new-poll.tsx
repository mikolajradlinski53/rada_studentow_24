'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { Plus, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { broadcastPush } from '@/lib/push-client';
import { Sheet } from '@/components/ui/sheet';

export function NewPollButton({ termId }: { termId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [multi, setMulti] = useState(false);
  const [hideNames, setHideNames] = useState(false);
  const [closesAt, setClosesAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clean = options.map((o) => o.trim()).filter(Boolean);
  const valid = title.trim() && clean.length >= 2 && new Set(clean).size === clean.length;

  const reset = () => { setTitle(''); setDescription(''); setOptions(['', '']); setMulti(false); setHideNames(false); setClosesAt(''); setError(null); };

  const create = async () => {
    if (!valid) return;
    setBusy(true); setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: poll, error: e1 } = await supabase.from('polls').insert({
      term_id: termId, title: title.trim(), description: description.trim() || null,
      multi, hide_names: hideNames,
      // datetime-local is the user's local wall clock -> real instant.
      closes_at: closesAt ? new Date(closesAt).toISOString() : null,
      created_by: user?.id ?? null,
    }).select('id').single();
    if (e1 || !poll) { setBusy(false); setError('Nie udało się utworzyć ankiety.'); return; }
    const { error: e2 } = await supabase.from('poll_options').insert(clean.map((label, position) => ({ poll_id: poll.id, label, position })));
    setBusy(false);
    if (e2) { await supabase.from('polls').delete().eq('id', poll.id); setError('Nie udało się zapisać odpowiedzi.'); return; }
    broadcastPush('poll_opened', poll.id);
    reset(); setOpen(false); router.refresh();
  };

  const field = 'h-12 w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 text-[16px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30';
  const label = 'mb-2 block px-1 text-[13px] font-medium text-zinc-400';

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="press flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 text-sm font-semibold text-white hover:bg-indigo-500">
        <Plus className="h-4 w-4" /> Nowa ankieta
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Nowa ankieta" description="Radni dostaną powiadomienie i odpowiedzą w aplikacji.">
        <div className="space-y-5">
          <div>
            <label htmlFor="p-title" className={label}>Pytanie</label>
            <input id="p-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200}
              placeholder="np. Który termin następnego posiedzenia?" className={field} />
          </div>
          <div>
            <label htmlFor="p-desc" className={label}>Opis <span className="font-normal text-zinc-600">(opcjonalnie)</span></label>
            <textarea id="p-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-3 text-[16px] text-zinc-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30" />
          </div>
          <div>
            <div className={label}>Odpowiedzi</div>
            <div className="space-y-2">
              {options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={o} onChange={(e) => setOptions((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))}
                    aria-label={`Odpowiedź ${i + 1}`} placeholder={`Odpowiedź ${i + 1}`} maxLength={200} className={field} />
                  {options.length > 2 && (
                    <button onClick={() => setOptions((cur) => cur.filter((_, j) => j !== i))} aria-label={`Usuń odpowiedź ${i + 1}`}
                      className="press flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {options.length < 12 && (
              <button onClick={() => setOptions((cur) => [...cur, ''])}
                className="press mt-2 flex h-10 items-center gap-1.5 rounded-xl px-2.5 text-[14px] font-medium text-indigo-300 hover:bg-indigo-950/40">
                <Plus className="h-4 w-4" /> Dodaj odpowiedź
              </button>
            )}
          </div>

          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/40">
            <Toggle label="Wiele odpowiedzi" hint="Można zaznaczyć kilka opcji" on={multi} onChange={setMulti} />
            <Toggle label="Bez nazwisk" hint="Inni widzą tylko liczby, nie kto co wybrał" on={hideNames} onChange={setHideNames} />
          </div>

          <div>
            <label htmlFor="p-close" className={label}>Koniec ankiety <span className="font-normal text-zinc-600">(opcjonalnie)</span></label>
            <input id="p-close" type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} className={field} />
          </div>

          {error && <p role="alert" className="px-1 text-sm text-red-400">{error}</p>}
          <button onClick={create} disabled={!valid || busy}
            className="press h-12 w-full rounded-xl bg-indigo-600 text-[15px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-40">
            {busy ? 'Tworzenie…' : 'Opublikuj ankietę'}
          </button>
        </div>
      </Sheet>
    </>
  );
}

function Toggle({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-zinc-800/80 px-4 py-3 first:border-t-0">
      <div className="min-w-0">
        <div className="text-[15px] text-zinc-100">{label}</div>
        <div className="text-[12px] text-zinc-500">{hint}</div>
      </div>
      <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
        className={clsx('relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200', on ? 'bg-emerald-500' : 'bg-zinc-700')}>
        <span className={clsx('absolute left-[2px] top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-md transition-transform duration-200 ease-[var(--ease-out)]', on && 'translate-x-5')} />
      </button>
    </div>
  );
}
