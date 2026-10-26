import type { SupabaseClient } from '@supabase/supabase-js';
import type { FloorRequest } from '@/types/database';

/**
 * Carries out an accepted formal motion. A break starts the countdown
 * (sessions.on_break_until), an extension adds time to the current speaker;
 * other motion types are recorded as done and the chair acts on them.
 */
export async function enactMotion(
  supabase: SupabaseClient,
  sessionId: string,
  r: Pick<FloorRequest, 'id' | 'formal_type' | 'minutes'>
) {
  if (r.formal_type === 'break' && r.minutes) {
    const until = new Date(Date.now() + r.minutes * 60000).toISOString();
    await supabase.from('sessions').update({ on_break_until: until }).eq('id', sessionId);
  }
  // "Przedłużenie czasu": extra minutes for whoever is speaking now.
  if (r.formal_type === 'extend_time' && r.minutes) {
    const { data: cur } = await supabase.from('floor_requests')
      .select('id, extra_seconds').eq('session_id', sessionId).eq('status', 'speaking').maybeSingle();
    if (cur) {
      await supabase.from('floor_requests')
        .update({ extra_seconds: Math.min(3600, (cur.extra_seconds ?? 0) + r.minutes * 60) }).eq('id', cur.id);
    }
  }
  await supabase.from('floor_requests').update({ status: 'done' }).eq('id', r.id);
}

/**
 * After a procedural vote closes: passed -> enact the motion, otherwise reject
 * it. Replaces the old two-step "Głosuj" then "Przyjmij".
 */
export async function settleMotionVote(supabase: SupabaseClient, sessionId: string, voteId: string) {
  const { data: vote } = await supabase
    .from('votes').select('result, floor_request_id').eq('id', voteId).maybeSingle();
  if (!vote?.floor_request_id) return;
  const { data: req } = await supabase
    .from('floor_requests').select('id, formal_type, minutes, status').eq('id', vote.floor_request_id).maybeSingle();
  if (!req || req.status === 'done' || req.status === 'rejected') return;
  if (vote.result === 'passed') await enactMotion(supabase, sessionId, req);
  else await supabase.from('floor_requests').update({ status: 'rejected' }).eq('id', req.id);
}
