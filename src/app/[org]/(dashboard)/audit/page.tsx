import { createServerSupabase } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { format } from 'date-fns';
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
  if (from) query = query.gte('created_at', `${from}T00:00:00`);
  if (to) query = query.lte('created_at', `${to}T23:59:59`);

  const { data: logs } = await query.order('created_at', { ascending: false }).limit(200);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Logi audytowe</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Historia działań w systemie — Komisja Rewizyjna
          </p>
        </div>
        <ExportCsvButton orgId={ctx.org.id} action={action} from={from} to={to} actionLabels={ACTION_LABELS} />
      </div>

      <AuditFilters actions={Object.entries(ACTION_LABELS)} />

      {!logs?.length ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-12 text-center text-sm text-zinc-500">
          Brak logów.
        </div>
      ) : (
        <div className="space-y-0.5">
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex items-center gap-4 rounded px-4 py-2.5 text-sm hover:bg-zinc-900/50"
            >
              <span className="shrink-0 text-xs text-zinc-600 w-36 tabular-nums">
                {format(new Date(log.created_at), 'dd.MM.yyyy HH:mm:ss', { locale: pl })}
              </span>
              <span className="shrink-0 text-zinc-400 w-40 truncate">
                {(log as { actor?: { full_name?: string } | null }).actor?.full_name ?? '—'}
              </span>
              <span className="text-zinc-300">
                {ACTION_LABELS[log.action] ?? log.action}
              </span>
              {(() => {
                const m = (log.metadata ?? {}) as { signature?: string; vote_type?: string };
                const hint = m.signature ?? (m.vote_type ? (m.vote_type === 'secret' ? 'tajne' : 'jawne') : null);
                return hint ? <span className="text-xs text-zinc-600">· {hint}</span> : null;
              })()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
