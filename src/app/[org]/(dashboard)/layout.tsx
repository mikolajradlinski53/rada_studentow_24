import { redirect, notFound } from 'next/navigation';
import { getOrgContext, getMyOrgs } from '@/lib/org';
import { createServerSupabase } from '@/lib/supabase/server';
import { Sidebar } from '@/components/ui/sidebar';

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

  const ctx = await getOrgContext(slug);
  if (!ctx) notFound(); // org missing OR no active mandate here → isolation gate

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();

  const orgs = await getMyOrgs();

  return (
    <div
      className="flex h-screen bg-zinc-950 text-zinc-100"
      style={ctx.org.accent_color ? ({ ['--accent']: ctx.org.accent_color } as React.CSSProperties) : undefined}
    >
      <Sidebar
        orgSlug={ctx.org.slug}
        orgName={ctx.org.name}
        userName={profile?.full_name ?? user.email ?? ''}
        role={ctx.role}
        modules={ctx.org.enabled_modules}
        orgs={orgs}
      />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
