'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { Check, Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const MIN = 8;

/** Set a new password for the signed-in user. Clears the must_change_password flag. */
export function PasswordForm({ redirectTo, submitLabel = 'Zapisz hasło' }: { redirectTo?: string; submitLabel?: string }) {
  const router = useRouter();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const longEnough = pw.length >= MIN;
  const matches = pw.length > 0 && pw === pw2;
  const valid = longEnough && matches;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true); setError(null);
    const { error } = await createClient().auth.updateUser({ password: pw, data: { must_change_password: false } });
    setBusy(false);
    if (error) {
      setError(error.message.includes('different')
        ? 'Nowe hasło musi się różnić od tymczasowego.'
        : 'Nie udało się zapisać hasła. Spróbuj ponownie.');
      return;
    }
    navigator.vibrate?.(30);
    setPw(''); setPw2(''); setSaved(true);
    if (redirectTo) { router.replace(redirectTo); router.refresh(); }
  };

  const input = 'h-12 w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 text-[16px] text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30';

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="relative">
        <label htmlFor="new-password" className="sr-only">Nowe hasło</label>
        <input
          id="new-password" type={show ? 'text' : 'password'} autoComplete="new-password"
          value={pw} onChange={(e) => { setPw(e.target.value); setSaved(false); }}
          placeholder="Nowe hasło" className={clsx(input, 'pr-12')}
        />
        <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Ukryj hasło' : 'Pokaż hasło'}
          className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300">
          {show ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
        </button>
      </div>
      <div>
        <label htmlFor="new-password-2" className="sr-only">Powtórz hasło</label>
        <input
          id="new-password-2" type={show ? 'text' : 'password'} autoComplete="new-password"
          value={pw2} onChange={(e) => setPw2(e.target.value)}
          placeholder="Powtórz hasło" className={input}
        />
      </div>

      <ul className="space-y-1 px-1 text-[13px]" aria-live="polite">
        <Rule ok={longEnough}>Co najmniej {MIN} znaków</Rule>
        <Rule ok={matches}>Oba hasła są takie same</Rule>
      </ul>

      {error && <p role="alert" className="px-1 text-sm text-red-400">{error}</p>}

      <button type="submit" disabled={!valid || busy}
        className="press h-12 w-full rounded-xl bg-indigo-600 text-[15px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-40">
        {busy ? 'Zapisywanie…' : saved ? 'Zapisano ✓' : submitLabel}
      </button>
    </form>
  );
}

function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={clsx('flex items-center gap-2 transition-colors', ok ? 'text-emerald-400' : 'text-zinc-500')}>
      <span className={clsx('flex h-4 w-4 items-center justify-center rounded-full border transition-colors',
        ok ? 'border-emerald-500 bg-emerald-500 text-zinc-950' : 'border-zinc-600')}>
        {ok && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      {children}
    </li>
  );
}
