import { createAdminSupabase } from '@/lib/supabase/admin';
import { buildCalendar, type IcsSitting } from '@/lib/ics';

export const runtime = 'nodejs';

// Subscribed calendar (webcal) for one person: every sitting of every term they
// hold an active mandate in. Calendar apps send no cookies, so the URL's random
// token is the credential (rotatable in Profile). Service role after resolving it.
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const clean = token.replace(/\.ics$/, '');
  if (!/^[0-9a-f]{48}$/.test(clean)) return new Response('Not found', { status: 404 });

  const admin = createAdminSupabase();
  if (!admin) return new Response('Kalendarz niedostępny', { status: 503 });

  const { data: tok } = await admin.from('calendar_tokens').select('profile_id').eq('token', clean).maybeSingle();
  if (!tok) return new Response('Not found', { status: 404 });

  const { data: mandates } = await admin
    .from('mandates').select('term_id').eq('profile_id', tok.profile_id).eq('is_active', true);
  const termIds = [...new Set((mandates ?? []).map((m) => m.term_id as string))];

  let sittings: IcsSitting[] = [];
  if (termIds.length) {
    const since = new Date(Date.now() - 90 * 86_400_000).toISOString(); // last ~3 months + all upcoming
    const { data } = await admin
      .from('sessions')
      .select('id, title, scheduled_at, location, status, organ:organs(name, org:organizations(slug))')
      .in('term_id', termIds)
      .neq('status', 'draft')
      .gte('scheduled_at', since)
      .order('scheduled_at');
    const origin = new URL(request.url).origin;
    sittings = (data ?? []).map((s) => {
      const organ = (s as { organ?: { name?: string; org?: { slug?: string } } }).organ;
      return { ...s, organName: organ?.name, url: `${origin}/${organ?.org?.slug ?? ''}/sessions/${s.id}` };
    });
  }

  return new Response(buildCalendar(sittings, 'Posiedzenia · RadaStudentów24'), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'private, max-age=900',
    },
  });
}
