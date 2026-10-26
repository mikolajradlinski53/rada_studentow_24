import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { pushConfigured, sendPush } from '@/lib/push-server';
import { plRelativeDay, plTime } from '@/lib/dates';

export const runtime = 'nodejs';

// Daily reminder push (Vercel Cron, see vercel.json): "Jutro posiedzenie…" for
// sittings tomorrow and "Dziś o 17:00…" for today's. Each (kind, session) goes
// out once - push_events dedupes even if the cron fires twice.
//   CRON_SECRET  Vercel sends it as "Authorization: Bearer <secret>".
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const admin = createAdminSupabase();
  if (!admin) return NextResponse.json({ skipped: 'no service role key' });

  // Circular votes past their deadline get tallied even if nobody opens them.
  const { data: closedCircular } = await admin.rpc('close_due_circular_votes');
  if (!pushConfigured()) return NextResponse.json({ skipped: 'push not configured', closedCircular });

  const now = new Date();
  const horizon = new Date(now.getTime() + 48 * 3600_000);
  const { data: sessions, error } = await admin
    .from('sessions')
    .select('id, title, location, scheduled_at, term_id, organ:organs(org:organizations(slug))')
    .eq('status', 'scheduled')
    .gt('scheduled_at', now.toISOString())
    .lt('scheduled_at', horizon.toISOString());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const report: { session: string; kind: string; sent: number }[] = [];

  for (const s of sessions ?? []) {
    const when = new Date(s.scheduled_at);
    const rel = plRelativeDay(when, now);
    if (!rel) continue;
    const kind = rel === 'Dziś' ? 'reminder_today' : 'reminder_tomorrow';

    // Claim (dedupe). ignoreDuplicates returns no row when already sent.
    const { data: claimed } = await admin
      .from('push_events')
      .upsert({ event: kind, target_id: s.id }, { onConflict: 'event,target_id', ignoreDuplicates: true })
      .select('event');
    if (!claimed?.length) continue;

    const { data: mandates } = await admin
      .from('mandates').select('profile_id').eq('term_id', s.term_id).eq('is_active', true);
    const profileIds = (mandates ?? []).map((m) => m.profile_id);
    if (!profileIds.length) continue;
    const { data: subs } = await admin
      .from('push_subscriptions').select('endpoint, p256dh, auth').in('profile_id', profileIds);
    if (!subs?.length) continue;

    const slug = (s as { organ?: { org?: { slug?: string } } }).organ?.org?.slug;
    const where = s.location ? `, ${s.location}` : '';
    const { sent, gone } = await sendPush(subs, {
      title: rel === 'Dziś' ? `Dziś posiedzenie o ${plTime(when)}` : `Jutro posiedzenie o ${plTime(when)}`,
      body: `${s.title}${where}. Porządek obrad i materiały są w aplikacji.`,
      url: slug ? `/${slug}/sessions/${s.id}` : '/',
      tag: `${kind}-${s.id}`,
    }, 12 * 3600);
    if (gone.length) await admin.from('push_subscriptions').delete().in('endpoint', gone);
    report.push({ session: s.id, kind, sent });
  }

  return NextResponse.json({ checked: sessions?.length ?? 0, sent: report, closedCircular });
}
