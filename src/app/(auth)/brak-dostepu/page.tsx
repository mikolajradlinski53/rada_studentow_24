import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { NoAccessActions } from './no-access-actions';

export const metadata = { title: 'Brak dostępu · RadaStudentów24' };

export default async function NoAccessPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="pt-safe pb-safe flex min-h-dvh items-center justify-center bg-zinc-950 px-5">
      <div className="w-full max-w-sm text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="mx-auto h-16 w-16 rounded-[18px] shadow-xl shadow-indigo-950/60" />
        <h1 className="mt-6 text-xl font-semibold tracking-tight text-zinc-50">Nie masz jeszcze dostępu</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-zinc-400">
          Jesteś zalogowany/a jako
        </p>
        <p className="mt-1 break-all text-[15px] font-medium text-zinc-200">{user.email}</p>
        <p className="mt-4 text-[15px] leading-relaxed text-zinc-400">
          Ten adres nie ma aktywnego mandatu w żadnym organie. Poproś administratora
          samorządu o zaproszenie <span className="text-zinc-200">dokładnie na ten adres</span> — potem
          stuknij „Sprawdź ponownie”.
        </p>
        <NoAccessActions />
      </div>
    </div>
  );
}
