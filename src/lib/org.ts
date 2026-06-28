import { createServerSupabase } from '@/lib/supabase/server';
import type { Organization, Role } from '@/types/database';

export interface OrgContext {
  org: Organization;
  termId: string;
  organId: string;
  organShortName: string;
  role: Role;
  mandateId: string;
}

/**
 * Resolves the org by slug and the caller's active mandate WITHIN that org.
 * Returns null when the org doesn't exist or the user has no active mandate in
 * it — callers treat null as notFound(). This is the isolation gate (RLS also
 * prevents any cross-org data leakage) and gives a deterministic per-org role.
 */
export async function getOrgContext(slug: string): Promise<OrgContext | null> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // RLS: organizations are only selectable by their members, so this also gates access.
  const { data: org } = await supabase
    .from('organizations')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (!org) return null;

  // Active term of this org (single organ/term in the pilot).
  const { data: term } = await supabase
    .from('terms')
    .select('id, organ_id, organs!inner(org_id, short_name)')
    .eq('organs.org_id', org.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (!term) return null;

  // Caller's active mandate in that term (deterministic role per-org).
  const { data: mandate } = await supabase
    .from('mandates')
    .select('id, role')
    .eq('profile_id', user.id)
    .eq('term_id', term.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (!mandate) return null;

  return {
    org: org as Organization,
    termId: term.id,
    organId: term.organ_id,
    organShortName: (term as { organs?: { short_name?: string } }).organs?.short_name ?? '',
    role: mandate.role as Role,
    mandateId: mandate.id,
  };
}

/** Lists the orgs the caller has an active mandate in (for the switcher). */
export async function getMyOrgs(): Promise<Pick<Organization, 'id' | 'slug' | 'name'>[]> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from('organizations')
    .select('id, slug, name')
    .order('name');
  return (data as Pick<Organization, 'id' | 'slug' | 'name'>[]) ?? [];
}
