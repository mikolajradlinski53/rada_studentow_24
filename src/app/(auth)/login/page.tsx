'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError('Nie udało się wysłać linku. Sprawdź adres email.');
    } else {
      setSent(true);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">
            RadaStudentów24
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            System obsługi posiedzeń
          </p>
        </div>

        {sent ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-950 text-emerald-400">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 className="text-lg font-medium text-zinc-100">Sprawdź email</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Wysłaliśmy link do logowania na{' '}
              <span className="text-zinc-200">{email}</span>.
              Kliknij go, żeby się zalogować.
            </p>
            <button
              onClick={() => { setSent(false); setEmail(''); }}
              className="mt-6 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Użyj innego adresu
            </button>
          </div>
        ) : (
          <form onSubmit={handleLogin}>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
              <label htmlFor="email" className="block text-sm font-medium text-zinc-300 mb-2">
                Email uczelniany
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="imie.nazwisko@ue.wroc.pl"
                required
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
              />

              {error && (
                <p className="mt-2 text-sm text-red-400">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading || !email}
                className="mt-4 w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Wysyłanie...' : 'Wyślij link do logowania'}
              </button>
            </div>

            <p className="mt-4 text-center text-xs text-zinc-600">
              Otrzymasz email z jednorazowym linkiem — bez hasła.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
