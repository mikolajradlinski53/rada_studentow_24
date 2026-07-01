import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase/server';

// Public registry — no auth. RLS exposes only published resolutions + org info.
export default async function PublicRegistryPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const supabase = await createServerSupabase();

  const { data: org } = await supabase
    .from('organizations').select('id, name').eq('slug', slug).maybeSingle();
  if (!org) notFound();

  const { data: resolutions } = await supabase
    .from('resolutions')
    .select('id, signature, title, signed_at')
    .eq('org_id', org.id)
    .eq('status', 'published')
    .order('number', { ascending: false });

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-2xl px-4 py-12">
        <header className="mb-8">
          <div className="text-xs uppercase tracking-widest text-zinc-500">{org.name}</div>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-100">Rejestr uchwał</h1>
          <p className="mt-1 text-sm text-zinc-500">Uchwały opublikowane — dostęp publiczny</p>
        </header>

        {!resolutions?.length ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-12 text-center text-sm text-zinc-500">
            Brak opublikowanych uchwał.
          </div>
        ) : (
          <div className="space-y-1.5">
            {resolutions.map((r) => (
              <Link key={r.id} href={`/${slug}/rejestr/${r.id}`}
                className="block rounded-lg border border-zinc-800 bg-zinc-900/50 px-5 py-3 transition-colors hover:border-zinc-700 hover:bg-zinc-900">
                <div className="text-sm font-medium text-zinc-200">{r.signature}</div>
                <div className="mt-0.5 text-xs text-zinc-500">{r.title}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
