// iCalendar (RFC 5545) helpers shared by the single-sitting download and the
// subscribed term feed.

const DURATION_MIN = 120;

function icsDate(d: Date) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); // 20261028T150000Z
}
function esc(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
/** Lines longer than 75 octets are folded. */
function fold(line: string) {
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > 74) { out.push(cur); cur = ' ' + ch; } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n');
}

export interface IcsSitting {
  id: string;
  title: string;
  scheduled_at: string;
  location: string | null;
  status: string;
  organName?: string;
  url: string;
}

function vevent(s: IcsSitting) {
  const start = new Date(s.scheduled_at);
  const end = new Date(start.getTime() + DURATION_MIN * 60_000);
  return [
    'BEGIN:VEVENT',
    `UID:session-${s.id}@radastudentow24`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${esc(s.title)}`,
    s.location ? `LOCATION:${esc(s.location)}` : '',
    `DESCRIPTION:${esc(`${s.organName ?? ''}\nPorządek obrad i materiały: ${s.url}`)}`,
    `URL:${s.url}`,
    // A cancelled/draft sitting shouldn't sit in people's calendars as confirmed.
    `STATUS:${s.status === 'draft' ? 'TENTATIVE' : 'CONFIRMED'}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(s.title)}`,
    'END:VALARM',
    'END:VEVENT',
  ].filter(Boolean);
}

export function buildCalendar(sittings: IcsSitting[], name?: string) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RadaStudentow24//PL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...(name ? [`X-WR-CALNAME:${esc(name)}`, 'X-WR-TIMEZONE:Europe/Warsaw', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'] : []),
    ...sittings.flatMap(vevent),
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}
