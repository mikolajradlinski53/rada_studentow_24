import { redirect } from 'next/navigation';
import { getMyOrgs } from '@/lib/org';
import { createServerSupabase } from '@/lib/supabase/server';

export default async function Home() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (user.user_metadata?.must_change_password) redirect('/ustaw-haslo');

  // Turn any pending invitations for this email into mandates (also for
  // accounts that existed before the invite — migration 015).
  await supabase.rpc('accept_my_invitations');

  const orgs = await getMyOrgs();
  // Signed in but no active mandate anywhere → explain instead of bouncing to /login
  // (which the proxy would bounce straight back here: redirect loop).
  if (orgs.length === 0) redirect('/brak-dostepu');
  redirect(`/${orgs[0].slug}/sessions`);
}
