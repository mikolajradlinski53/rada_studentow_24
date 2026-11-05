import { cache } from 'react';
import { createServerSupabase } from '@/lib/supabase/server';
import type { Organization, Role } from '@/types/database';

export interface OrgContext {
  org: Organization;
  termId: string;
  organId: string;
  organShortName: string;
  role: Role;
  /** Empty for a platform superadmin acting in an org without own mandate. */
  mandateId: string;
  isSuperadmin: boolean;
}

/**
 * The signed-in user, verified once per request. `cache` dedupes it across the
 * layout, the page and helpers (they used to call getUser() 3-4 times each).
 */
export const getAuthUser = cache(async () => {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});

/** Platform superadmin (migration 017) - cross-org admin. Once per request. */
export const isSuperadmin = cache(async (): Promise<boolean> => {
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc('is_platform_admin');
  return data === true;
});

/**
 * Resolves the org by slug and the caller's active mandate WITHIN that org.
 * Returns null when the org doesn't exist or the user has no active mandate in
 * it — callers treat null as notFound(). This is the isolation gate (RLS also
 * prevents any cross-org data leakage) and gives a deterministic per-org role.
 *
 * Cached per request (layout + page share it); the four lookups run in parallel.
 */
export const getOrgContext = cache(async (slug: string): Promise<OrgContext | null> => {
  const user = await getAuthUser();
  if (!user) return null;
  const supabase = await createServerSupabase();

  const [{ data: org }, { data: term }, { data: mandate }, superadmin] = await Promise.all([
    // RLS: organizations are only selectable by their members, so this also gates access.
    supabase.from('organizations').select('*').eq('slug', slug).maybeSingle(),
    // Active term of this org (single organ/term in the pilot).
    supabase.from('terms')
      .select('id, organ_id, organs!inner(org_id, short_name, organizations!inner(slug))')
      .eq('organs.organizations.slug', slug).eq('is_active', true)
      .order('starts_at', { ascending: false }).limit(1).maybeSingle(),
    // Caller's active mandate in that org's active term (deterministic role per-org).
    supabase.from('mandates')
      .select('id, role, term_id, terms!inner(is_active, organs!inner(organizations!inner(slug)))')
      .eq('profile_id', user.id).eq('is_active', true)
      .eq('terms.is_active', true).eq('terms.organs.organizations.slug', slug)
      .limit(1).maybeSingle(),
    isSuperadmin(),
  ]);
  if (!org || !term) return null;
  const own = mandate && mandate.term_id === term.id ? mandate : null;
  if (!own && !superadmin) return null;

  return {
    org: org as Organization,
    termId: term.id,
    organId: term.organ_id,
    organShortName: (term as { organs?: { short_name?: string } }).organs?.short_name ?? '',
    // A superadmin is always an admin; their own mandate (if any) still counts for voting.
    role: superadmin ? 'admin' : (own!.role as Role),
    mandateId: own?.id ?? '',
    isSuperadmin: superadmin,
  };
});

/** Lists the orgs the caller has an active mandate in (for the switcher). */
export const getMyOrgs = cache(async (): Promise<Pick<Organization, 'id' | 'slug' | 'name'>[]> => {
  const user = await getAuthUser();
  if (!user) return [];
  const supabase = await createServerSupabase();
  // organizations is publicly readable (registry), so filter by actual access.
  const { data: ids } = await supabase.rpc('get_user_org_ids');
  const orgIds = ((ids as unknown as string[] | null) ?? []).map((x) => (typeof x === 'string' ? x : Object.values(x as object)[0] as string));
  if (!orgIds.length) return [];
  const { data } = await supabase
    .from('organizations')
    .select('id, slug, name')
    .in('id', orgIds)
    .order('name');
  return (data as Pick<Organization, 'id' | 'slug' | 'name'>[]) ?? [];
});
