import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getOrgContext } from '@/lib/org';
import { createServerSupabase } from '@/lib/supabase/server';
import { DocumentPaper } from '@/components/document-paper';
import { MarkdownDoc } from '@/components/markdown-doc';
import { PrintButton } from '@/components/print-button';

const STATUS_PL: Record<string, string> = {
  draft: 'Szkic', review: 'W recenzji', approved: 'Zatwierdzony', published: 'Opublikowany',
};

/** Printable protocol (browser "Save as PDF"), same paper style as resolutions. */
export default async function ProtocolPrintPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);
  if (!ctx) notFound();

  const supabase = await createServerSupabase();
  const { data: session } = await supabase
    .from('sessions').select('title').eq('id', id).eq('organ_id', ctx.organId).maybeSingle();
  if (!session) notFound();
  const { data: protocol } = await supabase
    .from('protocols').select('body, status').eq('session_id', id).maybeSingle();
  if (!protocol?.body) notFound();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href={`/${org}/sessions/${id}/protocol`}
          className="press -ml-2 inline-flex h-9 items-center gap-0.5 rounded-xl pl-1 pr-3 text-[15px] text-indigo-300 hover:bg-zinc-800/40">
          <ChevronLeft className="h-5 w-5" /> Protokół
        </Link>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-[12px] font-medium text-zinc-400">
            {STATUS_PL[protocol.status] ?? protocol.status}
          </span>
          <PrintButton />
        </div>
      </div>
      <DocumentPaper footer={`${ctx.org.name} · dokument wygenerowany w systemie RadaStudentów24`}>
        <MarkdownDoc source={protocol.body} />
        <div className="mt-20 flex justify-between gap-8 break-inside-avoid text-center text-[13px] text-zinc-600">
          <div className="w-56"><div className="h-px bg-zinc-400" /><div className="mt-2">Protokolant</div></div>
          <div className="w-56"><div className="h-px bg-zinc-400" /><div className="mt-2">Przewodniczący</div></div>
        </div>
      </DocumentPaper>
    </div>
  );
}
