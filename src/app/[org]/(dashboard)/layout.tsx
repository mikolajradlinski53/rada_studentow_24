import { redirect, notFound } from 'next/navigation';
import { getOrgContext, getMyOrgs, getAuthUser } from '@/lib/org';
import { createServerSupabase } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui/sidebar';

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;

  const user = await getAuthUser();
  if (!user) redirect('/login');
  // Signed in with an admin-issued temporary password → choose your own first.
  if (user.user_metadata?.must_change_password) redirect('/ustaw-haslo');

  // Independent lookups in parallel; getOrgContext is cached, so the page reuses it.
  const supabase = await createServerSupabase();
  const [ctx, { data: profile }, orgs] = await Promise.all([
    getOrgContext(slug),
    supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
    getMyOrgs(),
  ]);
  if (!ctx) notFound(); // org missing OR no active mandate here → isolation gate

  return (
    <AppShell
      accent={ctx.org.accent_color}
      orgSlug={ctx.org.slug}
      orgName={ctx.org.name}
      organId={ctx.organId}
      logoUrl={ctx.org.logo_url}
      userName={profile?.full_name ?? user.email ?? ''}
      role={ctx.role}
      modules={ctx.org.enabled_modules}
      orgs={orgs}
    >
      {children}
    </AppShell>
  );
}
