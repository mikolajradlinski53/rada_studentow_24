import { redirect, notFound } from 'next/navigation';
import { getOrgContext, getMyOrgs } from '@/lib/org';
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

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  // Signed in with an admin-issued temporary password → choose your own first.
  if (user.user_metadata?.must_change_password) redirect('/ustaw-haslo');

  const ctx = await getOrgContext(slug);
  if (!ctx) notFound(); // org missing OR no active mandate here → isolation gate

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();

  const orgs = await getMyOrgs();

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
