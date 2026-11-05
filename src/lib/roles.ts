import type { Role } from '@/types/database';

/**
 * Roles holding a seat: they vote, check in and count to quorum - the
 * councillors. The chair (casting vote on a tie only), protokolant, KR, admin
 * and komisja wyborcza take part without a vote and without attendance.
 * Mirrors is_voting_role() in the DB (migration 033).
 */
export const VOTING_ROLES: readonly Role[] = ['member'];

export function isVotingRole(role: Role | string | null | undefined): boolean {
  return !!role && (VOTING_ROLES as readonly string[]).includes(role);
}
