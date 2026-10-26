import { createServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// One-tap "Dodaj do kalendarza": an iCalendar file for a sitting. Auth-gated by
// the proxy; RLS decides whether the caller may read the session.
const DURATION_MIN = 120;

function icsDate(d: Date) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); // 20261028T150000Z
}
function esc(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
/** RFC 5545: lines longer than 75 octets are folded. */
function fold(line: string) {
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > 74) { out.push(cur); cur = ' ' + ch; } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n');
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: s } = await supabase
    .from('sessions')
    .select('id, title, scheduled_at, location, organ:organs(name, org:organizations(slug))')
    .eq('id', id)
    .maybeSingle();
  if (!s) return new Response('Nie znaleziono', { status: 404 });

  const organ = (s as { organ?: { name?: string; org?: { slug?: string } } }).organ;
  const start = new Date(s.scheduled_at);
  const end = new Date(start.getTime() + DURATION_MIN * 60_000);
  const url = `${new URL(request.url).origin}/${organ?.org?.slug ?? ''}/sessions/${s.id}`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RadaStudentow24//PL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:session-${s.id}@radastudentow24`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${esc(s.title)}`,
    s.location ? `LOCATION:${esc(s.location)}` : '',
    `DESCRIPTION:${esc(`${organ?.name ?? ''}\nPorządek obrad i materiały: ${url}`)}`,
    `URL:${url}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(s.title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).map(fold);

  return new Response(lines.join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="posiedzenie-${start.toISOString().slice(0, 10)}.ics"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
