import { createServerSupabase } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { clsx } from 'clsx';
import { CalendarPlus, ChevronRight, MapPin, Plus } from 'lucide-react';
import { getOrgContext } from '@/lib/org';
import { plDay, plLong, plMonthShort, plRelativeDay, plTime, plWeekdayShort } from '@/lib/dates';
import type { Session, SessionStatus } from '@/types/database';
import { InstallPrompt } from '@/components/pwa/install-prompt';
import { NotificationNudge } from '@/components/pwa/notification-toggle';

const STATUS_CONFIG: Record<SessionStatus, { label: string; color: string }> = {
  draft: { label: 'Szkic', color: 'bg-zinc-800 text-zinc-400' },
  scheduled: { label: 'Zaplanowane', color: 'bg-blue-900/40 text-blue-300' },
  in_progress: { label: 'Trwa', color: 'bg-emerald-900/50 text-emerald-300' },
  closed: { label: 'Zakończone', color: 'bg-zinc-800 text-zinc-400' },
  protocol_pending: { label: 'Protokół', color: 'bg-amber-900/40 text-amber-300' },
  archived: { label: 'Archiwum', color: 'bg-zinc-800 text-zinc-500' },
};

const UPCOMING: SessionStatus[] = ['in_progress', 'scheduled', 'draft'];

export default async function SessionsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!ctx) notFound();

  const supabase = await createServerSupabase();

  // Scope sessions to THIS org's organ (isolation: no cross-org rows leak in).
  const { data } = await supabase
    .from('sessions')
    .select('*')
    .eq('organ_id', ctx.organId)
    .order('scheduled_at', { ascending: false });
  const sessions = (data as Session[]) ?? [];

  // Members care about what's next: live first, then the nearest upcoming.
  const upcoming = sessions
    .filter((s) => UPCOMING.includes(s.status))
    .sort((a, b) =>
      a.status === 'in_progress' ? -1 : b.status === 'in_progress' ? 1 : a.scheduled_at.localeCompare(b.scheduled_at));
  const past = sessions.filter((s) => !UPCOMING.includes(s.status));

  const canCreate = ctx.role === 'admin' || ctx.role === 'chair';

  return (
    <div>
      <InstallPrompt />

      <div className="mb-6 flex items-end justify-between gap-3 md:mb-8">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight text-zinc-50">Posiedzenia</h1>
          <p className="mt-1 truncate text-sm text-zinc-500">{ctx.organShortName || ctx.org.name}</p>
        </div>
        {canCreate && (
          <Link
            href={`/${org}/sessions/new`}
            aria-label="Nowe posiedzenie"
            className="press flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            <Plus className="h-4 w-4" />
            <span className="sm:hidden">Nowe</span><span className="hidden sm:inline">Nowe posiedzenie</span>
          </Link>
        )}
      </div>

      <div className="mb-5 empty:hidden"><NotificationNudge /></div>

      {!sessions.length ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 px-6 py-12 text-center">
          <CalendarPlus className="mx-auto h-8 w-8 text-zinc-600" />
          <p className="mt-3 text-[15px] text-zinc-300">Brak posiedzeń</p>
          <p className="mt-1 text-[13px] text-zinc-500">
            {canCreate ? 'Zaplanuj pierwsze — radni zobaczą porządek obrad.' : 'Gdy prowadzący zaplanuje posiedzenie, pojawi się tutaj.'}
          </p>
          {canCreate && (
            <Link href={`/${org}/sessions/new`}
              className="press mt-4 inline-flex h-10 items-center rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white">
              Utwórz posiedzenie
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {upcoming.length > 0 && (
            <Group title="Nadchodzące">
              {upcoming.map((s) => <SessionRow key={s.id} s={s} org={org} />)}
            </Group>
          )}
          {past.length > 0 && (
            <Group title="Minione">
              {past.map((s) => <SessionRow key={s.id} s={s} org={org} />)}
            </Group>
          )}
        </div>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2.5 text-[13px] font-medium uppercase tracking-wide text-zinc-500">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function SessionRow({ s, org }: { s: Session; org: string }) {
  const status = STATUS_CONFIG[s.status];
  const date = new Date(s.scheduled_at);
  const live = s.status === 'in_progress';
  const rel = UPCOMING.includes(s.status) ? plRelativeDay(date) : null;

  return (
    <Link
      href={live ? `/${org}/sessions/${s.id}/live` : `/${org}/sessions/${s.id}`}
      className={clsx(
        'press group flex items-center gap-4 rounded-2xl border px-4 py-3.5 sm:px-5 sm:py-4',
        live
          ? 'border-emerald-700/70 bg-emerald-950/25 hover:border-emerald-600'
          : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-900'
      )}
    >
      {/* Date block */}
      <div className={clsx('flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl',
        live ? 'bg-emerald-900/40' : 'bg-zinc-800/70')}>
        <span className={clsx('text-[17px] font-semibold leading-none tabular-nums', live ? 'text-emerald-200' : 'text-zinc-100')}>
          {plDay(date)}
        </span>
        <span className="mt-1 text-[10px] font-medium uppercase leading-none tracking-wide text-zinc-500">{plMonthShort(date)}</span>
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium text-zinc-100">{s.title}</div>
        <div className="mt-0.5 flex items-center gap-1 truncate text-[13px] text-zinc-500">
          <span className="sm:hidden">{rel ?? plWeekdayShort(date)}, {plTime(date)}</span>
          <span className="hidden sm:inline">{plLong(date)}</span>
          {s.location && (
            <>
              <span aria-hidden>·</span>
              <MapPin className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">{s.location}</span>
            </>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', status.color)}>
            {live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />}
            {status.label}
          </span>
          {s.session_type === 'extraordinary' && (
            <span className="rounded-full border border-amber-800/80 px-2 py-0.5 text-[11px] text-amber-400">Nadzwyczajne</span>
          )}
        </div>
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}
