import Link from 'next/link';
import { notFound } from 'next/navigation';
import { clsx } from 'clsx';
import { BarChart3, ChevronLeft } from 'lucide-react';
import { getOrgContext } from '@/lib/org';
import { createServerSupabase } from '@/lib/supabase/server';

type Row = {
  mandate_id: string; full_name: string; role: string;
  sittings_total: number; sittings_present: number; votes_total: number; votes_cast: number;
};

// Seats of the organ: Komisja Rewizyjna, SKW, protokolant and system admins aren't counted.
const NON_SEAT = ['auditor', 'election_committee', 'secretary', 'admin'];

function pct(a: number, b: number) {
  return b > 0 ? Math.round((a / b) * 100) : null;
}

export default async function StatsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!ctx) notFound();

  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc('term_member_stats', { p_term_id: ctx.termId });
  const all = ((data as Row[] | null) ?? []).sort((a, b) => a.full_name.localeCompare(b.full_name, 'pl'));
  const rows = all.filter((r) => !NON_SEAT.includes(r.role));

  const sittings = all[0]?.sittings_total ?? 0;
  const votes = all[0]?.votes_total ?? 0;
  const avgAttendance = rows.length && sittings
    ? Math.round(rows.reduce((s, r) => s + r.sittings_present / sittings, 0) / rows.length * 100)
    : null;

  return (
    <div>
      <Link href={`/${org}/sessions`}
        className="press -ml-2 mb-3 inline-flex h-9 items-center gap-0.5 rounded-xl pl-1 pr-3 text-[15px] text-indigo-300 hover:bg-zinc-800/40">
        <ChevronLeft className="h-5 w-5" /> Posiedzenia
      </Link>
      <h1 className="text-[22px] font-semibold tracking-tight text-zinc-50">Frekwencja</h1>
      <p className="mt-1 text-sm text-zinc-500">{ctx.organShortName} w bieżącej kadencji</p>

      <div className="mt-6 grid grid-cols-3 gap-2.5">
        <Stat label="Posiedzenia" value={sittings} />
        <Stat label="Głosowania" value={votes} />
        <Stat label="Śr. obecność" value={avgAttendance === null ? '-' : `${avgAttendance}%`} />
      </div>

      {!sittings ? (
        <div className="mt-8 rounded-2xl border border-dashed border-zinc-800 px-6 py-12 text-center">
          <BarChart3 className="mx-auto h-8 w-8 text-zinc-600" />
          <p className="mt-3 text-[15px] text-zinc-300">Jeszcze nie ma danych</p>
          <p className="mt-1 text-[13px] text-zinc-500">Statystyki pojawią się po pierwszym przeprowadzonym posiedzeniu.</p>
        </div>
      ) : (
        <section className="mt-8">
          <h2 className="mb-2.5 text-[13px] font-medium uppercase tracking-wide text-zinc-500">Członkowie</h2>
          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50">
            {rows.map((r, i) => {
              const att = pct(r.sittings_present, r.sittings_total);
              const vot = pct(r.votes_cast, r.votes_total);
              return (
                <div key={r.mandate_id} className={clsx('px-4 py-3.5', i > 0 && 'border-t border-zinc-800/80')}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-[15px] text-zinc-100">{r.full_name}</span>
                    <span className={clsx('shrink-0 font-mono text-[15px] font-semibold tabular-nums',
                      att === null ? 'text-zinc-500' : att >= 75 ? 'text-emerald-400' : att >= 50 ? 'text-amber-400' : 'text-red-400')}>
                      {att === null ? '-' : `${att}%`}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-800" aria-hidden>
                    <div className={clsx('h-full rounded-full', att !== null && att >= 75 ? 'bg-emerald-500' : att !== null && att >= 50 ? 'bg-amber-500' : 'bg-red-500')}
                      style={{ width: `${att ?? 0}%` }} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 text-[12px] tabular-nums text-zinc-500">
                    <span>Obecność {r.sittings_present}/{r.sittings_total}</span>
                    <span>Głosy {r.votes_cast}/{r.votes_total}{vot !== null ? ` (${vot}%)` : ''}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 px-1 text-[12px] leading-relaxed text-zinc-500">
            Obecność liczona z list obecności (także spóźnienia i wcześniejsze wyjścia). Udział w głosowaniach
            obejmuje głosowania tajne i wybory, bez ujawniania, jak kto głosował.
          </p>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 px-3 py-3 text-center">
      <div className="font-mono text-[22px] font-semibold tabular-nums text-zinc-50">{value}</div>
      <div className="mt-0.5 text-[12px] text-zinc-500">{label}</div>
    </div>
  );
}
