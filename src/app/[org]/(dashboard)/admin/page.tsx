import Link from 'next/link';
import { notFound } from 'next/navigation';
import { clsx } from 'clsx';
import { getOrgContext } from '@/lib/org';
import { createServerSupabase } from '@/lib/supabase/server';
import { AdminClient, type Member, type Pending } from './admin-client';
import { BrandingSection } from './branding-section';
import { OrganSection } from './organ-section';

const TABS = [
  { key: 'dostep', label: 'Dostęp' },
  { key: 'organizacja', label: 'Organizacja' },
] as const;

export default async function AdminPage({
  params, searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { org } = await params;
  const tab = (await searchParams).tab === 'organizacja' ? 'organizacja' : 'dostep';
  const ctx = await getOrgContext(org);
  if (!ctx || ctx.role !== 'admin') notFound();

  const supabase = await createServerSupabase();

  return (
    <div>
      {/* Section switch: access vs. organization settings (branding lived out of sight below the member list) */}
      <div role="tablist" aria-label="Administracja" className="mb-6 grid grid-cols-2 rounded-xl bg-zinc-900 p-1 ring-1 ring-zinc-800 sm:max-w-sm">
        {TABS.map((t) => (
          <Link key={t.key} href={t.key === 'dostep' ? `/${org}/admin` : `/${org}/admin?tab=${t.key}`} role="tab" aria-selected={tab === t.key}
            className={clsx('flex h-10 items-center justify-center rounded-lg text-[14px] font-medium transition-colors',
              tab === t.key ? 'bg-zinc-700/80 text-zinc-50 shadow-sm' : 'text-zinc-400 hover:text-zinc-200')}>
            {t.label}
          </Link>
        ))}
      </div>

      {tab === 'dostep' ? <AccessTab org={org} ctx={ctx} supabase={supabase} /> : <OrgTab org={org} ctx={ctx} supabase={supabase} />}
    </div>
  );
}

type Ctx = NonNullable<Awaited<ReturnType<typeof getOrgContext>>>;
type Sb = Awaited<ReturnType<typeof createServerSupabase>>;

async function AccessTab({ org, ctx, supabase }: { org: string; ctx: Ctx; supabase: Sb }) {
  const [{ data: members }, { data: pending }] = await Promise.all([
    supabase.from('mandates').select('id, role, is_active, profile:profiles(id, full_name, email)')
      .eq('term_id', ctx.termId).eq('is_active', true).order('role'),
    supabase.from('invitations').select('id, email, role, full_name')
      .eq('term_id', ctx.termId).is('accepted_at', null).order('created_at', { ascending: false }),
  ]);
  return (
    <AdminClient
      org={org}
      orgName={ctx.org.name}
      myMandateId={ctx.mandateId}
      members={(members as unknown as Member[]) ?? []}
      pending={(pending as unknown as Pending[]) ?? []}
      passwordsEnabled={!!process.env.SUPABASE_SERVICE_ROLE_KEY}
    />
  );
}

async function OrgTab({ org, ctx, supabase }: { org: string; ctx: Ctx; supabase: Sb }) {
  const [{ data: organ }, { data: term }] = await Promise.all([
    supabase.from('organs').select('name, short_name, total_seats, resolution_pattern').eq('id', ctx.organId).maybeSingle(),
    supabase.from('terms').select('label, starts_at, ends_at').eq('id', ctx.termId).maybeSingle(),
  ]);
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-zinc-50">Organizacja</h1>
        <p className="mt-1 text-sm text-zinc-500">Nazwa, wygląd, organ i kadencja</p>
      </div>
      <BrandingSection
        slug={org}
        orgId={ctx.org.id}
        name={ctx.org.name}
        accentColor={ctx.org.accent_color}
        logoUrl={ctx.org.logo_url}
        enabledModules={ctx.org.enabled_modules}
      />
      <OrganSection
        slug={org}
        signaturePattern={organ?.resolution_pattern ?? '{nr}/{kadencja}/{organ}'}
        initial={{
          organName: organ?.name ?? '',
          organShort: organ?.short_name ?? '',
          totalSeats: organ?.total_seats ?? 1,
          termLabel: term?.label ?? '',
          termStarts: term?.starts_at ?? '',
          termEnds: term?.ends_at ?? '',
        }}
      />
    </div>
  );
}
