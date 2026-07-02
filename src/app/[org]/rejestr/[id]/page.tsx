import { notFound } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { pl, enGB } from 'date-fns/locale';
import { createServerSupabase } from '@/lib/supabase/server';
import { PrintButton } from '@/components/print-button';
import { ResolutionDocument } from '@/components/resolution-document';

// Public single resolution — only published; no auth.
export default async function PublicResolutionPage({
  params, searchParams,
}: {
  params: Promise<{ org: string; id: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { org: slug, id } = await params;
  const lang = (await searchParams).lang === 'en' ? 'en' : 'pl';
  const supabase = await createServerSupabase();

  const { data: org } = await supabase
    .from('organizations').select('id, name').eq('slug', slug).maybeSingle();
  if (!org) notFound();

  const { data: r } = await supabase
    .from('resolutions')
    .select('signature, title, legal_basis, body, title_en, legal_basis_en, body_en, signed_at, org_id, status')
    .eq('id', id)
    .eq('status', 'published')
    .maybeSingle();
  if (!r || r.org_id !== org.id) notFound();

  const dateStr = r.signed_at ? format(new Date(r.signed_at), 'd MMMM yyyy', { locale: lang === 'en' ? enGB : pl }) : '';
  const hasEn = !!r.title_en || !!r.body_en;
  const title = lang === 'en' ? (r.title_en || r.title) : r.title;
  const body = lang === 'en' ? (r.body_en || r.body) : r.body;
  const legalBasis = lang === 'en' ? (r.legal_basis_en || r.legal_basis) : r.legal_basis;
  const base = `/${slug}/rejestr/${id}`;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <Link href={`/${slug}/rejestr`} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
            ← Rejestr uchwał
          </Link>
          <div className="flex items-center gap-3">
            {hasEn && (
              <div className="flex items-center gap-1 text-xs">
                <Link href={base} className={lang === 'pl' ? 'font-semibold text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}>PL</Link>
                <span className="text-zinc-700">|</span>
                <Link href={`${base}?lang=en`} className={lang === 'en' ? 'font-semibold text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}>EN</Link>
              </div>
            )}
            <PrintButton />
          </div>
        </div>
        <ResolutionDocument
          orgName={org.name}
          signature={r.signature}
          title={title}
          legalBasis={legalBasis}
          body={body}
          dateStr={dateStr}
          signer={null}
          lang={lang}
        />
      </div>
    </div>
  );
}
