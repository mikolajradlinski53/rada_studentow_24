'use client';

import { useEffect, useState } from 'react';
import { CalendarSync, Check, Copy, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { copyText } from '@/lib/share';

/** Personal webcal subscription: all sittings land (and update) in the phone's calendar. */
export function CalendarFeed() {
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      setOrigin(window.location.origin);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('calendar_tokens').select('token').eq('profile_id', user.id).maybeSingle();
      if (data) { setToken(data.token); return; }
      const { data: created } = await supabase.from('calendar_tokens').insert({ profile_id: user.id }).select('token').single();
      setToken(created?.token ?? null);
    })();
  }, []);

  const httpsUrl = token ? `${origin}/api/calendar/${token}.ics` : '';
  const webcalUrl = httpsUrl.replace(/^https?:/, 'webcal:');

  const rotate = async () => {
    if (!confirm('Wygenerować nowy link? Stary przestanie działać we wszystkich kalendarzach.')) return;
    setBusy(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('calendar_tokens').delete().eq('profile_id', user.id);
      const { data } = await supabase.from('calendar_tokens').insert({ profile_id: user.id }).select('token').single();
      setToken(data?.token ?? null);
    }
    setBusy(false);
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300">
          <CalendarSync className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-zinc-100">Kalendarz posiedzeń</h2>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            Subskrybuj raz, a wszystkie posiedzenia same pojawią się w kalendarzu telefonu i będą się aktualizować.
            Link jest prywatny, nie udostępniaj go.
          </p>
        </div>
      </div>
      {token ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <a href={webcalUrl}
            className="press flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 text-[14px] font-semibold text-white hover:bg-indigo-500">
            <CalendarSync className="h-4 w-4" /> Subskrybuj
          </a>
          <button onClick={async () => { await copyText(httpsUrl); setCopied(true); setTimeout(() => setCopied(false), 2500); }}
            className="press flex h-11 items-center justify-center gap-2 rounded-xl border border-zinc-700 text-[14px] text-zinc-200 hover:border-zinc-500">
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Skopiowano' : 'Kopiuj link (Google)'}
          </button>
          <button onClick={rotate} disabled={busy}
            className="press flex h-10 items-center justify-center gap-1.5 rounded-xl text-[13px] text-zinc-500 hover:text-zinc-300 disabled:opacity-50 sm:col-span-2">
            <RefreshCw className="h-3.5 w-3.5" /> Wygeneruj nowy link
          </button>
        </div>
      ) : (
        <div className="mt-4 h-11 animate-pulse rounded-xl bg-zinc-800/70" />
      )}
    </div>
  );
}
