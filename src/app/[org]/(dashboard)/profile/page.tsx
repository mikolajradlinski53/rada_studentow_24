import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight, ShieldCheck } from 'lucide-react';
import { getOrgContext, getMyOrgs } from '@/lib/org';
import { createServerSupabase } from '@/lib/supabase/server';
import { NotificationSettings } from '@/components/pwa/notification-toggle';
import { ThemePicker } from '@/components/pwa/theme-picker';
import { CalendarFeed } from '@/components/pwa/calendar-feed';
import { LogoutButton, OrgSwitcher } from '@/components/ui/sidebar';
import { ProfileForm } from './profile-form';
import { PasswordForm } from '@/components/auth/password-form';
import type { Role } from '@/types/database';

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrator',
  chair: 'Przewodniczący/a',
  member: 'Radny/a',
  auditor: 'Komisja Rewizyjna',
  secretary: 'Protokolant/ka',
  election_committee: 'Komisja Wyborcza',
};

export default async function ProfilePage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!ctx) notFound();

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('profiles').select('full_name, email').eq('id', user?.id ?? '').maybeSingle();
  const orgs = await getMyOrgs();

  return (
    <div className="max-w-lg space-y-8">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-zinc-50">Mój profil</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {ctx.isSuperadmin ? 'Superadmin' : (ROLE_LABEL[ctx.role] ?? ctx.role)} · {ctx.org.name}
        </p>
      </div>

      <ProfileForm
        org={org}
        initialName={profile?.full_name ?? ''}
        email={profile?.email ?? user?.email ?? ''}
      />

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-zinc-400">Aplikacja</h2>
        <NotificationSettings />
        <ThemePicker />
        <CalendarFeed />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-zinc-400">Hasło</h2>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="mb-3 text-xs leading-relaxed text-zinc-500">
            Zmień hasło, którym logujesz się w aplikacji. Zawsze możesz też zalogować się linkiem z maila.
          </p>
          <PasswordForm submitLabel="Zmień hasło" />
        </div>
      </section>

      {ctx.isSuperadmin && (
        <Link href="/superadmin"
          className="press flex items-center gap-3 rounded-xl border border-indigo-800/60 bg-indigo-950/30 px-4 py-3.5 hover:bg-indigo-950/50">
          <ShieldCheck className="h-5 w-5 shrink-0 text-indigo-300" />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-medium text-zinc-100">Superadmin platformy</div>
            <div className="text-[13px] text-zinc-500">Wszystkie organizacje, zakładanie nowych</div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" />
        </Link>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-zinc-400">Konto</h2>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-4">
          {orgs.length > 1 && (
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Organizacja</label>
              <OrgSwitcher orgSlug={org} orgs={orgs} className="mt-0 py-2 text-sm" />
            </div>
          )}
          <LogoutButton className="press h-12 w-full rounded-xl border border-zinc-700 text-[15px] text-zinc-300 hover:border-red-900 hover:text-red-400" />
        </div>
      </section>
    </div>
  );
}
