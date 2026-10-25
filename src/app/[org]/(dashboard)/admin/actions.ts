'use server';

import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/lib/org';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase, generateTempPassword } from '@/lib/supabase/admin';
import type { Role, OrgModule } from '@/types/database';

const ALL_MODULES: OrgModule[] = ['sessions', 'resolutions', 'audit'];

export async function updateBranding(
  slug: string,
  fields: { name: string; accent_color: string; logo_url: string; enabled_modules: OrgModule[] }
): Promise<ActionResult> {
  const ctx = await getOrgContext(slug);
  if (!ctx || ctx.role !== 'admin') return { error: 'Brak uprawnień' };
  if (!fields.name.trim()) return { error: 'Nazwa nie może być pusta' };

  // 'sessions' is the core module and cannot be disabled; keep only known modules.
  const modules = Array.from(new Set<OrgModule>(['sessions', ...fields.enabled_modules.filter((m) => ALL_MODULES.includes(m))]));

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('organizations')
    .update({
      name: fields.name.trim(),
      accent_color: fields.accent_color.trim() || null,
      logo_url: fields.logo_url.trim() || null,
      enabled_modules: modules,
    })
    .eq('id', ctx.org.id);
  if (error) return { error: error.message };

  revalidatePath(`/${slug}`, 'layout');
  return { ok: true };
}

const VALID_ROLES: Role[] = ['admin', 'chair', 'member', 'auditor', 'secretary', 'election_committee'];

type ActionResult = { ok?: true; error?: string };

/** Returns true if mandateId is currently the only active admin in the term. */
async function isLastAdmin(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  termId: string,
  mandateId: string
): Promise<boolean> {
  const { data: target } = await supabase
    .from('mandates').select('role').eq('id', mandateId).maybeSingle();
  if (target?.role !== 'admin') return false;
  const { count } = await supabase
    .from('mandates')
    .select('id', { count: 'exact', head: true })
    .eq('term_id', termId)
    .eq('role', 'admin')
    .eq('is_active', true);
  return (count ?? 0) <= 1;
}

export async function inviteMember(slug: string, email: string, role: Role, fullName: string): Promise<ActionResult> {
  const ctx = await getOrgContext(slug);
  if (!ctx || ctx.role !== 'admin') return { error: 'Brak uprawnień' };

  const normalized = email.trim().toLowerCase();
  if (!normalized.includes('@')) return { error: 'Niepoprawny email' };
  if (!VALID_ROLES.includes(role)) return { error: 'Niepoprawna rola' };

  const supabase = await createServerSupabase();
  // accepted_at reset → re-inviting someone (e.g. after deactivation) grants access again.
  const { error } = await supabase
    .from('invitations')
    .upsert(
      { term_id: ctx.termId, email: normalized, role, full_name: fullName.trim() || null, accepted_at: null },
      { onConflict: 'term_id,email' }
    );
  if (error) return { error: error.message };

  revalidatePath(`/${slug}/admin`);
  return { ok: true };
}

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

/** Invite many at once (pasted list). Rows are validated again server-side. */
export async function bulkInvite(
  slug: string,
  rows: { email: string; fullName: string }[],
  role: Role
): Promise<ActionResult & { count?: number }> {
  const ctx = await getOrgContext(slug);
  if (!ctx || ctx.role !== 'admin') return { error: 'Brak uprawnień' };
  if (!VALID_ROLES.includes(role)) return { error: 'Niepoprawna rola' };

  const seen = new Set<string>();
  const clean = rows
    .map((r) => ({ email: r.email.trim().toLowerCase(), full_name: r.fullName.trim() || null }))
    .filter((r) => EMAIL_RE.test(r.email) && !seen.has(r.email) && seen.add(r.email));
  if (!clean.length) return { error: 'Brak poprawnych adresów email' };
  if (clean.length > 200) return { error: 'Maksymalnie 200 osób naraz' };

  const supabase = await createServerSupabase();
  const { error } = await supabase.from('invitations').upsert(
    clean.map((r) => ({ term_id: ctx.termId, role, accepted_at: null, ...r })),
    { onConflict: 'term_id,email' }
  );
  if (error) return { error: error.message };

  revalidatePath(`/${slug}/admin`);
  return { ok: true, count: clean.length };
}

export type IssuedPassword = { email: string; fullName: string | null; password: string };

/**
 * Sets a one-time password for a member/invitee of THIS org (creating the auth
 * account if they never signed in). They must change it on first login.
 * Refused for people holding mandates in another org — otherwise one org's
 * admin could take over an account that matters elsewhere.
 */
export async function issueTempPassword(slug: string, email: string): Promise<ActionResult & { issued?: IssuedPassword }> {
  const ctx = await getOrgContext(slug);
  if (!ctx || ctx.role !== 'admin') return { error: 'Brak uprawnień' };
  const res = await issueOne(ctx, email);
  if ('error' in res) return { error: res.error };
  revalidatePath(`/${slug}/admin`);
  return { ok: true, issued: res };
}

