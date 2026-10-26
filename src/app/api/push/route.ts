import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { sendPush, pushConfigured, type PushPayload } from '@/lib/push-server';

export const runtime = 'nodejs';

// Web Push broadcast to the organ's members' devices (PWA notifications).
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY  — `npx web-push generate-vapid-keys`
//   VAPID_SUBJECT  mailto: contact the push services can reach (optional)
// The chair's client calls this right after opening a vote / session. Who may
// broadcast, dedupe and recipient selection all live in the
// claim_push_broadcast RPC (migration 014) — this route only signs and sends.
type PushEvent = 'vote_opened' | 'session_opened';

type Payload = PushPayload;

export async function POST(request: Request) {
  if (!pushConfigured()) {
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

  const { sent, failed, gone } = await sendPush(
    subs.map((s) => ({ endpoint: s.sub_endpoint, p256dh: s.sub_p256dh, auth: s.sub_auth })),
    payload,
    // A vote is only actionable for a few minutes - no point delivering it later.
    event === 'vote_opened' ? 600 : 3600
  );
  // 404/410 = the device unsubscribed or the browser dropped it -> forget it.
  if (gone.length) await supabase.rpc('prune_push_subscriptions', { p_endpoints: gone });

  return NextResponse.json({ sent, failed });
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
