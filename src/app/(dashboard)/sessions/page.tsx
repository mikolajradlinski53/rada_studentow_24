import { createServerSupabase } from '@/lib/supabase/server';
import Link from 'next/link';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { clsx } from 'clsx';
import type { SessionStatus } from '@/types/database';

const STATUS_CONFIG: Record<SessionStatus, { label: string; color: string }> = {
  draft: { label: 'Szkic', color: 'bg-zinc-700 text-zinc-300' },
  scheduled: { label: 'Zaplanowane', color: 'bg-blue-900/50 text-blue-300' },
  in_progress: { label: 'W trakcie', color: 'bg-emerald-900/50 text-emerald-300' },
  closed: { label: 'Zakończone', color: 'bg-zinc-700 text-zinc-400' },
  protocol_pending: { label: 'Protokół', color: 'bg-amber-900/50 text-amber-300' },
  archived: { label: 'Archiwum', color: 'bg-zinc-800 text-zinc-500' },
};

export default async function SessionsPage() {
  const supabase = await createServerSupabase();

  const { data: sessions } = await supabase
    .from('sessions')
    .select('*, organ:organs(short_name), chair_profile:profiles!sessions_chaired_by_fkey(full_name)')
    .order('scheduled_at', { ascending: false });

  // Check if user can create sessions (chair or admin)
  const { data: { user } } = await supabase.auth.getUser();
  const { data: mandate } = await supabase
    .from('mandates')
    .select('role')
    .eq('profile_id', user?.id ?? '')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  const canCreate = mandate?.role === 'admin' || mandate?.role === 'chair';

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Posiedzenia</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Zarządzaj posiedzeniami organu
          </p>
        </div>
        {canCreate && (
          <Link
            href="/sessions/new"
            className="rounded-md bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
          >
            Nowe posiedzenie
          </Link>
        )}
      </div>

      {!sessions?.length ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-12 text-center">
          <p className="text-sm text-zinc-500">Brak posiedzeń</p>
          {canCreate && (
            <Link
              href="/sessions/new"
              className="mt-3 inline-block text-sm text-indigo-400 hover:text-indigo-300"
            >
              Utwórz pierwsze posiedzenie
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => {
            const status = STATUS_CONFIG[session.status as SessionStatus];
            const date = new Date(session.scheduled_at);

            return (
              <Link
                key={session.id}
                href={
                  session.status === 'in_progress'
                    ? `/sessions/${session.id}/live`
                    : `/sessions/${session.id}`
                }
                className="flex items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-900/50 px-5 py-4 hover:border-zinc-700 hover:bg-zinc-900 transition-colors group"
              >
                {/* Date block */}
                <div className="shrink-0 w-14 text-center">
                  <div className="text-2xl font-semibold text-zinc-300 group-hover:text-zinc-100 transition-colors">
                    {format(date, 'd')}
                  </div>
                  <div className="text-xs text-zinc-500 uppercase">
                    {format(date, 'MMM', { locale: pl })}
                  </div>
                </div>

                {/* Separator */}
                <div className="h-10 w-px bg-zinc-800" />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-zinc-200 truncate">
                    {session.title}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {format(date, "EEEE, d MMMM yyyy · HH:mm", { locale: pl })}
                    {session.location && ` · ${session.location}`}
                  </div>
                </div>

                {/* Status */}
                <span className={clsx('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium', status.color)}>
                  {status.label}
                </span>

                {/* Type badge */}
                {session.session_type === 'extraordinary' && (
                  <span className="shrink-0 rounded-full border border-amber-800 px-2 py-0.5 text-xs text-amber-400">
                    Nadzwyczajne
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
