'use server';

import { revalidatePath } from 'next/cache';
import { isSuperadmin } from '@/lib/org';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { createServerSupabase } from '@/lib/supabase/server';

export interface NewOrgFields {
  name: string;
  slug: string;
  organName: string;
  organShort: string;
  totalSeats: number;
  termLabel: string;
  termStarts: string;
  termEnds: string;
  adminEmail: string;
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const RESERVED = new Set(['login', 'auth', 'api', 'public', 'superadmin', 'brak-dostepu', 'ustaw-haslo', 'icons', '_next']);

/** Platform superadmin: org + organ + active term (+ first admin invitation) in one go. */
export async function createOrganization(f: NewOrgFields): Promise<{ ok?: true; error?: string; slug?: string }> {
  if (!(await isSuperadmin())) return { error: 'Brak uprawnień' };
  const admin = createAdminSupabase();
  if (!admin) return { error: 'Brak SUPABASE_SERVICE_ROLE_KEY na serwerze.' };

  const slug = f.slug.trim().toLowerCase();
  if (!f.name.trim()) return { error: 'Podaj nazwę organizacji.' };
  if (!SLUG_RE.test(slug) || RESERVED.has(slug)) return { error: 'Adres: małe litery, cyfry i myślniki (np. uwr, psrp-kb).' };
  if (!f.organName.trim() || !f.organShort.trim()) return { error: 'Podaj nazwę i skrót organu.' };
  if (!Number.isInteger(f.totalSeats) || f.totalSeats < 1) return { error: 'Podaj liczbę miejsc w składzie.' };
  if (!f.termLabel.trim() || !f.termStarts || !f.termEnds || f.termEnds < f.termStarts) return { error: 'Sprawdź kadencję i jej daty.' };
  const adminEmail = f.adminEmail.trim().toLowerCase();
  if (adminEmail && !adminEmail.includes('@')) return { error: 'Niepoprawny email administratora.' };

  const { data: org, error: e1 } = await admin.from('organizations')
    .insert({ name: f.name.trim(), slug, enabled_modules: ['sessions', 'resolutions', 'audit'] })
    .select('id').single();
  if (e1 || !org) return { error: e1?.code === '23505' ? 'Ten adres jest już zajęty.' : (e1?.message ?? 'Błąd zapisu.') };

  const { data: organ, error: e2 } = await admin.from('organs')
    .insert({ org_id: org.id, name: f.organName.trim(), short_name: f.organShort.trim(), total_seats: f.totalSeats })
    .select('id').single();
  if (e2 || !organ) { await admin.from('organizations').delete().eq('id', org.id); return { error: e2?.message ?? 'Błąd zapisu organu.' }; }

  const { data: term, error: e3 } = await admin.from('terms')
    .insert({ organ_id: organ.id, label: f.termLabel.trim(), starts_at: f.termStarts, ends_at: f.termEnds, is_active: true })
    .select('id').single();
  if (e3 || !term) { await admin.from('organizations').delete().eq('id', org.id); return { error: e3?.message ?? 'Błąd zapisu kadencji.' }; }

  if (adminEmail) {
    await admin.from('invitations').insert({ term_id: term.id, email: adminEmail, role: 'admin', label: 'Administrator' });
  }

  await (await createServerSupabase()).rpc('log_audit', {
    p_action: 'org.created', p_target_type: 'org', p_target_id: org.id, p_metadata: { slug },
  });
  revalidatePath('/superadmin');
  return { ok: true, slug };
}
