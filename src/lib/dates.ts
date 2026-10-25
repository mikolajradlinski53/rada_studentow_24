// Server components render on Vercel in UTC — always format in Polish local time,
// otherwise sitting times show 1–2 h off.
import { TZDate, tz } from '@date-fns/tz';

const TZ = 'Europe/Warsaw';
/** date-fns `in` option: format(date, pattern, { locale: pl, in: PL_TZ }). */
export const PL_TZ = tz(TZ);

const cache = new Map<string, Intl.DateTimeFormat>();
function fmt(opts: Intl.DateTimeFormatOptions) {
  const key = JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) { f = new Intl.DateTimeFormat('pl-PL', { timeZone: TZ, ...opts }); cache.set(key, f); }
  return f;
}

export const plDay = (d: Date) => fmt({ day: 'numeric' }).format(d);
export const plMonthShort = (d: Date) => fmt({ month: 'short' }).format(d).replace('.', '');
export const plTime = (d: Date) => fmt({ hour: '2-digit', minute: '2-digit' }).format(d);
export const plWeekdayShort = (d: Date) => fmt({ weekday: 'short' }).format(d).replace('.', '');
/** e.g. "wtorek, 14 października 2026 · 18:00" */
export const plLong = (d: Date) =>
  `${fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d)} · ${plTime(d)}`;

/** "Dziś", "Jutro", or null — for upcoming sittings. */
export function plRelativeDay(d: Date, now = new Date()) {
  const key = (x: Date) => fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }).format(x);
  if (key(d) === key(now)) return 'Dziś';
  if (key(d) === key(new Date(now.getTime() + 86_400_000))) return 'Jutro';
  return null;
}

/** "2026-10-14" → ISO instant of that day's start/end in Polish time (for DB range filters). */
export function plDayBoundsISO(day: string, edge: 'start' | 'end') {
  const [y, m, d] = day.split('-').map(Number);
  const t = edge === 'start' ? TZDate.tz(TZ, y, m - 1, d, 0, 0, 0) : TZDate.tz(TZ, y, m - 1, d, 23, 59, 59);
  return new Date(t.getTime()).toISOString();
}
