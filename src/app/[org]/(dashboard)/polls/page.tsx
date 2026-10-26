import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Vote } from 'lucide-react';
import { getOrgContext } from '@/lib/org';
import { createServerSupabase } from '@/lib/supabase/server';
import { PollCard, type Poll } from '@/components/polls/poll-card';
import { NewPollButton } from '@/components/polls/new-poll';

/** Open = not closed by hand and before its deadline (evaluated at request time). */
function splitPolls(polls: Poll[]) {
  const now = Date.now();
  const isOpen = (p: Poll) => !p.closed_at && (!p.closes_at || new Date(p.closes_at).getTime() > now);
  return { open: polls.filter(isOpen), closed: polls.filter((p) => !isOpen(p)) };
}

export default async function PollsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!ctx) notFound();

  const supabase = await createServerSupabase();
  const [{ data }, { count: voters }] = await Promise.all([
    supabase.from('polls').select('*, options:poll_options(id, label, position)')
      .eq('term_id', ctx.termId).order('created_at', { ascending: false }),
    supabase.from('mandates').select('id', { count: 'exact', head: true })
      .eq('term_id', ctx.termId).eq('is_active', true).not('role', 'in', '(admin,auditor,election_committee)'),
  ]);
  const { open, closed } = splitPolls((data as Poll[]) ?? []);
  const polls = [...open, ...closed];
  const canManage = ctx.role === 'admin' || ctx.role === 'chair';

  return (
    <div>
      <Link href={`/${org}/sessions`}
        className="press -ml-2 mb-3 inline-flex h-9 items-center gap-0.5 rounded-xl pl-1 pr-3 text-[15px] text-indigo-300 hover:bg-zinc-800/40">
        <ChevronLeft className="h-5 w-5" /> Posiedzenia
      </Link>
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-zinc-50">Ankiety</h1>
          <p className="mt-1 text-sm text-zinc-500">Szybkie pytania do składu poza posiedzeniem</p>
        </div>
        {canManage && <NewPollButton termId={ctx.termId} />}
      </div>

      {!polls.length ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 px-6 py-12 text-center">
          <Vote className="mx-auto h-8 w-8 text-zinc-600" />
          <p className="mt-3 text-[15px] text-zinc-300">Brak ankiet</p>
          <p className="mt-1 text-[13px] text-zinc-500">
            {canManage ? 'Zapytaj radnych np. o termin posiedzenia albo opinię w sprawie.' : 'Gdy przewodniczący zada pytanie, pojawi się tutaj.'}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {open.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-[13px] font-medium uppercase tracking-wide text-zinc-500">Trwają</h2>
              {open.map((p) => <PollCard key={p.id} poll={p} myMandateId={ctx.mandateId} canManage={canManage} voters={voters ?? 0} />)}
            </section>
          )}
          {closed.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-[13px] font-medium uppercase tracking-wide text-zinc-500">Zakończone</h2>
              {closed.map((p) => <PollCard key={p.id} poll={p} myMandateId={ctx.mandateId} canManage={canManage} voters={voters ?? 0} />)}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
