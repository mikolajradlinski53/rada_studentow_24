import { notFound } from 'next/navigation';
import { getOrgContext } from '@/lib/org';
import { createServerSupabase } from '@/lib/supabase/server';
import { AdminClient, type Member, type Pending } from './admin-client';

export default async function AdminPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!ctx || ctx.role !== 'admin') notFound();

  const supabase = await createServerSupabase();

  const { data: members } = await supabase
    .from('mandates')
    .select('id, role, is_active, profile:profiles(full_name, email)')
    .eq('term_id', ctx.termId)
    .eq('is_active', true)
    .order('role');

  const { data: pending } = await supabase
    .from('invitations')
    .select('id, email, role')
    .eq('term_id', ctx.termId)
    .is('accepted_at', null)
    .order('created_at', { ascending: false });

  return (
    <AdminClient
      org={org}
      myMandateId={ctx.mandateId}
      members={(members as unknown as Member[]) ?? []}
      pending={(pending as unknown as Pending[]) ?? []}
    />
  );
}
