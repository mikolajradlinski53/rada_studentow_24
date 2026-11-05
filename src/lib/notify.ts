/**
 * Supabase writes return { error } instead of throwing - an unchecked failure
 * leaves the user with "I tapped and nothing happened". Use on every write:
 *   if (failed(error, 'Nie udało się zamknąć głosowania.')) return;
 */
export function failed(error: { message?: string } | null | undefined, what: string): boolean {
  if (!error) return false;
  console.error(what, error);
  if (typeof window !== 'undefined') {
    alert(`${what}\n\nSprawdź połączenie i spróbuj ponownie. Jeśli problem wraca, odśwież stronę.`);
  }
  return true;
}
