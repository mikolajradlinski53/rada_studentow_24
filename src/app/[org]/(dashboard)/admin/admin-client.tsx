'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import type { Role } from '@/types/database';
import { inviteMember, changeMandateRole, deactivateMandate, cancelInvitation } from './actions';

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  chair: 'Przewodniczący',
  member: 'Radny',
  auditor: 'Komisja Rewizyjna',
  secretary: 'Protokolant',
  election_committee: 'Komisja Wyborcza',
};
const ROLES = Object.keys(ROLE_LABELS) as Role[];

export type Member = { id: string; role: Role; is_active: boolean; profile: { full_name: string; email: string } | null };
export type Pending = { id: string; email: string; role: Role };

export function AdminClient({
  org, myMandateId, members, pending,
}: { org: string; myMandateId: string; members: Member[]; pending: Pending[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok?: true; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-zinc-100">Administracja</h1>
        <p className="mt-1 text-sm text-zinc-500">Członkowie organu i zaproszenia</p>
      </div>

      {/* Add member */}
      <div className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-48">
            <label className="block text-xs text-zinc-400 mb-1">Email</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="imie.nazwisko@ue.wroc.pl"
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Rola</label>
            <select
              value={role} onChange={(e) => setRole(e.target.value as Role)}
              className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-indigo-500 focus:outline-none"
            >
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
          <button
            disabled={isPending || !email.includes('@')}
            onClick={() => run(async () => {
              const res = await inviteMember(org, email, role);
              if (res.ok) setEmail('');
              return res;
            })}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            Dodaj radnego
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </div>

      {/* Members */}
      <h2 className="text-sm font-medium text-zinc-400 mb-3">Członkowie ({members.length})</h2>
      <div className="space-y-1.5 mb-8">
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
            <div className="min-w-0">
              <div className="text-sm text-zinc-200 truncate">{m.profile?.full_name ?? '—'}</div>
              <div className="text-xs text-zinc-500 truncate">{m.profile?.email}</div>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={m.role} disabled={isPending}
                onChange={(e) => run(() => changeMandateRole(org, m.id, e.target.value as Role))}
                className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-300 focus:border-indigo-500 focus:outline-none"
              >
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
              {m.id !== myMandateId && (
                <button
                  disabled={isPending}
                  onClick={() => run(() => deactivateMandate(org, m.id))}
                  className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
                >
                  Deaktywuj
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Pending */}
      {pending.length > 0 && (
        <>
          <h2 className="text-sm font-medium text-zinc-400 mb-3">Oczekujący ({pending.length})</h2>
          <div className="space-y-1.5">
            {pending.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-dashed border-zinc-800 bg-zinc-900/30 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm text-zinc-300 truncate">{p.email}</div>
                  <div className="text-xs text-zinc-600">{ROLE_LABELS[p.role]}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={clsx('rounded-full px-2.5 py-0.5 text-xs font-medium', 'bg-amber-900/50 text-amber-300')}>
                    oczekuje na 1. logowanie
                  </span>
                  <button
                    disabled={isPending}
                    onClick={() => run(() => cancelInvitation(org, p.id))}
                    className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
                  >
                    Anuluj
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
