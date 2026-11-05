/** Builds an uchwała signature from the organ's prefix + pattern. */
export function buildSignature(
  prefix: string,
  pattern: string,
  numberN: number,
  kadencja: string,
  organShort: string
): string {
  const filled = pattern
    .replaceAll('{nr}', String(numberN))
    .replaceAll('{kadencja}', kadencja)
    .replaceAll('{organ}', organShort);
  return `${prefix} ${filled}`.trim();
}

/** Default body skeleton for a new resolution. */
export const RESOLUTION_BODY_TEMPLATE =
  `§ 1\n\n[treść uchwały do uzupełnienia]\n\n§ 2\n\nUchwała wchodzi w życie z dniem podjęcia.`;

/** Body for a new resolution: the draft text members voted on, when there is one. */
export function resolutionBody(draft: string | null | undefined): string {
  const text = draft?.trim();
  return text ? `§ 1\n\n${text}\n\n§ 2\n\nUchwała wchodzi w życie z dniem podjęcia.` : RESOLUTION_BODY_TEMPLATE;
}

/** Strips the "Głosowanie: " / "Opinia: " prefix the live panel adds to a vote title. */
export function titleFromVote(voteTitle: string): string {
  return voteTitle.replace(/^(Głosowanie|Opinia):\s*/i, '').trim();
}
