import { notFound } from 'next/navigation';
import { getOrgContext } from '@/lib/org';
import { createServerSupabase } from '@/lib/supabase/server';
import { ProfileForm } from './profile-form';

export default async function ProfilePage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!ctx) notFound();

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('profiles').select('full_name, email').eq('id', user?.id ?? '').maybeSingle();

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-xl font-semibold text-zinc-100">Mój profil</h1>
      <ProfileForm
        org={org}
        initialName={profile?.full_name ?? ''}
        email={profile?.email ?? user?.email ?? ''}
      />
    </div>
  );
}
