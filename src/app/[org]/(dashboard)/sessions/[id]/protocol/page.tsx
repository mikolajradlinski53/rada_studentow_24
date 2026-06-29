import { notFound } from 'next/navigation';
import { getOrgContext } from '@/lib/org';
import { createServerSupabase } from '@/lib/supabase/server';
import { ProtocolEditor } from './protocol-editor';

export default async function ProtocolPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);
  if (!ctx) notFound();

  const supabase = await createServerSupabase();

  const { data: session } = await supabase
    .from('sessions').select('title, chaired_by').eq('id', id).eq('organ_id', ctx.organId).maybeSingle();
  if (!session) notFound();

  const { data: { user } } = await supabase.auth.getUser();
  const { data: protocol } = await supabase
    .from('protocols').select('body, status, generated_at').eq('session_id', id).maybeSingle();

  const canEdit =
    ctx.role === 'admin' || ctx.role === 'chair' ||
    (!!session.chaired_by && session.chaired_by === user?.id);

  return (
    <ProtocolEditor
      org={org}
      sessionId={id}
      sessionTitle={session.title}
      canEdit={canEdit}
      initialBody={protocol?.body ?? null}
      initialStatus={protocol?.status ?? 'draft'}
      generatedAt={protocol?.generated_at ?? null}
    />
  );
}
