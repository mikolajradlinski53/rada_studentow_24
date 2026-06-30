import { notFound } from 'next/navigation';
import { getOrgContext } from '@/lib/org';
import { createServerSupabase } from '@/lib/supabase/server';
import { ResolutionEditor } from './resolution-editor';

export default async function ResolutionPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);
  if (!ctx) notFound();

  const supabase = await createServerSupabase();
  const { data: r } = await supabase
    .from('resolutions')
    .select('*, session:sessions(title, organ_id, chaired_by), signer:profiles!resolutions_signed_by_fkey(full_name)')
    .eq('id', id)
    .maybeSingle();

  const session = (r as { session?: { organ_id?: string; chaired_by?: string; title?: string } } | null)?.session;
  if (!r || session?.organ_id !== ctx.organId) notFound();

  const { data: { user } } = await supabase.auth.getUser();
  const canEdit =
    ctx.role === 'admin' || ctx.role === 'chair' ||
    (!!session?.chaired_by && session.chaired_by === user?.id);

  return (
    <ResolutionEditor
      org={org}
      id={r.id}
      signature={r.signature}
      sessionTitle={session?.title ?? ''}
      canEdit={canEdit}
      signerName={(r as { signer?: { full_name?: string } }).signer?.full_name ?? null}
      signedAt={r.signed_at}
      initial={{ title: r.title, body: r.body, legal_basis: r.legal_basis ?? '', status: r.status }}
    />
  );
}
