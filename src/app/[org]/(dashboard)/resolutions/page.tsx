import { createServerSupabase } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { clsx } from 'clsx';
import { getOrgContext } from '@/lib/org';
import type { ResolutionStatus } from '@/types/database';

const STATUS_LABELS: Record<ResolutionStatus, { label: string; color: string }> = {
  draft: { label: 'Szkic', color: 'bg-zinc-700 text-zinc-300' },
  adopted: { label: 'Uchwalona', color: 'bg-emerald-900/50 text-emerald-300' },
  published: { label: 'Opublikowana', color: 'bg-blue-900/50 text-blue-300' },
  revoked: { label: 'Uchylona', color: 'bg-red-900/50 text-red-300' },
};

export default async function ResolutionsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!ctx) notFound();

  const supabase = await createServerSupabase();

  // Scope to this org's active term (isolation).
  const { data: resolutions } = await supabase
    .from('resolutions')
    .select('*, session:sessions(title)')
    .eq('term_id', ctx.termId)
    .order('number', { ascending: false });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-zinc-100">Rejestr uchwał</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Wszystkie uchwały organu
        </p>
      </div>

      {!resolutions?.length ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-12 text-center text-sm text-zinc-500">
          Brak uchwał w rejestrze.
        </div>
      ) : (
        <div className="space-y-1.5">
          {resolutions.map((res) => {
            const status = STATUS_LABELS[res.status as ResolutionStatus];
            return (
              <div
                key={res.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-5 py-3 hover:border-zinc-700 transition-colors"
              >
                <Link href={`/${org}/resolutions/${res.id}`} className="min-w-0 flex-1 group">
                  <div className="truncate text-sm font-medium text-zinc-200 group-hover:text-zinc-100">
                    {res.signature}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-zinc-500">{res.title}</div>
                </Link>
                <div className="flex shrink-0 items-center gap-3">
                  <Link href={`/${org}/resolutions/${res.id}/print`} target="_blank" className="text-xs text-indigo-400 hover:text-indigo-300">
                    PDF
                  </Link>
                  <span className={clsx('rounded-full px-2.5 py-0.5 text-xs font-medium', status.color)}>
                    {status.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
