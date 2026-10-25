'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { clsx } from 'clsx';
import { ArrowLeft, Eye, EyeOff, Mail } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Mode = 'password' | 'code';

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get('error') === 'auth' ? 'Link logowania wygasł lub był już użyty. Zaloguj się ponownie.' : null
  );
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (codeSent) codeRef.current?.focus(); }, [codeSent]);

  const done = () => { router.replace('/'); router.refresh(); };

  const signInPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      setError(error.message.toLowerCase().includes('invalid')
        ? 'Nieprawidłowy email lub hasło. Nie masz hasła? Zaloguj się kodem z maila.'
        : 'Nie udało się zalogować. Spróbuj ponownie za chwilę.');
      return;
    }
    done();
  };

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true); setError(null);
    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) {
      setError(error.status === 429
        ? 'Za dużo prób wysyłki maila. Odczekaj chwilę albo zaloguj się hasłem.'
        : 'Nie udało się wysłać kodu. Sprawdź adres email.');
      return;
    }
    setCodeSent(true);
  };

  const verifyCode = async (value: string) => {
    if (value.length !== 6) return;
    setBusy(true); setError(null);
    const { error } = await createClient().auth.verifyOtp({ email: email.trim(), token: value, type: 'email' });
    setBusy(false);
    if (error) { setError('Kod jest nieprawidłowy lub wygasł.'); setCode(''); return; }
    done();
  };

  const field = 'h-12 w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 text-[16px] text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30';

  return (
    <div className="pt-safe pb-safe flex min-h-dvh flex-col bg-zinc-950 px-5">
      <div className="flex flex-1 items-center justify-center py-10">
        <div className="w-full max-w-sm">
          <div className="mb-9 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192.png" alt="" className="mx-auto h-16 w-16 rounded-[18px] shadow-xl shadow-indigo-950/60" />
            <h1 className="mt-5 text-[22px] font-semibold tracking-tight text-zinc-50">RadaStudentów24</h1>
            <p className="mt-1 text-[15px] text-zinc-500">Posiedzenia, głosowania i uchwały</p>
          </div>

          {!codeSent && (
            <div role="tablist" aria-label="Sposób logowania" className="mb-4 grid grid-cols-2 rounded-xl bg-zinc-900 p-1 ring-1 ring-zinc-800">
              {(['password', 'code'] as const).map((m) => (
                <button key={m} role="tab" aria-selected={mode === m}
                  onClick={() => { setMode(m); setError(null); }}
                  className={clsx('h-9 rounded-lg text-[14px] font-medium transition-colors',
                    mode === m ? 'bg-zinc-700/80 text-zinc-50 shadow-sm' : 'text-zinc-400 hover:text-zinc-200')}>
                  {m === 'password' ? 'Hasło' : 'Kod z maila'}
                </button>
              ))}
            </div>
          )}

          {mode === 'password' && (
            <form onSubmit={signInPassword} className="space-y-3">
              <label htmlFor="email" className="sr-only">Email</label>
              <input id="email" type="email" inputMode="email" autoComplete="username" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="imie.nazwisko@ue.wroc.pl" className={field} />
              <div className="relative">
                <label htmlFor="password" className="sr-only">Hasło</label>
                <input id="password" type={showPw ? 'text' : 'password'} autoComplete="current-password" required
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="Hasło" className={clsx(field, 'pr-12')} />
                <button type="button" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? 'Ukryj hasło' : 'Pokaż hasło'}
                  className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300">
                  {showPw ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                </button>
              </div>
              {error && <p role="alert" className="px-1 text-sm leading-snug text-red-400">{error}</p>}
              <button type="submit" disabled={busy || !email || !password}
                className="press h-12 w-full rounded-xl bg-indigo-600 text-[15px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-40">
                {busy ? 'Logowanie…' : 'Zaloguj się'}
              </button>
              <p className="pt-1 text-center text-[13px] leading-relaxed text-zinc-500">
                Pierwsze logowanie? Użyj hasła tymczasowego od administratora.
              </p>
            </form>
          )}

          {mode === 'code' && !codeSent && (
            <form onSubmit={sendCode} className="space-y-3">
              <label htmlFor="email-code" className="sr-only">Email</label>
              <input id="email-code" type="email" inputMode="email" autoComplete="email" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="imie.nazwisko@ue.wroc.pl" className={field} />
              {error && <p role="alert" className="px-1 text-sm leading-snug text-red-400">{error}</p>}
              <button type="submit" disabled={busy || !email}
                className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-[15px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-40">
                <Mail className="h-4 w-4" />
                {busy ? 'Wysyłanie…' : 'Wyślij kod'}
              </button>
              <p className="pt-1 text-center text-[13px] leading-relaxed text-zinc-500">
                Dostaniesz maila z 6-cyfrowym kodem (i linkiem) — bez hasła.
              </p>
            </form>
          )}

          {mode === 'code' && codeSent && (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-[15px] text-zinc-300">Wpisz kod wysłany na</p>
                <p className="mt-0.5 break-all text-[15px] font-medium text-zinc-50">{email}</p>
              </div>
              <label htmlFor="otp" className="sr-only">Kod z maila</label>
              <input ref={codeRef} id="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                value={code}
                onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); setCode(v); verifyCode(v); }}
                placeholder="••••••" disabled={busy}
                className={clsx(field, 'h-14 text-center font-mono text-2xl tracking-[0.5em] tabular-nums')} />
              {error && <p role="alert" className="text-center text-sm text-red-400">{error}</p>}
              <p className="text-center text-[13px] leading-relaxed text-zinc-500">
                {busy ? 'Sprawdzanie…' : 'Możesz też kliknąć link w mailu — na iPhonie z zainstalowaną aplikacją lepiej wpisać kod.'}
              </p>
              <div className="flex items-center justify-between">
                <button onClick={() => { setCodeSent(false); setCode(''); setError(null); }}
                  className="press flex h-10 items-center gap-1.5 rounded-lg px-2 text-[14px] text-zinc-400 hover:text-zinc-200">
                  <ArrowLeft className="h-4 w-4" /> Inny adres
                </button>
                <button onClick={() => sendCode()} disabled={busy}
                  className="press h-10 rounded-lg px-2 text-[14px] text-indigo-300 hover:text-indigo-200 disabled:opacity-40">
                  Wyślij ponownie
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <p className="pb-4 text-center text-[12px] text-zinc-600">Samorząd Studentów · RadaStudentów24</p>
    </div>
  );
}
