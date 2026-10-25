import { redirect } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import { PasswordForm } from '@/components/auth/password-form';

export const metadata = { title: 'Ustaw hasło · RadaStudentów24' };

export default async function SetPasswordPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="pt-safe pb-safe flex min-h-dvh items-center justify-center bg-zinc-950 px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600/15 text-indigo-300 ring-1 ring-indigo-500/30">
            <KeyRound className="h-6 w-6" />
          </div>
          <h1 className="mt-5 text-xl font-semibold tracking-tight text-zinc-50">Ustaw własne hasło</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-zinc-400">
            Logujesz się hasłem tymczasowym od administratora. Wybierz własne. Tylko Ty
            będziesz je znać.
          </p>
          <p className="mt-2 break-all text-[13px] text-zinc-500">{user.email}</p>
        </div>
        <PasswordForm redirectTo="/" submitLabel="Ustaw hasło i przejdź dalej" />
      </div>
    </div>
  );
}