/** Passwords for everyone still pending in this term (handout before a sitting). */
export async function issueTempPasswordsForPending(slug: string): Promise<ActionResult & { issued?: IssuedPassword[]; failed?: { email: string; error: string }[] }> {
  const ctx = await getOrgContext(slug);
  if (!ctx || ctx.role !== 'admin') return { error: 'Brak uprawnień' };

  const supabase = await createServerSupabase();
  const { data: pending } = await supabase
    .from('invitations').select('email').eq('term_id', ctx.termId).is('accepted_at', null);

  const issued: IssuedPassword[] = [];
  const failed: { email: string; error: string }[] = [];
  for (const p of pending ?? []) {
    const r = await issueOne(ctx, p.email);
    if ('error' in r) failed.push({ email: p.email, error: r.error });
    else issued.push(r);
  }
  revalidatePath(`/${slug}/admin`);
  return { ok: true, issued, failed };
}

async function issueOne(
  ctx: NonNullable<Awaited<ReturnType<typeof getOrgContext>>>,
  rawEmail: string
): Promise<IssuedPassword | { error: string }> {
  const admin = createAdminSupabase();
  if (!admin) return { error: 'Hasła wymagają SUPABASE_SERVICE_ROLE_KEY na serwerze (Vercel → Environment Variables).' };

  const email = rawEmail.trim().toLowerCase();
  const supabase = await createServerSupabase();
  const { data: { user: me } } = await supabase.auth.getUser();
  if (me?.email?.toLowerCase() === email) return { error: 'Swoje hasło zmienisz w Profilu.' };

  // 1) The email must belong to THIS org's term: a pending invitation or a member.
  const { data: invite } = await supabase
    .from('invitations').select('full_name').eq('term_id', ctx.termId).eq('email', email).maybeSingle();
  const { data: profile } = await admin
    .from('profiles').select('id, full_name').eq('email', email).maybeSingle();

  let isMember = false;
  if (profile) {
    const { data: m } = await admin
      .from('mandates').select('id').eq('term_id', ctx.termId).eq('profile_id', profile.id).eq('is_active', true).maybeSingle();
    isMember = !!m;
  }
  if (!invite && !isMember) return { error: 'Ten adres nie jest zaproszony do tego organu.' };

  const password = generateTempPassword();
  const fullName = profile?.full_name ?? invite?.full_name ?? null;

  if (profile) {
    // 2) Cross-org guard: no active mandate in any other organization.
    const { data: elsewhere } = await admin
      .from('mandates')
      .select('id, terms!inner(organs!inner(org_id))')
      .eq('profile_id', profile.id)
      .eq('is_active', true)
      .neq('terms.organs.org_id', ctx.org.id)
      .limit(1);
    if (elsewhere?.length) return { error: 'Ta osoba ma mandat także w innej organizacji, hasło może zmienić tylko ona sama.' };

    const { data: existing } = await admin.auth.admin.getUserById(profile.id);
    const { error } = await admin.auth.admin.updateUserById(profile.id, {
      password,
      email_confirm: true,
      user_metadata: { ...(existing.user?.user_metadata ?? {}), must_change_password: true },
    });
    if (error) return { error: error.message };
  } else {
    // Never signed in → create the account; the signup trigger turns the
    // invitation into a mandate (migrations 002/012).
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName ?? undefined, must_change_password: true },
    });
    if (error) return { error: error.message };
  }

  await supabase.rpc('log_audit', {
    p_action: 'member.password_issued',
    p_target_type: 'member',
    p_target_id: profile?.id ?? ctx.mandateId,
    p_metadata: { email },
  });

  return { email, fullName, password };
}

export async function changeMandateRole(slug: string, mandateId: string, role: Role): Promise<ActionResult> {
  const ctx = await getOrgContext(slug);
  if (!ctx || ctx.role !== 'admin') return { error: 'Brak uprawnień' };
  if (!VALID_ROLES.includes(role)) return { error: 'Niepoprawna rola' };
  if (mandateId === ctx.mandateId && role !== 'admin') {
    return { error: 'Nie możesz odebrać sobie roli admina' };
  }

  const supabase = await createServerSupabase();
  if (role !== 'admin' && (await isLastAdmin(supabase, ctx.termId, mandateId))) {
    return { error: 'Nie można zdjąć roli ostatniego administratora' };
  }
  const { error } = await supabase.from('mandates').update({ role }).eq('id', mandateId);
  if (error) return { error: error.message };

  revalidatePath(`/${slug}/admin`);
  return { ok: true };
}

export async function deactivateMandate(slug: string, mandateId: string): Promise<ActionResult> {
  const ctx = await getOrgContext(slug);
  if (!ctx || ctx.role !== 'admin') return { error: 'Brak uprawnień' };
  if (mandateId === ctx.mandateId) return { error: 'Nie możesz deaktywować własnego mandatu' };

  const supabase = await createServerSupabase();
  if (await isLastAdmin(supabase, ctx.termId, mandateId)) {
    return { error: 'Nie można deaktywować ostatniego administratora' };
  }
  const { error } = await supabase
    .from('mandates')
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq('id', mandateId);
  if (error) return { error: error.message };

  revalidatePath(`/${slug}/admin`);
  return { ok: true };
}

export async function cancelInvitation(slug: string, invitationId: string): Promise<ActionResult> {
  const ctx = await getOrgContext(slug);
  if (!ctx || ctx.role !== 'admin') return { error: 'Brak uprawnień' };

  const supabase = await createServerSupabase();
  const { error } = await supabase.from('invitations').delete().eq('id', invitationId);
  if (error) return { error: error.message };

  revalidatePath(`/${slug}/admin`);
  return { ok: true };
}
