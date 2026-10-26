import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { clsx } from 'clsx';
import { Building2, ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react';
import { isSuperadmin } from '@/lib/org';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { NewOrgForm } from './new-org-form';

export const metadata = { title: 'Superadmin · RadaStudentów24' };

export default async function SuperadminPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (!(await isSuperadmin())) notFound();

  // Counts across tenants need the service role (members of other orgs aren't visible via RLS).
  const admin = createAdminSupabase();
  const { data: orgs } = await supabase.from('organizations').select('id, name, slug, created_at').order('name');
  const stats = new Map<string, { members: number; sessions: number }>();
  if (admin && orgs?.length) {
    const { data: organs } = await admin.from('organs').select('id, org_id, terms(id, is_active, mandates(id, is_active)), sessions(id)');
    for (const o of (organs as unknown as { org_id: string; terms: { is_active: boolean; mandates: { is_active: boolean }[] }[]; sessions: { id: string }[] }[]) ?? []) {
      const cur = stats.get(o.org_id) ?? { members: 0, sessions: 0 };
      for (const t of o.terms ?? []) if (t.is_active) cur.members += (t.mandates ?? []).filter((m) => m.is_active).length;
      cur.sessions += (o.sessions ?? []).length;
      stats.set(o.org_id, cur);
    }
  }

  return (
    <div className="pt-safe pb-safe min-h-dvh bg-zinc-950 text-zinc-100">
      <main className="mx-auto max-w-2xl px-4 py-6">
        <Link href="/" className="press -ml-2 mb-3 inline-flex h-9 items-center gap-0.5 rounded-xl pl-1 pr-3 text-[15px] text-indigo-300 hover:bg-zinc-800/40">
          <ChevronLeft className="h-5 w-5" /> Aplikacja
        </Link>
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="h-6 w-6 text-indigo-300" />
          <h1 className="text-[24px] font-semibold tracking-tight text-zinc-50">Superadmin platformy</h1>
        </div>
        <p className="mt-1 text-[15px] text-zinc-500">Wszystkie organizacje w RadaStudentów24. Masz w nich uprawnienia administratora.</p>

        <section className="mt-8">
          <h2 className="mb-2.5 text-[13px] font-medium uppercase tracking-wide text-zinc-500">Organizacje</h2>
          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50">
            {(orgs ?? []).map((o, i) => {
              const s = stats.get(o.id);
              return (
                <Link key={o.id} href={`/${o.slug}/sessions`}
                  className={clsx('press flex items-center gap-3 px-4 py-3.5 hover:bg-zinc-800/30', i > 0 && 'border-t border-zinc-800/80')}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-900/40 text-indigo-300">
                    <Building2 className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-medium text-zinc-100">{o.name}</div>
                    <div className="truncate text-[13px] text-zinc-500">
                      /{o.slug}{s ? ` · ${s.members} członków · ${s.sessions} posiedzeń` : ''}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600" aria-hidden />
                </Link>
              );
            })}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="mb-2.5 text-[13px] font-medium uppercase tracking-wide text-zinc-500">Nowa organizacja</h2>
          <NewOrgForm />
        </section>
      </main>
    </div>
  );
}
