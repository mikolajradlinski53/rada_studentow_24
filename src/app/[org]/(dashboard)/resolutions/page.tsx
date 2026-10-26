import { createServerSupabase } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { clsx } from 'clsx';
import { ChevronRight, ExternalLink, FileDown, FileText } from 'lucide-react';
import { getOrgContext } from '@/lib/org';
import type { ResolutionStatus } from '@/types/database';
import { SearchBox, searchPattern } from '@/components/ui/search-box';

const STATUS: Record<ResolutionStatus, { label: string; tone: string }> = {
  draft: { label: 'Szkic', tone: 'bg-zinc-800 text-zinc-400' },
  adopted: { label: 'Uchwalona', tone: 'bg-emerald-900/50 text-emerald-300' },
  published: { label: 'Opublikowana', tone: 'bg-blue-900/40 text-blue-300' },
  revoked: { label: 'Uchylona', tone: 'bg-red-900/40 text-red-300' },
};

export default async function ResolutionsPage({
  params, searchParams,
}: { params: Promise<{ org: string }>; searchParams: Promise<{ q?: string }> }) {
  const { org } = await params;
  const q = (await searchParams).q ?? '';
  const pattern = searchPattern(q);
  const ctx = await getOrgContext(org);
  if (!ctx) notFound();

  const supabase = await createServerSupabase();

  // Scope to this org's active term (isolation).
  let query = supabase
    .from('resolutions')
    .select('id, signature, title, status, session:sessions(title)')
    .eq('term_id', ctx.termId);
  if (pattern) query = query.or(`signature.ilike.${pattern},title.ilike.${pattern},body.ilike.${pattern}`);
  const { data: resolutions } = await query.order('number', { ascending: false });

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-3 md:mb-8">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight text-zinc-50">Uchwały</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {q ? `Wyniki dla „${q}”: ${resolutions?.length ?? 0}` : resolutions?.length ? `${resolutions.length} w tej kadencji` : 'Rejestr uchwał organu'}
          </p>
        </div>
        <Link href={`/${org}/rejestr`} target="_blank"
          className="press flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-zinc-700 px-3.5 text-sm font-medium text-zinc-200 hover:border-zinc-500">
          <ExternalLink className="h-4 w-4" />
          <span className="hidden sm:inline">Rejestr publiczny</span><span className="sm:hidden">Publiczny</span>
        </Link>
      </div>

      <div className="mb-4"><SearchBox action={`/${org}/resolutions`} q={q} placeholder="Szukaj w uchwałach (numer, tytuł, treść)" /></div>

      {!resolutions?.length ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 px-6 py-12 text-center">
          <FileText className="mx-auto h-8 w-8 text-zinc-600" />
          <p className="mt-3 text-[15px] text-zinc-300">{q ? 'Nic nie znaleziono' : 'Brak uchwał'}</p>
          <p className="mt-1 text-[13px] text-zinc-500">{q ? 'Spróbuj innego słowa albo numeru uchwały.' : 'Uchwała powstaje z przyjętego głosowania na posiedzeniu.'}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50">
          {resolutions.map((res, i) => {
            const status = STATUS[res.status as ResolutionStatus];
            return (
              <div key={res.id} className={clsx('flex items-center gap-1 pr-2', i > 0 && 'border-t border-zinc-800/80')}>
                <Link href={`/${org}/resolutions/${res.id}`}
                  className="press flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 hover:bg-zinc-800/30">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-900/40 text-indigo-300">
                    <FileText className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-medium text-zinc-100">{res.signature}</div>
                    <div className="truncate text-[13px] text-zinc-500">{res.title}</div>
                    <span className={clsx('mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium', status.tone)}>
                      {status.label}
                    </span>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600" aria-hidden />
                </Link>
                <Link href={`/${org}/resolutions/${res.id}/print`} target="_blank" aria-label={`PDF: ${res.signature}`}
                  className="press flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100">
                  <FileDown className="h-[18px] w-[18px]" />
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
