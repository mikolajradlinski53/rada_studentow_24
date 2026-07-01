import { notFound } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { createServerSupabase } from '@/lib/supabase/server';
import { PrintButton } from '@/components/print-button';
import { ResolutionDocument } from '@/components/resolution-document';

// Public single resolution — only published; no auth.
export default async function PublicResolutionPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org: slug, id } = await params;
  const supabase = await createServerSupabase();

  const { data: org } = await supabase
    .from('organizations').select('id, name').eq('slug', slug).maybeSingle();
  if (!org) notFound();

  const { data: r } = await supabase
    .from('resolutions')
    .select('signature, title, legal_basis, body, signed_at, org_id, status')
    .eq('id', id)
    .eq('status', 'published')
    .maybeSingle();
  if (!r || r.org_id !== org.id) notFound();

  const dateStr = r.signed_at ? format(new Date(r.signed_at), 'd MMMM yyyy', { locale: pl }) : '';

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <Link href={`/${slug}/rejestr`} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
            ← Rejestr uchwał
          </Link>
          <PrintButton />
        </div>
        <ResolutionDocument
          orgName={org.name}
          signature={r.signature}
          title={r.title}
          legalBasis={r.legal_basis}
          body={r.body}
          dateStr={dateStr}
          signer={null}
        />
      </div>
    </div>
  );
}
