import { createServerSupabase } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import { PL_TZ, plDayBoundsISO } from '@/lib/dates';
import { clsx } from 'clsx';
import { ShieldCheck } from 'lucide-react';
import { pl } from 'date-fns/locale';
import { getOrgContext } from '@/lib/org';
import { AuditFilters } from './audit-filters';
import { ExportCsvButton } from './export-csv-button';

const ACTION_LABELS: Record<string, string> = {
  'session.opened': 'Otwarto posiedzenie',
  'session.closed': 'Zamknięto posiedzenie',
  'vote.opened': 'Otwarto głosowanie',
  'vote.closed': 'Zamknięto głosowanie',
  'ballot.cast': 'Oddano głos',
  'attendance.checked_in': 'Potwierdzono obecność',
  'protocol.generated': 'Wygenerowano protokół',
  'resolution.created': 'Utworzono uchwałę',
  'resolution.signed': 'Podpisano uchwałę',
  'resolution.published': 'Opublikowano uchwałę',
};

export default async function AuditPage({
  params, searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ action?: string; from?: string; to?: string }>;
}) {
  const { org } = await params;
  const { action, from, to } = await searchParams;
  const ctx = await getOrgContext(org);
  if (!ctx) notFound();

  const supabase = await createServerSupabase();

  let query = supabase
    .from('audit_log')
    .select('*, actor:profiles(full_name)')
    .eq('org_id', ctx.org.id);

  if (action) query = query.eq('action', action);
  if (from) query = query.gte('created_at', plDayBoundsISO(from, 'start'));
  if (to) query = query.lte('created_at', plDayBoundsISO(to, 'end'));

  const { data: logs } = await query.order('created_at', { ascending: false }).limit(200);

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight text-zinc-50">Logi</h1>
          <p className="mt-1 text-sm text-zinc-500">Historia działań w systemie (wgląd Komisji Rewizyjnej)</p>
        </div>
        <ExportCsvButton orgId={ctx.org.id} action={action} from={from} to={to} actionLabels={ACTION_LABELS} />
      </div>

      <AuditFilters actions={Object.entries(ACTION_LABELS)} />

      {!logs?.length ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 px-6 py-12 text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-zinc-600" />
          <p className="mt-3 text-[15px] text-zinc-300">Brak wpisów</p>
          <p className="mt-1 text-[13px] text-zinc-500">{action || from || to ? 'Zmień filtry, aby zobaczyć więcej.' : 'Działania pojawią się tutaj automatycznie.'}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50">
          {logs.map((log, i) => {
            const m = (log.metadata ?? {}) as { signature?: string; vote_type?: string; email?: string };
            const hint = m.signature ?? m.email ?? (m.vote_type ? (m.vote_type === 'secret' ? 'tajne' : 'jawne') : null);
            const actor = (log as { actor?: { full_name?: string } | null }).actor?.full_name ?? 'System';
            return (
              <div key={log.id} className={clsx('px-4 py-3', i > 0 && 'border-t border-zinc-800/80')}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-[15px] text-zinc-100">
                    {ACTION_LABELS[log.action] ?? log.action}
                    {hint && <span className="text-zinc-500"> · {hint}</span>}
                  </span>
                  <span className="shrink-0 font-mono text-[12px] tabular-nums text-zinc-500">
                    {format(new Date(log.created_at), 'HH:mm', { locale: pl, in: PL_TZ })}
                  </span>
                </div>
                <div className="mt-0.5 text-[13px] text-zinc-500">
                  {actor} · {format(new Date(log.created_at), 'd MMM yyyy', { locale: pl, in: PL_TZ })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {logs?.length === 200 && <p className="mt-3 px-1 text-[13px] text-zinc-500">Pokazano 200 najnowszych. Zawęź filtry lub pobierz CSV.</p>}
    </div>
  );
}
