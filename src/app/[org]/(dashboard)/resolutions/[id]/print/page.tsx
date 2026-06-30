import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { getOrgContext } from '@/lib/org';
import { createServerSupabase } from '@/lib/supabase/server';
import { PrintButton } from './print-button';

export default async function ResolutionPrintPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);
  if (!ctx) notFound();

  const supabase = await createServerSupabase();
  const { data: r } = await supabase
    .from('resolutions')
    .select('*, session:sessions(title, organ_id, scheduled_at, organ:organs(name, short_name), term:terms(label)), signer:profiles!resolutions_signed_by_fkey(full_name)')
    .eq('id', id)
    .maybeSingle();

  const session = (r as { session?: { organ_id?: string } } | null)?.session as
    | { organ_id?: string; title?: string; scheduled_at?: string; organ?: { name?: string }; term?: { label?: string } }
    | undefined;
  if (!r || session?.organ_id !== ctx.organId) notFound();

  const signer = (r as { signer?: { full_name?: string } }).signer?.full_name ?? null;
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

      {/* Document */}
      <article className="mx-auto max-w-3xl rounded-lg bg-white p-10 text-zinc-900 shadow-xl print:rounded-none print:p-0 print:shadow-none">
        <header className="text-center">
          <div className="text-sm uppercase tracking-wide text-zinc-600">{session?.organ?.name}</div>
          <h1 className="mt-3 text-xl font-bold">{r.signature}</h1>
          {dateStr && <div className="mt-1 text-sm text-zinc-600">z dnia {dateStr}</div>}
          {r.title && <h2 className="mt-4 text-base font-semibold">w sprawie {r.title}</h2>}
        </header>

        {r.legal_basis && (
          <p className="mt-6 text-sm italic text-zinc-700">{r.legal_basis}</p>
        )}

        <div className="mt-6 whitespace-pre-wrap text-[15px] leading-relaxed">{r.body}</div>

        <div className="mt-16 text-right">
          <div className="inline-block text-center">
            <div className="h-px w-56 bg-zinc-400" />
            <div className="mt-1 text-sm text-zinc-700">
              {signer ?? 'Przewodniczący'}
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}
