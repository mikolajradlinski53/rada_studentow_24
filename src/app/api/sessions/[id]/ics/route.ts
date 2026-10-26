import { createServerSupabase } from '@/lib/supabase/server';
import { buildCalendar } from '@/lib/ics';

export const runtime = 'nodejs';

// One-tap "Dodaj do kalendarza": an iCalendar file for a sitting. Auth-gated by
// the proxy; RLS decides whether the caller may read the session.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: s } = await supabase
    .from('sessions')
    .select('id, title, scheduled_at, location, status, organ:organs(name, org:organizations(slug))')
    .eq('id', id)
    .maybeSingle();
  if (!s) return new Response('Nie znaleziono', { status: 404 });

  const organ = (s as { organ?: { name?: string; org?: { slug?: string } } }).organ;
  const body = buildCalendar([{
    ...s,
    organName: organ?.name,
    url: `${new URL(request.url).origin}/${organ?.org?.slug ?? ''}/sessions/${s.id}`,
  }]);

  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="posiedzenie-${s.scheduled_at.slice(0, 10)}.ics"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
