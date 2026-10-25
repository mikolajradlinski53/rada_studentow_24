'use client';

import { createClient } from '@/lib/supabase/client';

export type PushSupport =
  | 'supported'
  | 'unsupported'      // old browser / no service worker
  | 'needs-install'    // iOS Safari: push only works once added to the home screen
  | 'unconfigured';    // server has no VAPID key

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export function isIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS reports as Mac
}

export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported';
  if (!VAPID_PUBLIC_KEY) return 'unconfigured';
  if (isIOS() && !isStandalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported';
  }
  return 'supported';
}

/** pushSupport() plus a permission the user already blocked. */
export function pushBaseState(): PushSupport | 'denied' {
  const support = pushSupport();
  if (support === 'supported' && Notification.permission === 'denied') return 'denied';
  return support;
}

/** For useSyncExternalStore reads of browser-only facts that don't change while mounted. */
export const subscribeNoop = () => () => {};

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration() {
  return navigator.serviceWorker.getRegistration('/').then((r) => r ?? navigator.serviceWorker.ready);
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'supported') return null;
  const reg = await registration();
  return reg.pushManager.getSubscription();
}

/** Writes the device's subscription under the signed-in user (idempotent). */
async function store(sub: PushSubscription) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Nie jesteś zalogowany/a.');
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };

  const { data: mine } = await supabase
    .from('push_subscriptions').select('id').eq('endpoint', json.endpoint).maybeSingle();
  if (mine) return; // already stored for me (RLS only shows my own rows)

  // A shared device may still hold another user's row for this endpoint —
  // release it first (RLS forbids updating someone else's row).
  await supabase.rpc('prune_push_subscriptions', { p_endpoints: [json.endpoint] });
  const { error } = await supabase.from('push_subscriptions').insert({
    profile_id: user.id,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    user_agent: navigator.userAgent.slice(0, 300),
  });
  if (error) throw error;
}

/** Asks for permission (must run from a tap) and subscribes this device. */
export async function enablePush(): Promise<PushSubscription> {
  if (pushSupport() !== 'supported') throw new Error('Ta przeglądarka nie obsługuje powiadomień.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(permission === 'denied'
      ? 'Powiadomienia są zablokowane — włącz je w ustawieniach przeglądarki / telefonu.'
      : 'Nie udzielono zgody na powiadomienia.');
  }
  const reg = await registration();
  const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
  });
  await store(sub);
  return sub;
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  const supabase = createClient();
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

/** Re-asserts an existing subscription in the DB (e.g. after a login switch). */
export async function syncPush() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const sub = await currentSubscription().catch(() => null);
  if (sub) await store(sub).catch(() => {});
}

/**
 * Chair-side: notify the organ's members' devices. Fire-and-forget — a push
 * failure must never block opening a vote. The server dedupes per target.
 */
export function broadcastPush(event: 'vote_opened' | 'session_opened', id: string) {
  fetch('/api/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, id }),
    keepalive: true,
  }).catch(() => {});
}
