'use server';

import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/lib/org';
import { createServerSupabase } from '@/lib/supabase/server';
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
  const { error } = await supabase
    .from('invitations')
    .upsert({ term_id: ctx.termId, email: normalized, role, full_name: fullName.trim() || null }, { onConflict: 'term_id,email' });
  if (error) return { error: error.message };

  revalidatePath(`/${slug}/admin`);
  return { ok: true };
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
