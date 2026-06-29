import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import type { AttendanceStatus } from '@/types/database';

export interface ProtocolData {
  orgName: string;
  organShort: string;
  termLabel: string;
  title: string;
  scheduledAt: string;
  location: string | null;
  openedAt: string | null;
  closedAt: string | null;
  quorum: { total_seats: number; present: number; required: number; has_quorum: boolean } | null;
  attendance: { name: string; status: AttendanceStatus }[];
  agenda: { position: number; title: string; itemType: string; notes: string | null }[];
  votes: {
    title: string;
    voteType: string;
    result: string | null;
    forN: number;
    against: number;
    abstain: number;
    voters?: { for: string[]; against: string[]; abstain: string[] };
  }[];
  motions: { label: string; requester: string }[];
}

const PRESENT: AttendanceStatus[] = ['present', 'late'];
const RESULT_PL: Record<string, string> = { passed: 'PRZYJĘTO', rejected: 'ODRZUCONO', no_quorum: 'BRAK KWORUM' };

function fmt(iso: string | null, pattern: string): string {
  if (!iso) return '—';
  return format(new Date(iso), pattern, { locale: pl });
}

/**
 * Builds a structured protocol skeleton (Markdown) from a session's hard data:
 * attendance, quorum, agenda, votes (named for open), formal motions. Discussion
 * is left as placeholders for the protokolant to fill in.
 */
export function buildProtocolMarkdown(d: ProtocolData): string {
  const L: string[] = [];

  L.push(`# Protokół`);
  L.push(`## ${d.title}`);
  L.push('');
  L.push(`**Organ:** ${d.orgName} — ${d.organShort}  `);
  L.push(`**Kadencja:** ${d.termLabel}  `);
  L.push(`**Termin:** ${fmt(d.scheduledAt, "EEEE, d MMMM yyyy, HH:mm")}  `);
  if (d.location) L.push(`**Miejsce:** ${d.location}  `);
  L.push(`**Otwarcie:** ${fmt(d.openedAt, 'HH:mm')} · **Zamknięcie:** ${fmt(d.closedAt, 'HH:mm')}`);
  L.push('');

  // Quorum
  L.push(`## 1. Stwierdzenie kworum`);
  if (d.quorum) {
    L.push(
      `Obecnych: **${d.quorum.present}** z ${d.quorum.total_seats} (wymagane kworum: ${d.quorum.required}). ` +
      `Kworum **${d.quorum.has_quorum ? 'jest' : 'nie jest'}** spełnione.`
    );
  } else {
    L.push(`_Brak danych o kworum._`);
  }
  L.push('');

  // Attendance
  const present = d.attendance.filter((a) => PRESENT.includes(a.status)).map((a) => a.name).sort();
  const absent = d.attendance.filter((a) => !PRESENT.includes(a.status)).map((a) => a.name).sort();
  L.push(`## 2. Lista obecności`);
  L.push(`**Obecni (${present.length}):**`);
  L.push(present.length ? present.map((n) => `- ${n}`).join('\n') : '_brak_');
  L.push('');
  L.push(`**Nieobecni (${absent.length}):**`);
  L.push(absent.length ? absent.map((n) => `- ${n}`).join('\n') : '_brak_');
  L.push('');

  // Agenda + discussion + votes
  L.push(`## 3. Porządek obrad i przebieg`);
  if (!d.agenda.length) L.push('_Porządek obrad nie został ustalony._');
  d.agenda.forEach((item, idx) => {
    L.push('');
    L.push(`### ${idx + 1}. ${item.title}`);
    L.push('');
    L.push(`**Przebieg dyskusji:**`);
    L.push(item.notes?.trim() ? item.notes.trim() : `_[do uzupełnienia przez protokolanta]_`);
  });
  L.push('');

  // Votes
  L.push(`## 4. Głosowania`);
  if (!d.votes.length) {
    L.push('_Nie przeprowadzono głosowań._');
  } else {
    d.votes.forEach((v, i) => {
      const res = v.result ? RESULT_PL[v.result] ?? v.result : '—';
      L.push('');
      L.push(`**${i + 1}. ${v.title}** (${v.voteType === 'secret' ? 'tajne' : 'jawne'})`);
      L.push(`Za: ${v.forN} · Przeciw: ${v.against} · Wstrzymujące się: ${v.abstain} → **${res}**`);
      if (v.voteType === 'open' && v.voters) {
        if (v.voters.for.length) L.push(`- Za: ${v.voters.for.join(', ')}`);
        if (v.voters.against.length) L.push(`- Przeciw: ${v.voters.against.join(', ')}`);
        if (v.voters.abstain.length) L.push(`- Wstrzymujące się: ${v.voters.abstain.join(', ')}`);
      }
    });
  }
  L.push('');

  // Motions
  if (d.motions.length) {
    L.push(`## 5. Wnioski formalne`);
    d.motions.forEach((m) => L.push(`- ${m.label} — zgł. ${m.requester} — **przyjęty**`));
    L.push('');
  }

  L.push('---');
  L.push('');
  L.push(`Protokół sporządzono w systemie RadaStudentów24. Przebieg dyskusji wymaga uzupełnienia.`);
  L.push('');
  L.push(`Podpis: ______________________`);

  return L.join('\n');
}
