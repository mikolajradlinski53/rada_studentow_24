import { notFound } from 'next/navigation';
import Link from 'next/link';
import { clsx } from 'clsx';
import { ChevronRight, FileText } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import { PublicShell } from '@/components/ui/public-shell';
import { plLong } from '@/lib/dates';
import { SearchBox, searchPattern } from '@/components/ui/search-box';

// Public registry - no auth. RLS exposes only published resolutions + org info.
export default async function PublicRegistryPage({
  params, searchParams,
}: { params: Promise<{ org: string }>; searchParams: Promise<{ q?: string }> }) {
  const { org: slug } = await params;
  const q = (await searchParams).q ?? '';
  const pattern = searchPattern(q);
  const supabase = await createServerSupabase();

  const { data: org } = await supabase
    .from('organizations').select('id, name').eq('slug', slug).maybeSingle();
  if (!org) notFound();

  let query = supabase
    .from('resolutions')
    .select('id, signature, title, signed_at')
    .eq('org_id', org.id)
    .eq('status', 'published');
  if (pattern) query = query.or(`signature.ilike.${pattern},title.ilike.${pattern},body.ilike.${pattern}`);
  const { data: resolutions } = await query.order('number', { ascending: false });

  return (
    <PublicShell orgName={org.name} slug={slug}>
      <h1 className="text-[26px] font-semibold tracking-tight text-zinc-50">Rejestr uchwał</h1>
      <p className="mt-1 text-[15px] text-zinc-500">Uchwały opublikowane przez organ. Dostęp publiczny.</p>

      <div className="mt-6"><SearchBox action={`/${slug}/rejestr`} q={q} placeholder="Szukaj uchwały" /></div>

      <div className="mt-4">
        {!resolutions?.length ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 px-6 py-12 text-center">
            <FileText className="mx-auto h-8 w-8 text-zinc-600" />
            <p className="mt-3 text-[15px] text-zinc-300">{q ? `Nic nie znaleziono dla „${q}”` : 'Brak opublikowanych uchwał'}</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50">
            {resolutions.map((r, i) => (
              <Link key={r.id} href={`/${slug}/rejestr/${r.id}`}
                className={clsx('press flex items-center gap-3 px-4 py-3.5 hover:bg-zinc-800/30', i > 0 && 'border-t border-zinc-800/80')}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-900/40 text-indigo-300">
                  <FileText className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-medium text-zinc-100">{r.signature}</div>
                  <div className="line-clamp-2 text-[13px] leading-snug text-zinc-500">{r.title}</div>
                  {r.signed_at && (
                    <div className="mt-0.5 text-[12px] text-zinc-600">{plLong(new Date(r.signed_at)).split(' · ')[0]}</div>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600" aria-hidden />
              </Link>
            ))}
          </div>
        )}
      </div>
    </PublicShell>
  );
}
