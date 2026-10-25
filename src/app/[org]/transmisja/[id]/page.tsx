import { notFound } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { PL_TZ } from '@/lib/dates';
import { pl } from 'date-fns/locale';
import { createServerSupabase } from '@/lib/supabase/server';
import { YoutubeEmbed } from '@/components/session/transmission';
import { youtubeId } from '@/lib/youtube';
import { PublicShell } from '@/components/ui/public-shell';
import { FileText, Radio } from 'lucide-react';

// Public transmission — no auth. RLS exposes sessions that published a stream_url.
export default async function TransmissionPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org: slug, id } = await params;
  const supabase = await createServerSupabase();

  const { data: org } = await supabase.from('organizations').select('name').eq('slug', slug).maybeSingle();

  const { data: session } = await supabase
    .from('sessions')
    .select('title, scheduled_at, stream_url')
    .eq('id', id)
    .not('stream_url', 'is', null)
    .maybeSingle();
  if (!session || !youtubeId(session.stream_url)) notFound();

  return (
    <PublicShell orgName={org?.name} slug={slug} width="max-w-4xl">
      <div className="mb-5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-900/40 px-2.5 py-0.5 text-[12px] font-semibold text-red-300">
          <Radio className="h-3.5 w-3.5" /> Transmisja
        </span>
        <h1 className="mt-3 text-[24px] font-semibold leading-tight tracking-tight text-zinc-50">{session.title}</h1>
        <p className="mt-1 text-[15px] text-zinc-500">
          {format(new Date(session.scheduled_at), "EEEE, d MMMM yyyy, 'godz.' HH:mm", { locale: pl, in: PL_TZ })}
        </p>
      </div>

      <YoutubeEmbed url={session.stream_url!} />

      <Link href={`/${slug}/rejestr`}
        className="press mt-6 inline-flex h-11 items-center gap-2 rounded-xl border border-zinc-700 px-4 text-[15px] font-medium text-zinc-200 hover:border-zinc-500">
        <FileText className="h-4 w-4" /> Rejestr uchwał
      </Link>
    </PublicShell>
  );
}
