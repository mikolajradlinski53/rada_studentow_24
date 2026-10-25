import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Service-role client — bypasses RLS and can manage auth users. Server only
 * (the `server-only` import makes a client-bundle import a build error).
 * Always authorize the caller with getOrgContext() BEFORE using it.
 */
export function createAdminSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// No look-alike characters (0/O, 1/l/I) — the password is read off a phone and retyped.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Readable one-time password, e.g. "Rada-k7Qm-xP4t-9wHe" (~71 bits of entropy). */
export function generateTempPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
  return `Rada-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}
