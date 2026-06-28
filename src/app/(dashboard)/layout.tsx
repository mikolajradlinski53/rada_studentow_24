import { createServerSupabase } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/ui/sidebar';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Fetch user profile and mandate (role)
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  const { data: mandate } = await supabase
    .from('mandates')
    .select('*, terms(*, organs(*))')
    .eq('profile_id', user.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  const role = mandate?.role ?? 'member';
  const organName = (mandate as any)?.terms?.organs?.short_name ?? '';

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      <Sidebar
        userName={profile?.full_name ?? user.email ?? ''}
        role={role}
        organName={organName}
      />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-5xl px-6 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
