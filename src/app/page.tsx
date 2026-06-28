import { redirect } from 'next/navigation';
import { getMyOrgs } from '@/lib/org';

export default async function Home() {
  const orgs = await getMyOrgs();
  if (orgs.length === 0) redirect('/login');
  redirect(`/${orgs[0].slug}/sessions`);
}
