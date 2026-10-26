import { notFound } from 'next/navigation';
import { getOrgContext } from '@/lib/org';
import { createServerSupabase } from '@/lib/supabase/server';
import { CircularView } from './circular-view';

export default async function CircularVotePage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);
  if (!ctx) notFound();

  const supabase = await createServerSupabase();
  const { data: session } = await supabase
    .from('sessions').select('id, kind, chaired_by').eq('id', id).eq('organ_id', ctx.organId).maybeSingle();
  if (!session || session.kind !== 'circular') notFound();
  const [{ data: { user } }, { data: resolution }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('resolutions').select('id').eq('session_id', id).maybeSingle(),
  ]);
  const canManage = ctx.role === 'admin' || ctx.role === 'chair' || session.chaired_by === user?.id;

  return <CircularView org={org} sessionId={id} orgId={ctx.org.id} canManage={canManage} resolutionId={resolution?.id ?? null} />;
}
