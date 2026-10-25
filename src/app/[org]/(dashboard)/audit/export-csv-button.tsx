'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { toCsv, downloadCsv } from '@/lib/csv';
import { plDayBoundsISO } from '@/lib/dates';
import { Download } from 'lucide-react';

type Row = { created_at: string; action: string; metadata: Record<string, unknown> | null; actor: { full_name?: string } | null };

export function ExportCsvButton({
  orgId, action, from, to, actionLabels,
}: {
  orgId: string;
  action?: string;
  from?: string;
  to?: string;
  actionLabels: Record<string, string>;
}) {
  const supabase = createClient();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    let q = supabase
      .from('audit_log')
      .select('created_at, action, metadata, actor:profiles(full_name)')
      .eq('org_id', orgId);
    if (action) q = q.eq('action', action);
    if (from) q = q.gte('created_at', plDayBoundsISO(from, 'start'));
    if (to) q = q.lte('created_at', plDayBoundsISO(to, 'end'));

    const { data } = await q.order('created_at', { ascending: false }).limit(5000);

    const rows: (string | number)[][] = [['Data', 'Osoba', 'Akcja', 'Szczegóły']];
    for (const l of (data as unknown as Row[]) ?? []) {
      const m = l.metadata ?? {};
      const hint =
        (m.signature as string) ??
        (m.vote_type ? (m.vote_type === 'secret' ? 'tajne' : 'jawne') : (m.kind as string) ?? '');
      rows.push([
        format(new Date(l.created_at), 'yyyy-MM-dd HH:mm:ss'),
        l.actor?.full_name ?? '',
        actionLabels[l.action] ?? l.action,
        hint ?? '',
      ]);
    }

    downloadCsv(`audyt-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
    setBusy(false);
  };

  return (
    <button onClick={run} disabled={busy}
      className="press flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-zinc-700 px-3.5 text-sm font-medium text-zinc-200 hover:border-zinc-500 disabled:opacity-50">
      <Download className="h-4 w-4" />
      {busy ? 'Eksport…' : 'Eksport CSV'}
    </button>
  );
}
