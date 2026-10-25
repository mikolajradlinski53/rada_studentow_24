import { createServerSupabase } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { clsx } from 'clsx';
import { getOrgContext } from '@/lib/org';
import type { SessionStatus } from '@/types/database';
import { InstallPrompt } from '@/components/pwa/install-prompt';
import { NotificationNudge } from '@/components/pwa/notification-toggle';

const STATUS_CONFIG: Record<SessionStatus, { label: string; color: string }> = {
  draft: { label: 'Szkic', color: 'bg-zinc-700 text-zinc-300' },
  scheduled: { label: 'Zaplanowane', color: 'bg-blue-900/50 text-blue-300' },
  in_progress: { label: 'W trakcie', color: 'bg-emerald-900/50 text-emerald-300' },
  closed: { label: 'Zakończone', color: 'bg-zinc-700 text-zinc-400' },
  protocol_pending: { label: 'Protokół', color: 'bg-amber-900/50 text-amber-300' },
  archived: { label: 'Archiwum', color: 'bg-zinc-800 text-zinc-500' },
};

export default async function SessionsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!ctx) notFound();

  const supabase = await createServerSupabase();

  // Scope sessions to THIS org's organ (isolation: no cross-org rows leak in).
  const { data: sessions } = await supabase
    .from('sessions')
    .select('*, organ:organs(short_name), chair_profile:profiles!sessions_chaired_by_fkey(full_name)')
    .eq('organ_id', ctx.organId)
    .order('scheduled_at', { ascending: false });

  const canCreate = ctx.role === 'admin' || ctx.role === 'chair';

  return (
    <div>
      <InstallPrompt />

      <div className="mb-6 flex items-center justify-between gap-3 md:mb-8">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Posiedzenia</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Zarządzaj posiedzeniami organu
          </p>
        </div>
        {canCreate && (
          <Link
            href={`/${org}/sessions/new`}
            className="shrink-0 rounded-md bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
          >
            <span className="sm:hidden">+ Nowe</span><span className="hidden sm:inline">Nowe posiedzenie</span>
          </Link>
        )}
      </div>

      <div className="mb-4 empty:hidden"><NotificationNudge /></div>

      {!sessions?.length ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-12 text-center">
          <p className="text-sm text-zinc-500">Brak posiedzeń</p>
          {canCreate && (
            <Link
              href={`/${org}/sessions/new`}
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
                    ? `/${org}/sessions/${session.id}/live`
                    : `/${org}/sessions/${session.id}`
                }
                className={clsx(
                  'group flex items-center gap-4 rounded-xl border px-4 py-3.5 transition-colors active:scale-[0.99] sm:px-5 sm:py-4',
                  session.status === 'in_progress'
                    ? 'border-emerald-700/70 bg-emerald-950/20 hover:border-emerald-600'
                    : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-900'
                )}
              >
                {/* Date block */}
                <div className="w-11 shrink-0 text-center sm:w-14">
                  <div className="text-2xl font-semibold text-zinc-300 group-hover:text-zinc-100 transition-colors">
                    {format(date, 'd')}
                  </div>
                  <div className="text-xs text-zinc-500 uppercase">
                    {format(date, 'MMM', { locale: pl })}
                  </div>
                </div>

                {/* Separator */}
                <div className="h-10 w-px shrink-0 bg-zinc-800" />

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-zinc-200">
                    {session.title}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-zinc-500">
                    <span className="sm:hidden">{format(date, 'EEE, HH:mm', { locale: pl })}</span>
                    <span className="hidden sm:inline">{format(date, "EEEE, d MMMM yyyy · HH:mm", { locale: pl })}</span>
                    {session.location && ` · ${session.location}`}
                  </div>
                  {/* Badges under the title on phones */}
                  <div className="mt-1.5 flex flex-wrap gap-1.5 sm:hidden">
                    <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-medium', status.color)}>
                      {session.status === 'in_progress' && '● '}{status.label}
                    </span>
                    {session.session_type === 'extraordinary' && (
                      <span className="rounded-full border border-amber-800 px-2 py-0.5 text-[11px] text-amber-400">Nadzwyczajne</span>
                    )}
                  </div>
                </div>

                {/* Status */}
                <span className={clsx('hidden shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium sm:inline', status.color)}>
                  {status.label}
                </span>

                {/* Type badge */}
                {session.session_type === 'extraordinary' && (
                  <span className="hidden shrink-0 rounded-full border border-amber-800 px-2 py-0.5 text-xs text-amber-400 sm:inline">
                    Nadzwyczajne
                  </span>
                )}

                <span className="shrink-0 text-zinc-600 sm:hidden" aria-hidden>›</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
