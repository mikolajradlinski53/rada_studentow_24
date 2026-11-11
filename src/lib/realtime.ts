import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Listen to a private Broadcast topic fed by DB triggers (migration 041):
 *   session:<id>, organ:<id>, comments:<id>, poll:<id>, rsvp:<id>
 * Access is checked once when joining (can_receive_topic), instead of the
 * database re-checking RLS for every subscriber on every change as
 * postgres_changes did. Returns the cleanup function for useEffect.
 */
export function subscribeTopic(
  supabase: SupabaseClient,
  topic: string,
  onMessage: (event: string, payload: { table?: string; op?: string; row?: Record<string, unknown> }) => void,
): () => void {
  let closed = false;
  const channel = supabase.channel(topic, { config: { private: true } })
    .on('broadcast', { event: '*' }, (m) => onMessage(m.event, (m.payload ?? {}) as never));
  // Private topics need the user's token on the socket before joining.
  void supabase.realtime.setAuth().then(() => { if (!closed) channel.subscribe(); });
  return () => { closed = true; void supabase.removeChannel(channel); };
}
