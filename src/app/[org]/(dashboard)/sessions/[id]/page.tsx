import { createServerSupabase } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import Link from 'next/link';
import { AgendaEditor } from '@/components/session/agenda-editor';
import { getOrgContext } from '@/lib/org';

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
      organ:organs(name, short_name, total_seats),
      term:terms(label),
      chair_profile:profiles!sessions_chaired_by_fkey(full_name)
    `)
    .eq('id', id)
    .eq('organ_id', ctx.organId)
    .maybeSingle();

  if (!session) notFound();

  const { data: agendaItems } = await supabase
    .from('agenda_items')
    .select('*')
    .eq('session_id', id)
    .order('position');

  const { data: passedVotes } = await supabase
    .from('votes')
    .select('id, title')
    .eq('session_id', id)
    .eq('status', 'closed')
    .eq('result', 'passed')
    .order('closed_at');

  const { data: resolutions } = await supabase
    .from('resolutions')
    .select('id, vote_id, signature, title, status')
    .eq('session_id', id);

  const resByVote = new Map((resolutions ?? []).map((r) => [r.vote_id, r]));

  const { data: { user } } = await supabase.auth.getUser();

  const canManage = ctx.role === 'admin' || ctx.role === 'chair' || session.chaired_by === user?.id;
  const canStart = canManage && (session.status === 'scheduled' || session.status === 'draft');
  const isLive = session.status === 'in_progress';

  const date = new Date(session.scheduled_at);

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <Link href={`/${org}/sessions`} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          ← Posiedzenia
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-zinc-100">
          {session.title}
        </h1>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-400">
          <span>{format(date, "EEEE, d MMMM yyyy · HH:mm", { locale: pl })}</span>
          {session.location && <span>· {session.location}</span>}
          <span>· {(session as any).organ?.short_name}</span>
          <span>· Kadencja {(session as any).term?.label}</span>
        </div>

        {/* Action buttons */}
        <div className="mt-4 flex gap-2">
          {canStart && (
            <StartSessionButton sessionId={session.id} org={org} />
          )}
          {isLive && (
            <Link
              href={`/${org}/sessions/${session.id}/live`}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition-colors"
            >
              Wejdź na posiedzenie →
            </Link>
          )}
          {(canManage || ['protocol_pending', 'closed', 'archived'].includes(session.status)) && (
            <Link
              href={`/${org}/sessions/${session.id}/protocol`}
              className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors"
            >
              Protokół
            </Link>
          )}
        </div>
      </div>

      {/* Agenda */}
      <div>
        <h2 className="text-sm font-medium text-zinc-300 mb-4">Porządek obrad</h2>
        <AgendaEditor
          sessionId={session.id}
          initialItems={agendaItems ?? []}
          canEdit={canManage && !isLive}
        />
      </div>

      {/* Resolutions from passed votes */}
      {(passedVotes?.length ?? 0) > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-medium text-zinc-300 mb-4">Uchwały</h2>
          <div className="space-y-1.5">
            {passedVotes!.map((v) => {
              const res = resByVote.get(v.id);
              return (
                <div key={v.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-zinc-200">
                      {res ? res.signature : v.title.replace(/^Głosowanie:\s*/i, '')}
                    </div>
                    <div className="text-xs text-zinc-500">{res ? 'Uchwała utworzona' : 'Głosowanie przyjęte'}</div>
                  </div>
                  {res ? (
                    <Link href={`/${org}/resolutions/${res.id}`}
                      className="shrink-0 rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors">
                      Otwórz uchwałę
                    </Link>
                  ) : canManage ? (
                    <CreateResolutionButton org={org} voteId={v.id} />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Client component for the start button
function StartSessionButton({ sessionId, org }: { sessionId: string; org: string }) {
  return <StartSessionButtonClient sessionId={sessionId} org={org} />;
}

import { StartSessionButtonClient } from '@/components/session/start-session-button';
import { CreateResolutionButton } from '@/components/session/create-resolution-button';
