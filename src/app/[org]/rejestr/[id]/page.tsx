import { notFound } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { PL_TZ } from '@/lib/dates';
import { pl, enGB } from 'date-fns/locale';
import { createServerSupabase } from '@/lib/supabase/server';
import { PrintButton } from '@/components/print-button';
import { ResolutionDocument } from '@/components/resolution-document';
import { PublicShell } from '@/components/ui/public-shell';
import { clsx } from 'clsx';
import { ChevronLeft } from 'lucide-react';

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

  const dateStr = r.signed_at ? format(new Date(r.signed_at), 'd MMMM yyyy', { locale: lang === 'en' ? enGB : pl, in: PL_TZ }) : '';
  const hasEn = !!r.title_en || !!r.body_en;
  const title = lang === 'en' ? (r.title_en || r.title) : r.title;
  const body = lang === 'en' ? (r.body_en || r.body) : r.body;
  const legalBasis = lang === 'en' ? (r.legal_basis_en || r.legal_basis) : r.legal_basis;
  const base = `/${slug}/rejestr/${id}`;

  return (
    <PublicShell orgName={org.name} slug={slug} width="max-w-3xl">
      <div className="mb-5 flex items-center justify-between gap-3 print:hidden">
        <Link href={`/${slug}/rejestr`}
          className="press -ml-2 inline-flex h-9 items-center gap-0.5 rounded-xl pl-1 pr-3 text-[15px] text-indigo-300 hover:bg-zinc-800/40">
          <ChevronLeft className="h-5 w-5" /> Rejestr
        </Link>
        <div className="flex items-center gap-2">
          {hasEn && (
            <div role="radiogroup" aria-label="Język" className="grid grid-cols-2 rounded-xl bg-zinc-900 p-1 ring-1 ring-zinc-800">
              {(['pl', 'en'] as const).map((l) => (
                <Link key={l} href={l === 'pl' ? base : `${base}?lang=en`} role="radio" aria-checked={lang === l}
                  className={clsx('flex h-8 w-11 items-center justify-center rounded-lg text-[13px] font-semibold uppercase',
                    lang === l ? 'bg-zinc-700/80 text-zinc-50' : 'text-zinc-500 hover:text-zinc-300')}>
                  {l}
                </Link>
              ))}
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
    </PublicShell>
  );
}
