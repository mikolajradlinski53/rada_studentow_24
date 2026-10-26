import 'server-only';
import webpush from 'web-push';

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** True when VAPID keys are configured on the server. */
export function pushConfigured() {
  return !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY;
}

/**
 * Signs and sends one payload to many devices. Returns counts plus the
 * endpoints the push service reported as gone (404/410) so the caller can
 * delete them with whatever client it holds.
 */
export async function sendPush(targets: PushTarget[], payload: PushPayload, ttlSeconds: number) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@radastudentow24.pl',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  const body = JSON.stringify(payload);
  const results = await Promise.allSettled(
    targets.map((t) =>
      webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, body, {
        TTL: ttlSeconds,
        urgency: 'high',
      })
    )
  );
  const gone = results.flatMap((r, i) =>
    r.status === 'rejected' && [404, 410].includes((r.reason as { statusCode?: number })?.statusCode ?? 0)
      ? [targets[i].endpoint]
      : []
  );
  const sent = results.filter((r) => r.status === 'fulfilled').length;
  return { sent, failed: results.length - sent, gone };
}
