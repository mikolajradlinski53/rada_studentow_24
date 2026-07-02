import { notFound } from 'next/navigation';
import { getOrgContext } from '@/lib/org';
import { createServerSupabase } from '@/lib/supabase/server';
import { AdminClient, type Member, type Pending } from './admin-client';
import { BrandingSection } from './branding-section';

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
    <div>
      <BrandingSection
        slug={org}
        name={ctx.org.name}
        accentColor={ctx.org.accent_color}
        logoUrl={ctx.org.logo_url}
        enabledModules={ctx.org.enabled_modules}
        resolutionHeader={ctx.org.resolution_header}
        resolutionFooter={ctx.org.resolution_footer}
        resolutionFont={ctx.org.resolution_font}
      />
      <AdminClient
        org={org}
        myMandateId={ctx.mandateId}
        members={(members as unknown as Member[]) ?? []}
        pending={(pending as unknown as Pending[]) ?? []}
      />
    </div>
  );
}
