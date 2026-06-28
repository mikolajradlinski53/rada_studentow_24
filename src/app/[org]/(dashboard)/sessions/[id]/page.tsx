import { createServerSupabase } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import Link from 'next/link';
import { AgendaEditor } from '@/components/session/agenda-editor';

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
    .single();

  if (!session) notFound();

  const { data: agendaItems } = await supabase
    .from('agenda_items')
    .select('*')
    .eq('session_id', id)
    .order('position');

  const { data: { user } } = await supabase.auth.getUser();
  const { data: mandate } = await supabase
    .from('mandates')
    .select('role')
    .eq('profile_id', user?.id ?? '')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  const canManage = mandate?.role === 'admin' || mandate?.role === 'chair' || session.chaired_by === user?.id;
  const canStart = canManage && (session.status === 'scheduled' || session.status === 'draft');
  const isLive = session.status === 'in_progress';

  const date = new Date(session.scheduled_at);

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <Link href="/sessions" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
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
            <StartSessionButton sessionId={session.id} />
          )}
          {isLive && (
            <Link
              href={`/sessions/${session.id}/live`}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition-colors"
            >
              Wejdź na posiedzenie →
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
    </div>
  );
}

// Client component for the start button
function StartSessionButton({ sessionId }: { sessionId: string }) {
  return <StartSessionButtonClient sessionId={sessionId} />;
}

import { StartSessionButtonClient } from '@/components/session/start-session-button';
