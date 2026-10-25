import { notFound } from 'next/navigation';
import { getOrgContext, getMyOrgs } from '@/lib/org';
import { createServerSupabase } from '@/lib/supabase/server';
import { NotificationSettings } from '@/components/pwa/notification-toggle';
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
          {ROLE_LABEL[ctx.role] ?? ctx.role} · {ctx.org.name}
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

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-zinc-400">Konto</h2>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-4">
          {orgs.length > 1 && (
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Organizacja</label>
              <OrgSwitcher orgSlug={org} orgs={orgs} className="mt-0 py-2 text-sm" />
            </div>
          )}
          <LogoutButton className="w-full rounded-lg border border-zinc-700 py-2.5 text-sm text-zinc-300 transition-colors hover:border-red-900 hover:text-red-400" />
        </div>
      </section>
    </div>
  );
}
