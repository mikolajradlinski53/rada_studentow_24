import { createServerSupabase } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { clsx } from 'clsx';
import { CalendarDays, CalendarPlus, ChevronLeft, FileText, MapPin, Radio, ScrollText, Users } from 'lucide-react';
import { AgendaEditor } from '@/components/session/agenda-editor';
import { StartSessionButtonClient } from '@/components/session/start-session-button';
import { CreateResolutionButton } from '@/components/session/create-resolution-button';
import { getOrgContext } from '@/lib/org';
import { plLong } from '@/lib/dates';
import type { SessionRsvp, SessionStatus } from '@/types/database';
import { SessionRsvpCard } from '@/components/session/session-rsvp';

const STATUS: Record<SessionStatus, { label: string; tone: string }> = {
  draft: { label: 'Szkic', tone: 'bg-zinc-800 text-zinc-400' },
  scheduled: { label: 'Zaplanowane', tone: 'bg-blue-900/40 text-blue-300' },
  in_progress: { label: 'Trwa', tone: 'bg-emerald-900/50 text-emerald-300' },
  closed: { label: 'Zakończone', tone: 'bg-zinc-800 text-zinc-400' },
  protocol_pending: { label: 'Protokół w przygotowaniu', tone: 'bg-amber-900/40 text-amber-300' },
  archived: { label: 'Archiwum', tone: 'bg-zinc-800 text-zinc-500' },
};

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);
  if (!ctx) notFound();

  const supabase = await createServerSupabase();

  const { data: session } = await supabase
    .from('sessions')
    .select(`
      *,
      organ:organs(name, short_name, total_seats, quorum_type, quorum_value),
      term:terms(label),
      chair_profile:profiles!sessions_chaired_by_fkey(full_name)
    `)
    .eq('id', id)
    .eq('organ_id', ctx.organId)
    .maybeSingle();

  if (!session) notFound();

  const [{ data: agendaItems }, { data: passedVotes }, { data: resolutions }, { data: { user } }, { data: rsvps }, { data: roster }] = await Promise.all([
    supabase.from('agenda_items').select('*, attachments:agenda_attachments(*)').eq('session_id', id).order('position'),
    supabase.from('votes').select('id, title').eq('session_id', id).eq('status', 'closed').eq('result', 'passed').order('closed_at'),
    supabase.from('resolutions').select('id, vote_id, signature, title, status').eq('session_id', id),
    supabase.auth.getUser(),
    supabase.from('session_rsvps').select('*').eq('session_id', id),
    supabase.from('mandates').select('id, role, profile:profiles(full_name)').eq('term_id', session.term_id).eq('is_active', true),
  ]);

  const resByVote = new Map((resolutions ?? []).map((r) => [r.vote_id, r]));
  const canManage = ctx.role === 'admin' || ctx.role === 'chair' || session.chaired_by === user?.id;
  const canStart = canManage && (session.status === 'scheduled' || session.status === 'draft');
  const isLive = session.status === 'in_progress';
  const showProtocol = canManage || ctx.role === 'secretary' || ['protocol_pending', 'closed', 'archived'].includes(session.status);
  const status = STATUS[session.status as SessionStatus];
  const upcoming = session.status === 'scheduled' || session.status === 'draft';

  // Voting members: Komisja Rewizyjna, SKW and system admins aren't seats in the organ.
  const voters = ((roster as unknown as { id: string; role: string; profile: { full_name: string } | null }[]) ?? [])
    .filter((m) => !['auditor', 'election_committee', 'admin'].includes(m.role))
    .map((m) => ({ mandateId: m.id, name: m.profile?.full_name ?? '-' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  const organQ = (session as { organ?: { total_seats?: number; quorum_type?: string; quorum_value?: number | null } }).organ;
  const seats = organQ?.total_seats ?? voters.length;
  const required = organQ?.quorum_type === 'two_thirds' ? Math.ceil((seats * 2) / 3)
    : organQ?.quorum_type === 'custom' && organQ.quorum_value ? Number(organQ.quorum_value)
    : Math.floor(seats / 2) + 1;

  const organ = (session as { organ?: { short_name?: string; total_seats?: number } }).organ;
  const term = (session as { term?: { label?: string } }).term?.label;
  const chair = (session as { chair_profile?: { full_name?: string } | null }).chair_profile?.full_name;

  return (
    <div>
      <Link href={`/${org}/sessions`}
        className="press -ml-2 mb-3 inline-flex h-9 items-center gap-0.5 rounded-xl pl-1 pr-3 text-[15px] text-indigo-300 hover:bg-zinc-800/40">
        <ChevronLeft className="h-5 w-5" /> Posiedzenia
      </Link>

      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium', status.tone)}>
            {isLive && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />}
            {status.label}
          </span>
          {session.session_type === 'extraordinary' && (
            <span className="rounded-full border border-amber-800/80 px-2.5 py-0.5 text-[12px] text-amber-400">Nadzwyczajne</span>
          )}
        </div>
        <h1 className="mt-3 text-[24px] font-semibold leading-tight tracking-tight text-zinc-50">{session.title}</h1>

        <dl className="mt-4 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50">
          <Meta icon={CalendarDays} label="Termin">{plLong(new Date(session.scheduled_at))}</Meta>
          {session.location && <Meta icon={MapPin} label="Miejsce">{session.location}</Meta>}
          <Meta icon={Users} label="Organ">
            {organ?.short_name}{term && <span className="text-zinc-500"> · kadencja {term}</span>}
          </Meta>
          {chair && <Meta icon={Radio} label="Prowadzi">{chair}</Meta>}
        </dl>

        <div className="mt-3">
          <a href={`/api/sessions/${session.id}/ics`}
            className="press inline-flex h-10 items-center gap-1.5 rounded-xl border border-zinc-700 px-3.5 text-[13px] font-medium text-zinc-200 hover:border-zinc-500">
            <CalendarPlus className="h-4 w-4" /> Dodaj do kalendarza
          </a>
        </div>

        {(canStart || isLive || showProtocol) && (
          <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
            {canStart && <StartSessionButtonClient sessionId={session.id} org={org} />}
            {isLive && (
              <Link href={`/${org}/sessions/${session.id}/live`}
                className="press flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-[15px] font-semibold text-white hover:bg-emerald-500">
                <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> Wejdź na posiedzenie
              </Link>
            )}
            {showProtocol && (
              <Link href={`/${org}/sessions/${session.id}/protocol`}
                className="press flex h-12 items-center justify-center gap-2 rounded-xl border border-zinc-700 px-5 text-[15px] font-medium text-zinc-200 hover:border-zinc-500">
                <ScrollText className="h-4 w-4" /> Protokół
              </Link>
            )}
          </div>
        )}
      </div>

      {upcoming && (
        <section className="mb-8">
          <h2 className="mb-2.5 text-[13px] font-medium uppercase tracking-wide text-zinc-500">Obecność</h2>
          <SessionRsvpCard sessionId={session.id} myMandateId={ctx.mandateId} canManage={canManage}
            roster={voters} required={required} initial={(rsvps as SessionRsvp[]) ?? []} />
        </section>
      )}

      {/* Agenda */}
      <section>
        <div className="mb-2.5 flex items-baseline justify-between">
          <h2 className="text-[13px] font-medium uppercase tracking-wide text-zinc-500">Porządek obrad</h2>
          {(agendaItems?.length ?? 0) > 0 && (
            <span className="text-[13px] tabular-nums text-zinc-500">{agendaItems!.length} pkt</span>
          )}
        </div>
        <AgendaEditor sessionId={session.id} initialItems={agendaItems ?? []} canEdit={canManage && !isLive}
          canManageMaterials={canManage} orgId={ctx.org.id} />
      </section>

      {/* Resolutions from passed votes */}
      {(passedVotes?.length ?? 0) > 0 && (
        <section className="mt-8">
          <h2 className="mb-2.5 text-[13px] font-medium uppercase tracking-wide text-zinc-500">Uchwały</h2>
          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50">
            {passedVotes!.map((v, i) => {
              const res = resByVote.get(v.id);
              return (
                <div key={v.id} className={clsx('flex items-center gap-3 px-4 py-3', i > 0 && 'border-t border-zinc-800/80')}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-900/40 text-indigo-300">
                    <FileText className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] text-zinc-100">
                      {res ? res.signature : v.title.replace(/^Głosowanie:\s*/i, '')}
                    </div>
                    <div className="text-[13px] text-zinc-500">{res ? 'Uchwała utworzona' : 'Głosowanie przyjęte'}</div>
                  </div>
                  {res ? (
                    <Link href={`/${org}/resolutions/${res.id}`}
                      className="press flex h-9 shrink-0 items-center rounded-xl border border-zinc-700 px-3.5 text-[13px] font-medium text-zinc-200 hover:border-zinc-500">
                      Otwórz
                    </Link>
                  ) : canManage ? (
                    <CreateResolutionButton org={org} voteId={v.id} />
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function Meta({ icon: Icon, label, children }: { icon: typeof CalendarDays; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 border-t border-zinc-800/80 px-4 py-3 first:border-t-0">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
      <dt className="sr-only">{label}</dt>
      <dd className="min-w-0 text-[15px] text-zinc-200">{children}</dd>
    </div>
  );
}
