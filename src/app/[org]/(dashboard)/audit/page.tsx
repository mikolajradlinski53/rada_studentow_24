import { createServerSupabase } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { getOrgContext } from '@/lib/org';

const ACTION_LABELS: Record<string, string> = {
  'session.opened': 'Otwarto posiedzenie',
  'session.closed': 'Zamknięto posiedzenie',
  'vote.opened': 'Otwarto głosowanie',
  'vote.closed': 'Zamknięto głosowanie',
  'ballot.cast': 'Oddano głos',
  'attendance.checked_in': 'Potwierdzono obecność',
  'resolution.signed': 'Podpisano uchwałę',
  'resolution.published': 'Opublikowano uchwałę',
};

export default async function AuditPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!ctx) notFound();

  const supabase = await createServerSupabase();

  const { data: logs } = await supabase
    .from('audit_log')
    .select('*, actor:profiles(full_name)')
    .eq('org_id', ctx.org.id)
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-zinc-100">Logi audytowe</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Historia działań w systemie — Komisja Rewizyjna
        </p>
      </div>

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
                {(log as any).actor?.full_name ?? '—'}
              </span>
              <span className="text-zinc-300">
                {ACTION_LABELS[log.action] ?? log.action}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
