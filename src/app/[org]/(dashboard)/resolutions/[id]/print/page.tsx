import { notFound } from 'next/navigation';
import Link from 'next/link';
import { clsx } from 'clsx';
import { ChevronLeft } from 'lucide-react';
import { format } from 'date-fns';
import { PL_TZ } from '@/lib/dates';
import { pl, enGB } from 'date-fns/locale';
import { getOrgContext } from '@/lib/org';
import { createServerSupabase } from '@/lib/supabase/server';
import { PrintButton } from '@/components/print-button';
import { ResolutionDocument } from '@/components/resolution-document';

export default async function ResolutionPrintPage({
  params, searchParams,
}: {
  params: Promise<{ org: string; id: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { org, id } = await params;
  const lang = (await searchParams).lang === 'en' ? 'en' : 'pl';
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

  const dateSrc = r.signed_at ?? session?.scheduled_at ?? null;
  const dateStr = dateSrc ? format(new Date(dateSrc), 'd MMMM yyyy', { locale: lang === 'en' ? enGB : pl, in: PL_TZ }) : '';

  // Fall back to Polish fields when an EN version is missing.
  const title = lang === 'en' ? (r.title_en || r.title) : r.title;
  const body = lang === 'en' ? (r.body_en || r.body) : r.body;
  const legalBasis = lang === 'en' ? (r.legal_basis_en || r.legal_basis) : r.legal_basis;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href={`/${org}/resolutions/${id}`}
          className="press -ml-2 inline-flex h-9 items-center gap-0.5 rounded-xl pl-1 pr-3 text-[15px] text-indigo-300 hover:bg-zinc-800/40">
          <ChevronLeft className="h-5 w-5" /> Uchwała
        </Link>
        <div className="flex items-center gap-2">
        <LangSwitch lang={lang} base={`/${org}/resolutions/${id}/print`} hasEn={!!r.title_en || !!r.body_en} />
        <PrintButton />
        </div>
      </div>
      <ResolutionDocument
        orgName={session?.organ?.name ?? ctx.org.name}
        signature={r.signature}
        title={title}
        legalBasis={legalBasis}
        body={body}
        dateStr={dateStr}
        signer={(r as { signer?: { full_name?: string } }).signer?.full_name ?? null}
        lang={lang}
      />
    </div>
  );
}

function LangSwitch({ lang, base, hasEn }: { lang: 'pl' | 'en'; base: string; hasEn: boolean }) {
  if (!hasEn) return <div />;
  return (
    <div role="radiogroup" aria-label="Język" className="grid grid-cols-2 rounded-xl bg-zinc-900 p-1 ring-1 ring-zinc-800">
      {(['pl', 'en'] as const).map((l) => (
        <Link key={l} href={l === 'pl' ? base : `${base}?lang=en`} role="radio" aria-checked={lang === l}
          className={clsx('flex h-8 w-11 items-center justify-center rounded-lg text-[13px] font-semibold uppercase',
            lang === l ? 'bg-zinc-700/80 text-zinc-50' : 'text-zinc-500 hover:text-zinc-300')}>
          {l}
        </Link>
      ))}
    </div>
  );
}
