'use server';

import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/lib/org';
import { createServerSupabase } from '@/lib/supabase/server';
import { buildProtocolMarkdown, type ProtocolData } from '@/lib/protocol';
import type { AttendanceStatus, ProtocolStatus, FormalMotionType } from '@/types/database';

type Result = { ok?: true; error?: string };

const FORMAL_LABEL: Record<FormalMotionType, string> = {
  break: 'Przerwa', extend_time: 'Przedłużenie czasu', close_list: 'Zamknięcie listy mówców',
  reconsider: 'Reasumpcja', other: 'Wniosek',
};

async function canManage(slug: string, sessionId: string) {
  const ctx = await getOrgContext(slug);
  if (!ctx) return null;
  if (ctx.role === 'admin' || ctx.role === 'chair') return ctx;
  // SKW / delegated chair: manages this specific session
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: s } = await supabase.from('sessions').select('chaired_by').eq('id', sessionId).maybeSingle();
  if (s?.chaired_by && s.chaired_by === user?.id) return ctx;
  return null;
}

export async function generateProtocol(slug: string, sessionId: string): Promise<Result> {
  const ctx = await canManage(slug, sessionId);
  if (!ctx) return { error: 'Brak uprawnień' };

  const supabase = await createServerSupabase();

  const { data: session } = await supabase
    .from('sessions')
    .select('title, scheduled_at, location, opened_at, closed_at, organ:organs(name, short_name), term:terms(label)')
    .eq('id', sessionId)
    .eq('organ_id', ctx.organId)
    .maybeSingle();
  if (!session) return { error: 'Nie znaleziono posiedzenia' };

  const { data: q } = await supabase.rpc('calculate_quorum', { p_session_id: sessionId });

  const { data: att } = await supabase
    .from('attendance')
    .select('status, mandate:mandates(profile:profiles(full_name))')
    .eq('session_id', sessionId);

  const { data: agenda } = await supabase
    .from('agenda_items')
    .select('position, title, item_type, discussion_notes')
    .eq('session_id', sessionId)
    .order('position');

  const { data: votes } = await supabase
    .from('votes')
    .select('id, title, vote_type, result, votes_for, votes_against, votes_abstain')
    .eq('session_id', sessionId)
    .eq('status', 'closed')
    .order('closed_at');

  const { data: motions } = await supabase
    .from('floor_requests')
    .select('formal_type, minutes, mandate:mandates(profile:profiles(full_name))')
    .eq('session_id', sessionId)
    .eq('kind', 'formal')
    .eq('status', 'done');

  type NamedRow = { status?: string; formal_type?: string | null; minutes?: number | null; mandate?: { profile?: { full_name?: string } | null } | null };
  const nameOf = (r: NamedRow) => r.mandate?.profile?.full_name ?? '—';

  // Named voters for open votes.
  const voteData: ProtocolData['votes'] = [];
  for (const v of votes ?? []) {
    const entry: ProtocolData['votes'][number] = {
      title: v.title, voteType: v.vote_type, result: v.result,
      forN: v.votes_for, against: v.votes_against, abstain: v.votes_abstain,
    };
    if (v.vote_type === 'open') {
      const { data: ballots } = await supabase
        .from('ballots').select('choice, mandate:mandates(profile:profiles(full_name))').eq('vote_id', v.id);
      const voters = { for: [] as string[], against: [] as string[], abstain: [] as string[] };
      for (const b of (ballots ?? []) as (NamedRow & { choice: 'for' | 'against' | 'abstain' })[]) {
        voters[b.choice].push(nameOf(b));
      }
      entry.voters = voters;
    }
    voteData.push(entry);
  }

  const data: ProtocolData = {
    orgName: (session as { organ?: { name?: string } }).organ?.name ?? '',
    organShort: (session as { organ?: { short_name?: string } }).organ?.short_name ?? '',
    termLabel: (session as { term?: { label?: string } }).term?.label ?? '',
    title: session.title,
    scheduledAt: session.scheduled_at,
    location: session.location,
    openedAt: session.opened_at,
    closedAt: session.closed_at,
    quorum: (q as ProtocolData['quorum']) ?? null,
    attendance: (att ?? []).map((a) => ({ name: nameOf(a as NamedRow), status: a.status as AttendanceStatus })),
    agenda: (agenda ?? []).map((a) => ({ position: a.position, title: a.title, itemType: a.item_type, notes: a.discussion_notes })),
    votes: voteData,
    motions: (motions ?? []).map((m) => ({
      label: (m.formal_type ? FORMAL_LABEL[m.formal_type as FormalMotionType] : 'Wniosek') + (m.minutes ? ` (${m.minutes} min)` : ''),
      requester: nameOf(m as NamedRow),
    })),
  };

  const body = buildProtocolMarkdown(data);

  const { error } = await supabase
    .from('protocols')
    .upsert({ session_id: sessionId, body, status: 'draft', generated_at: new Date().toISOString() }, { onConflict: 'session_id' });
  if (error) return { error: error.message };

  await supabase.rpc('log_audit', { p_action: 'protocol.generated', p_target_type: 'session', p_target_id: sessionId, p_metadata: {} });
  revalidatePath(`/${slug}/sessions/${sessionId}/protocol`);
  return { ok: true };
}

export async function saveProtocol(slug: string, sessionId: string, body: string, status: ProtocolStatus): Promise<Result> {
  const ctx = await canManage(slug, sessionId);
  if (!ctx) return { error: 'Brak uprawnień' };

  const supabase = await createServerSupabase();
  const { error } = await supabase.from('protocols').update({ body, status }).eq('session_id', sessionId);
  if (error) return { error: error.message };

  revalidatePath(`/${slug}/sessions/${sessionId}/protocol`);
  return { ok: true };
}
