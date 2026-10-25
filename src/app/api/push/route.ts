import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { createServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Web Push broadcast to the organ's members' devices (PWA notifications).
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY  — `npx web-push generate-vapid-keys`
//   VAPID_SUBJECT  mailto: contact the push services can reach (optional)
// The chair's client calls this right after opening a vote / session. Who may
// broadcast, dedupe and recipient selection all live in the
// claim_push_broadcast RPC (migration 014) — this route only signs and sends.
type PushEvent = 'vote_opened' | 'session_opened';

interface Payload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export async function POST(request: Request) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    return NextResponse.json({ error: 'Powiadomienia push nie są skonfigurowane (VAPID).' }, { status: 501 });
  }

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Brak autoryzacji.' }, { status: 401 });

  const { event, id } = (await request.json().catch(() => ({}))) as { event?: PushEvent; id?: string };
  if ((event !== 'vote_opened' && event !== 'session_opened') || typeof id !== 'string') {
    return NextResponse.json({ error: 'Niepoprawne dane wejściowe.' }, { status: 400 });
  }

  const payload = await buildPayload(supabase, event, id);
  if (!payload) return NextResponse.json({ error: 'Nie znaleziono.' }, { status: 404 });

  const { data: targets, error } = await supabase.rpc('claim_push_broadcast', {
    p_event: event,
    p_target_id: id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const subs = (targets as { sub_endpoint: string; sub_p256dh: string; sub_auth: string }[] | null) ?? [];
  if (!subs.length) return NextResponse.json({ sent: 0 });

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@radastudentow24.pl', publicKey, privateKey);
  const body = JSON.stringify(payload);

  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.sub_endpoint, keys: { p256dh: s.sub_p256dh, auth: s.sub_auth } },
        body,
        // A vote is only actionable for a few minutes — no point delivering it later.
        { TTL: event === 'vote_opened' ? 600 : 3600, urgency: 'high' }
      )
    )
  );

  // 404/410 = the device unsubscribed or the browser dropped it → forget it.
  const gone = results.flatMap((r, i) =>
    r.status === 'rejected' && [404, 410].includes((r.reason as { statusCode?: number })?.statusCode ?? 0)
      ? [subs[i].sub_endpoint]
      : []
  );
  if (gone.length) await supabase.rpc('prune_push_subscriptions', { p_endpoints: gone });

  return NextResponse.json({
    sent: results.filter((r) => r.status === 'fulfilled').length,
    failed: results.length - results.filter((r) => r.status === 'fulfilled').length,
  });
}

async function buildPayload(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  event: PushEvent,
  id: string
): Promise<Payload | null> {
  let sessionId = id;
  let vote: { title: string; vote_kind: string | null; vote_type: string } | null = null;

  if (event === 'vote_opened') {
    const { data } = await supabase
      .from('votes').select('session_id, title, vote_kind, vote_type').eq('id', id).maybeSingle();
    if (!data) return null;
    sessionId = data.session_id;
    vote = data;
  }

  const { data: session } = await supabase
    .from('sessions')
    .select('title, organ:organs(org:organizations(slug))')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) return null;

  const slug = (session as { organ?: { org?: { slug?: string } } }).organ?.org?.slug;
  if (!slug) return null;
  const url = `/${slug}/sessions/${sessionId}/live`;

  if (vote) {
    const election = vote.vote_kind === 'election';
    return {
      title: election ? '🗳️ Wybory otwarte' : `🗳️ Głosowanie ${vote.vote_type === 'secret' ? 'tajne' : 'jawne'} otwarte`,
      body: `${vote.title.replace(/^(Głosowanie|Wybory):\s*/i, '')}\n${session.title}`,
      url,
      tag: `vote-${id}`,
    };
  }

  return {
    title: '🔔 Posiedzenie rozpoczęte',
    body: `${session.title}, potwierdź obecność`,
    url,
    tag: `session-${id}`,
  };
}
