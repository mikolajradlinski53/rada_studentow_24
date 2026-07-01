import { notFound } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { createServerSupabase } from '@/lib/supabase/server';
import { YoutubeEmbed } from '@/components/session/transmission';
import { youtubeId } from '@/lib/youtube';

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
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <header className="mb-6">
          {org?.name && <div className="text-xs uppercase tracking-widest text-zinc-500">{org.name}</div>}
          <h1 className="mt-1 text-2xl font-semibold text-zinc-100">{session.title}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {format(new Date(session.scheduled_at), "EEEE, d MMMM yyyy · HH:mm", { locale: pl })} · transmisja na żywo
          </p>
        </header>

        <YoutubeEmbed url={session.stream_url!} />

        <div className="mt-6 text-sm">
          <Link href={`/${slug}/rejestr`} className="text-indigo-400 hover:text-indigo-300 transition-colors">
            Rejestr uchwał →
          </Link>
        </div>
      </div>
    </div>
  );
}
