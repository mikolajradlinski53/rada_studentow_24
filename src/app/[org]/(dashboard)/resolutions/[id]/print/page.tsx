import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { getOrgContext } from '@/lib/org';
import { createServerSupabase } from '@/lib/supabase/server';
import { PrintButton } from '@/components/print-button';
import { ResolutionDocument } from '@/components/resolution-document';

export default async function ResolutionPrintPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);
  if (!ctx) notFound();

  const supabase = await createServerSupabase();
  const { data: r } = await supabase
    .from('resolutions')
    .select('*, session:sessions(organ_id, scheduled_at, organ:organs(name)), signer:profiles!resolutions_signed_by_fkey(full_name)')
    .eq('id', id)
    .maybeSingle();

  const session = (r as { session?: { organ_id?: string } } | null)?.session as
    | { organ_id?: string; scheduled_at?: string; organ?: { name?: string } }
    | undefined;
  if (!r || session?.organ_id !== ctx.organId) notFound();

  const dateStr = r.signed_at
    ? format(new Date(r.signed_at), 'd MMMM yyyy', { locale: pl })
    : session?.scheduled_at
      ? format(new Date(session.scheduled_at), 'd MMMM yyyy', { locale: pl })
      : '';

  return (
    <div className="space-y-4">
      <div className="flex justify-end print:hidden">
        <PrintButton />
      </div>
      <ResolutionDocument
        orgName={session?.organ?.name ?? ctx.org.name}
        signature={r.signature}
        title={r.title}
        legalBasis={r.legal_basis}
        body={r.body}
        dateStr={dateStr}
        signer={(r as { signer?: { full_name?: string } }).signer?.full_name ?? null}
        headerText={ctx.org.resolution_header}
        footerText={ctx.org.resolution_footer}
        font={ctx.org.resolution_font}
      />
    </div>
  );
}
