// Audit log wording shared by the KR log page and its CSV export.

export const ACTION_LABELS: Record<string, string> = {
  'session.opened': 'Otwarto posiedzenie',
  'session.closed': 'Zamknięto posiedzenie',
  'vote.opened': 'Otwarto głosowanie',
  'vote.closed': 'Zamknięto głosowanie',
  'vote.decided': 'Głos rozstrzygający przewodniczącego',
  'vote.announced': 'Komisja Rewizyjna ogłosiła wyniki',
  'ballot.cast': 'Oddano głos',
  'attendance.checked_in': 'Potwierdzono obecność',
  'protocol.generated': 'Wygenerowano protokół',
  'resolution.created': 'Utworzono uchwałę',
  'resolution.signed': 'Podpisano uchwałę',
  'resolution.published': 'Opublikowano uchwałę',
  'resolution.edited': 'Zmieniono uchwałę',
  'resolution.status': 'Zmieniono status uchwały',
};

const RES_STATUS: Record<string, string> = {
  draft: 'projekt', adopted: 'uchwalona', published: 'opublikowana', revoked: 'uchylona',
};

/** Short detail after the action label, e.g. "Uchwała 3/… · treść, tytuł" or "projekt → opublikowana". */
export function auditHint(meta: Record<string, unknown> | null | undefined): string | null {
  const m = meta ?? {};
  const parts: string[] = [];
  if (typeof m.signature === 'string') parts.push(m.signature);
  if (Array.isArray(m.fields) && m.fields.length) parts.push((m.fields as string[]).join(', '));
  if (typeof m.from === 'string' && typeof m.to === 'string') parts.push(`${RES_STATUS[m.from] ?? m.from} → ${RES_STATUS[m.to] ?? m.to}`);
  if (typeof m.vote_type === 'string') parts.push(m.vote_type === 'secret' ? 'tajne' : 'jawne');
  if (typeof m.email === 'string') parts.push(m.email);
  if (typeof m.note === 'string') parts.push(m.note);
  return parts.length ? parts.join(' · ') : null;
}
