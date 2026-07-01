'use server';

import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/lib/org';
import { createServerSupabase } from '@/lib/supabase/server';
import { buildSignature, titleFromVote, RESOLUTION_BODY_TEMPLATE } from '@/lib/resolution';
import type { ResolutionStatus } from '@/types/database';

type Result = { ok?: true; error?: string; id?: string };

async function canManage(slug: string, sessionId: string) {
  const ctx = await getOrgContext(slug);
  if (!ctx) return null;
  if (ctx.role === 'admin' || ctx.role === 'chair') return ctx;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: s } = await supabase.from('sessions').select('chaired_by').eq('id', sessionId).maybeSingle();
  if (s?.chaired_by && s.chaired_by === user?.id) return ctx;
  return null;
}

export async function createResolutionFromVote(slug: string, voteId: string): Promise<Result> {
  const supabase = await createServerSupabase();

  const { data: vote } = await supabase
    .from('votes')
    .select('id, title, result, session_id, session:sessions(term_id, organ:organs(resolution_prefix, resolution_pattern, short_name, org_id), term:terms(label))')
    .eq('id', voteId)
    .maybeSingle();
  if (!vote) return { error: 'Nie znaleziono głosowania' };
  if (vote.result !== 'passed') return { error: 'Uchwałę można utworzyć tylko z przyjętego głosowania' };

  const ctx = await canManage(slug, vote.session_id);
  if (!ctx) return { error: 'Brak uprawnień' };

  const { data: existing } = await supabase.from('resolutions').select('id').eq('vote_id', voteId).maybeSingle();
  if (existing) return { error: 'Uchwała dla tego głosowania już istnieje' };

  const session = vote.session as unknown as {
    term_id: string;
    organ?: { resolution_prefix?: string; resolution_pattern?: string; short_name?: string; org_id?: string };
    term?: { label?: string };
  };
  const termId = session.term_id;

  const { data: number, error: numErr } = await supabase.rpc('next_resolution_number', { p_term_id: termId });
  if (numErr || number == null) return { error: numErr?.message ?? 'Błąd numeracji' };

  const signature = buildSignature(
    session.organ?.resolution_prefix ?? 'Uchwała',
    session.organ?.resolution_pattern ?? '{nr}/{kadencja}/{organ}',
    number as number,
    session.term?.label ?? '',
    session.organ?.short_name ?? ''
  );

  const { data: created, error } = await supabase
    .from('resolutions')
    .insert({
      vote_id: voteId,
      session_id: vote.session_id,
      term_id: termId,
      org_id: session.organ?.org_id ?? null,
      number: number as number,
      signature,
      title: titleFromVote(vote.title),
      body: RESOLUTION_BODY_TEMPLATE,
      status: 'draft',
    })
    .select('id')
    .single();
  if (error) return { error: error.message };

  await supabase.rpc('log_audit', { p_action: 'resolution.created', p_target_type: 'resolution', p_target_id: created.id, p_metadata: { signature } });
  revalidatePath(`/${slug}/resolutions`);
  revalidatePath(`/${slug}/sessions/${vote.session_id}`);
  return { ok: true, id: created.id };
}

export async function saveResolution(
  slug: string,
  id: string,
  fields: { title: string; body: string; legal_basis: string; status: ResolutionStatus }
): Promise<Result> {
  const supabase = await createServerSupabase();

  const { data: res } = await supabase.from('resolutions').select('session_id, signed_at').eq('id', id).maybeSingle();
  if (!res) return { error: 'Nie znaleziono uchwały' };

  const ctx = await canManage(slug, res.session_id);
  if (!ctx) return { error: 'Brak uprawnień' };

  const { data: { user } } = await supabase.auth.getUser();
  const signing = (fields.status === 'adopted' || fields.status === 'published') && !res.signed_at;

  const { error } = await supabase
    .from('resolutions')
    .update({
      title: fields.title,
      body: fields.body,
      legal_basis: fields.legal_basis || null,
      status: fields.status,
      ...(signing ? { signed_by: user?.id ?? null, signed_at: new Date().toISOString() } : {}),
    })
    .eq('id', id);
  if (error) return { error: error.message };

  if (signing) await supabase.rpc('log_audit', { p_action: 'resolution.signed', p_target_type: 'resolution', p_target_id: id, p_metadata: {} });
  if (fields.status === 'published') await supabase.rpc('log_audit', { p_action: 'resolution.published', p_target_type: 'resolution', p_target_id: id, p_metadata: {} });

  revalidatePath(`/${slug}/resolutions`);
  revalidatePath(`/${slug}/resolutions/${id}`);
  return { ok: true };
}
