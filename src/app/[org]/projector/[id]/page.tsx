import { notFound } from 'next/navigation';
import { getOrgContext } from '@/lib/org';
import { ProjectorView } from './projector-view';

// Full-screen projector view — lives OUTSIDE the (dashboard) group so it renders
// without the sidebar/chrome (meant for a beamer in the room). Gated by org
// membership; the live data itself is RLS-protected.
export default async function ProjectorPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);
  if (!ctx) notFound();

  return <ProjectorView sessionId={id} />;
}
