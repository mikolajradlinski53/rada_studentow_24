'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import {
  Check, ChevronRight, Copy, KeyRound, ListPlus, Search, Send, ShieldAlert, UserPlus, Users,
} from 'lucide-react';
import type { Role } from '@/types/database';
import { Sheet } from '@/components/ui/sheet';
import { copyText, shareOrCopy } from '@/lib/share';
import {
  inviteMember, bulkInvite, changeMandateRole, deactivateMandate, cancelInvitation,
  issueTempPassword, issueTempPasswordsForPending, type IssuedPassword,
} from './actions';

const ROLE_LABELS: Record<Role, string> = {
  member: 'Radny/a',
  chair: 'Przewodniczący/a',
  secretary: 'Protokolant/ka',
  auditor: 'Komisja Rewizyjna',
  election_committee: 'Komisja Wyborcza',
  admin: 'Administrator',
};
const ROLE_HINT: Record<Role, string> = {
  member: 'Obecność, głosowanie, materiały',
  chair: 'Prowadzi posiedzenia i głosowania',
  secretary: 'Uzupełnia protokoły',
  auditor: 'Wgląd w logi (tylko odczyt)',
  election_committee: 'Prowadzi wybory',
  admin: 'Pełny dostęp, zarządza członkami',
};
const ROLES = Object.keys(ROLE_LABELS) as Role[];

export type Member = {
  id: string; role: Role; is_active: boolean;
  profile: { id: string; full_name: string; email: string } | null;
};
export type Pending = { id: string; email: string; role: Role; full_name: string | null };

type Result = { ok?: true; error?: string };

export function AdminClient({
  org, orgName, myMandateId, members, pending, passwordsEnabled,
}: {
  org: string; orgName: string; myMandateId: string;
  members: Member[]; pending: Pending[]; passwordsEnabled: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<Member | null>(null);
  const [selectedInvite, setSelectedInvite] = useState<Pending | null>(null);
  const [issued, setIssued] = useState<IssuedPassword[] | null>(null);
  const [issueFailures, setIssueFailures] = useState<{ email: string; error: string }[]>([]);

  const run = (fn: () => Promise<Result>, after?: () => void) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res?.error) setError(res.error);
      else { after?.(); router.refresh(); }
    });
  };

  const issueFor = (email: string) => {
    setError(null);
    startTransition(async () => {
      const res = await issueTempPassword(org, email);
      if (res.error || !res.issued) { setError(res.error ?? 'Nie udało się nadać hasła.'); return; }
      setSelected(null); setSelectedInvite(null);
      setIssueFailures([]);
      setIssued([res.issued]);
      router.refresh();
    });
  };

  const issueAllPending = () => {
    if (!confirm(`Nadać hasła tymczasowe wszystkim oczekującym (${pending.length})? Każde zobaczysz tylko raz.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await issueTempPasswordsForPending(org);
      if (res.error) { setError(res.error); return; }
      setIssueFailures(res.failed ?? []);
      setIssued(res.issued ?? []);
      router.refresh();
    });
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      (m.profile?.full_name ?? '').toLowerCase().includes(q) || (m.profile?.email ?? '').toLowerCase().includes(q));
  }, [members, query]);

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-zinc-50">Dostęp do platformy</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {members.length} {plural(members.length, 'osoba', 'osoby', 'osób')} z dostępem
            {pending.length > 0 && <> · {pending.length} {plural(pending.length, 'oczekuje', 'oczekują', 'oczekuje')}</>}
          </p>
        </div>
        <button onClick={() => setAddOpen(true)}
          className="press hidden h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-500 sm:flex">
          <UserPlus className="h-4 w-4" /> Dodaj radnych
        </button>
      </div>

      {/* Primary action — full width & thumb-height on phones */}
      <button onClick={() => setAddOpen(true)}
        className="press mb-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-[15px] font-semibold text-white hover:bg-indigo-500 sm:hidden">
        <UserPlus className="h-[18px] w-[18px]" /> Dodaj radnych
      </button>

      {!passwordsEnabled && (
        <div className="mb-6 flex gap-3 rounded-xl border border-amber-900/60 bg-amber-950/30 p-3.5 text-[13px] leading-relaxed text-amber-200/90">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p>
            Hasła tymczasowe są wyłączone — brakuje <code className="rounded bg-amber-900/40 px-1">SUPABASE_SERVICE_ROLE_KEY</code> w
            zmiennych środowiskowych. Radni mogą się logować kodem z maila.
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-red-900/60 bg-red-950/30 px-3.5 py-2.5 text-sm text-red-300">{error}</p>
      )}

      {/* Pending */}
      {pending.length > 0 && (
        <section className="mb-8">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <h2 className="text-[13px] font-medium uppercase tracking-wide text-zinc-500">Oczekujący</h2>
            {passwordsEnabled && pending.length > 1 && (
              <button onClick={issueAllPending} disabled={isPending}
                className="press -mr-2 flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-[13px] font-medium text-indigo-300 hover:bg-indigo-950/50 disabled:opacity-50">
                <KeyRound className="h-3.5 w-3.5" /> Hasła dla wszystkich
              </button>
            )}
          </div>
          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40">
            {pending.map((p, i) => (
              <button key={p.id} onClick={() => setSelectedInvite(p)}
                className={clsx('press flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-zinc-800/40',
                  i > 0 && 'border-t border-zinc-800/80')}>
                <Avatar name={p.full_name || p.email} muted />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] text-zinc-200">{p.full_name || p.email}</div>
                  <div className="truncate text-[13px] text-zinc-500">
                    {p.full_name ? `${p.email} · ` : ''}{ROLE_LABELS[p.role]}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Members */}
      <section>
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <h2 className="text-[13px] font-medium uppercase tracking-wide text-zinc-500">Członkowie</h2>
        </div>
        {members.length > 6 && (
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} type="search" placeholder="Szukaj po nazwisku lub emailu"
              aria-label="Szukaj członków"
              className="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-900/60 pl-10 pr-4 text-[15px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-500" />
          </div>
        )}
        {members.length === 0 ? (
          <EmptyState onAdd={() => setAddOpen(true)} />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40">
            {filtered.map((m, i) => (
              <button key={m.id} onClick={() => setSelected(m)}
                className={clsx('press flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-zinc-800/40',
                  i > 0 && 'border-t border-zinc-800/80')}>
                <Avatar name={m.profile?.full_name || m.profile?.email || '?'} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] text-zinc-100">
                    {m.profile?.full_name ?? '—'}
                    {m.id === myMandateId && <span className="ml-1.5 text-[13px] text-zinc-500">(Ty)</span>}
                  </div>
                  <div className="truncate text-[13px] text-zinc-500">
                    {m.role !== 'member' && <span className={ROLE_TEXT[m.role]}>{ROLE_LABELS[m.role]} · </span>}
                    {m.profile?.email}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600" />
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-zinc-500">Nikt nie pasuje do „{query}”.</p>
            )}
          </div>
        )}
      </section>

      {/* Add sheet */}
      <AddSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        org={org}
        busy={isPending}
        run={run}
      />

      {/* Member sheet */}
      <Sheet open={!!selected} onClose={() => setSelected(null)}
        title={selected?.profile?.full_name ?? 'Członek'} description={selected?.profile?.email}>
        {selected && (
          <div className="space-y-5">
            <RolePicker value={selected.role} disabled={isPending}
              onChange={(r) => run(() => changeMandateRole(org, selected.id, r), () => setSelected({ ...selected, role: r }))} />
            {passwordsEnabled && selected.id !== myMandateId && selected.profile?.email && (
              <button onClick={() => issueFor(selected.profile!.email)} disabled={isPending}
                className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-zinc-700 text-[15px] font-medium text-zinc-100 hover:border-zinc-500 disabled:opacity-50">
                <KeyRound className="h-4 w-4" /> Nadaj nowe hasło tymczasowe
              </button>
            )}
            {selected.id !== myMandateId && (
              <button disabled={isPending}
                onClick={() => {
                  if (!confirm(`Odebrać dostęp: ${selected.profile?.full_name ?? selected.profile?.email}? Zniknie z list obecności i głosowań.`)) return;
                  run(() => deactivateMandate(org, selected.id), () => setSelected(null));
                }}
                className="press h-12 w-full rounded-xl text-[15px] font-medium text-red-400 hover:bg-red-950/30 disabled:opacity-50">
                Odbierz dostęp
              </button>
            )}
            {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          </div>
        )}
      </Sheet>

      {/* Invite sheet */}
      <Sheet open={!!selectedInvite} onClose={() => setSelectedInvite(null)}
        title={selectedInvite?.full_name || selectedInvite?.email || 'Zaproszenie'}
        description={selectedInvite ? `${selectedInvite.email} · ${ROLE_LABELS[selectedInvite.role]}` : undefined}>
        {selectedInvite && (
          <div className="space-y-3">
            <p className="text-[14px] leading-relaxed text-zinc-400">
              Ta osoba jeszcze się nie zalogowała. Nadaj jej hasło tymczasowe i wyślij — albo niech zaloguje się
              kodem z maila na adres <span className="text-zinc-200">{selectedInvite.email}</span>.
            </p>
            {passwordsEnabled ? (
              <button onClick={() => issueFor(selectedInvite.email)} disabled={isPending}
                className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-[15px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
                <KeyRound className="h-4 w-4" /> {isPending ? 'Nadawanie…' : 'Nadaj hasło tymczasowe'}
              </button>
            ) : (
              <ShareButton
                label="Wyślij instrukcję logowania"
                text={inviteText({ orgName, email: selectedInvite.email, name: selectedInvite.full_name, role: selectedInvite.role })}
              />
            )}
            <button disabled={isPending}
              onClick={() => {
                if (!confirm(`Anulować zaproszenie dla ${selectedInvite.email}?`)) return;
                run(() => cancelInvitation(org, selectedInvite.id), () => setSelectedInvite(null));
              }}
              className="press h-12 w-full rounded-xl text-[15px] font-medium text-red-400 hover:bg-red-950/30 disabled:opacity-50">
              Anuluj zaproszenie
            </button>
            {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          </div>
        )}
      </Sheet>

      {/* Issued passwords — shown once */}
      <Sheet open={!!issued} onClose={() => setIssued(null)}
        title={issued && issued.length > 1 ? `Hasła tymczasowe (${issued.length})` : 'Hasło tymczasowe'}
        description="Widoczne tylko teraz — przekaż je od razu. Przy pierwszym logowaniu trzeba ustawić własne.">
        {issued && <IssuedList issued={issued} failures={issueFailures} orgName={orgName} />}
      </Sheet>
    </div>
  );
}

/* ---------- Add (single / list) ---------- */

function AddSheet({
  open, onClose, org, busy, run,
}: {
  open: boolean; onClose: () => void; org: string; busy: boolean;
  run: (fn: () => Promise<Result>, after?: () => void) => void;
}) {
  const [tab, setTab] = useState<'one' | 'list'>('one');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [list, setList] = useState('');
  const [done, setDone] = useState<string | null>(null);

  const parsed = useMemo(() => parseList(list), [list]);
  const field = 'h-12 w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 text-[16px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30';

  const close = () => { setDone(null); onClose(); };

  return (
    <Sheet open={open} onClose={close} title="Dodaj radnych"
      description="Osoba dostanie dostęp przy pierwszym logowaniu tym adresem.">
      {done ? (
        <div className="py-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
            <Check className="h-6 w-6" />
          </div>
          <p className="mt-3 text-[15px] text-zinc-200">{done}</p>
          <p className="mt-1 text-[13px] text-zinc-500">Znajdziesz ich w „Oczekują” — stamtąd nadasz hasła.</p>
          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <button onClick={() => setDone(null)}
              className="press h-12 rounded-xl border border-zinc-700 text-[15px] text-zinc-200">Dodaj kolejnych</button>
            <button onClick={close}
              className="press h-12 rounded-xl bg-indigo-600 text-[15px] font-semibold text-white">Gotowe</button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div role="tablist" className="grid grid-cols-2 rounded-xl bg-zinc-950/60 p-1 ring-1 ring-zinc-800">
            {([['one', 'Jedna osoba', UserPlus], ['list', 'Wklej listę', ListPlus]] as const).map(([k, label, Icon]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={clsx('flex h-9 items-center justify-center gap-1.5 rounded-lg text-[14px] font-medium transition-colors',
                  tab === k ? 'bg-zinc-700/80 text-zinc-50' : 'text-zinc-400')}>
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>

          {tab === 'one' ? (
            <div className="space-y-2.5">
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Imię i nazwisko"
                autoComplete="off" aria-label="Imię i nazwisko" className={field} />
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="imie.nazwisko@ue.wroc.pl"
                type="email" inputMode="email" autoComplete="off" aria-label="Email" className={field} />
            </div>
          ) : (
            <div>
              <textarea value={list} onChange={(e) => setList(e.target.value)} rows={6} aria-label="Lista osób"
                placeholder={'Jedna osoba w wierszu, np.:\nJan Kowalski, jan.kowalski@ue.wroc.pl\nanna.nowak@ue.wroc.pl\n\nMożna wkleić prosto z Excela.'}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-3 text-[16px] leading-relaxed text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30" />
              {list.trim() && (
                <p className="mt-1.5 px-1 text-[13px] text-zinc-500">
                  Rozpoznano <span className="font-medium text-zinc-200">{parsed.rows.length}</span>
                  {parsed.invalid > 0 && <span className="text-amber-400"> · {parsed.invalid} bez poprawnego emaila (pominięte)</span>}
                </p>
              )}
            </div>
          )}

          <div>
            <div className="mb-2 px-1 text-[13px] text-zinc-500">Rola</div>
            <RolePicker value={role} onChange={setRole} compact />
          </div>

          <button
            disabled={busy || (tab === 'one' ? !email.includes('@') : parsed.rows.length === 0)}
            onClick={() => {
              if (tab === 'one') {
                run(() => inviteMember(org, email, role, fullName), () => {
                  setDone(`Dodano: ${fullName.trim() || email.trim()}`); setEmail(''); setFullName('');
                });
              } else {
                const n = parsed.rows.length;
                run(() => bulkInvite(org, parsed.rows, role), () => {
                  setDone(`Dodano ${n} ${plural(n, 'osobę', 'osoby', 'osób')}`); setList('');
                });
              }
            }}
            className="press h-12 w-full rounded-xl bg-indigo-600 text-[15px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-40">
            {busy ? 'Dodawanie…' : tab === 'one' ? 'Dodaj' : `Dodaj ${parsed.rows.length || ''} ${plural(parsed.rows.length, 'osobę', 'osoby', 'osób')}`}
          </button>
        </div>
      )}
    </Sheet>
  );
}

/* ---------- Issued passwords ---------- */

function IssuedList({ issued, failures, orgName }: { issued: IssuedPassword[]; failures: { email: string; error: string }[]; orgName: string }) {
  const [copiedAll, setCopiedAll] = useState(false);
  const all = issued.map((i) => `${i.fullName ?? ''}\t${i.email}\t${i.password}`.trim()).join('\n');

  return (
    <div className="space-y-3">
      {issued.map((i) => <IssuedCard key={i.email} item={i} orgName={orgName} />)}
      {issued.length > 1 && (
        <button onClick={async () => { await copyText(all); setCopiedAll(true); navigator.vibrate?.(20); }}
          className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-zinc-700 text-[15px] text-zinc-200">
          {copiedAll ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
          {copiedAll ? 'Skopiowano — wklej do arkusza' : 'Kopiuj wszystkie (do Excela)'}
        </button>
      )}
      {failures.length > 0 && (
        <div className="rounded-xl border border-amber-900/60 bg-amber-950/30 p-3 text-[13px] text-amber-200/90">
          <div className="mb-1 font-medium">Nie udało się dla {failures.length}:</div>
          {failures.map((f) => <div key={f.email}>{f.email} — {f.error}</div>)}
        </div>
      )}
    </div>
  );
}

function IssuedCard({ item, orgName }: { item: IssuedPassword; orgName: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="truncate text-[15px] font-medium text-zinc-100">{item.fullName || item.email}</div>
      {item.fullName && <div className="truncate text-[13px] text-zinc-500">{item.email}</div>}
      <button onClick={async () => { await copyText(item.password); setCopied(true); navigator.vibrate?.(20); }}
        aria-label="Kopiuj hasło"
        className="press mt-3 flex w-full items-center justify-between gap-3 rounded-xl bg-zinc-800/80 px-4 py-3 text-left">
        <span className="select-all font-mono text-[17px] tracking-wide text-zinc-50">{item.password}</span>
        {copied ? <Check className="h-4 w-4 shrink-0 text-emerald-400" /> : <Copy className="h-4 w-4 shrink-0 text-zinc-400" />}
      </button>
      <ShareButton className="mt-2.5" label="Wyślij radnemu"
        text={inviteText({ orgName, email: item.email, name: item.fullName, password: item.password })} />
    </div>
  );
}

function ShareButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'copied'>('idle');
  return (
    <button
      onClick={async () => {
        const r = await shareOrCopy(text, 'RadaStudentów24 — dostęp');
        if (r === 'copied') { setState('copied'); setTimeout(() => setState('idle'), 2500); }
      }}
      className={clsx('press flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-[15px] font-semibold text-white hover:bg-indigo-500', className)}>
      {state === 'copied' ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
      {state === 'copied' ? 'Skopiowano wiadomość' : label}
    </button>
  );
}

function inviteText({ orgName, email, name, password, role }: { orgName: string; email: string; name?: string | null; password?: string; role?: Role }) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const first = name?.trim().split(/\s+/)[0];
  const link = `${origin}/login?email=${encodeURIComponent(email)}`;
  return [
    `Cześć${first ? ` ${first}` : ''}! Masz dostęp do RadaStudentów24 — ${orgName}${role ? ` (${ROLE_LABELS[role]})` : ''}.`,
    '',
    `1. Otwórz: ${link}`,
    `2. Email: ${email}`,
    password ? `3. Hasło tymczasowe: ${password}` : '3. Wybierz „Kod z maila” i wpisz kod, który przyjdzie na ten adres.',
    '',
    password ? 'Po zalogowaniu ustawisz własne hasło.' : '',
    'Na telefonie dodaj stronę do ekranu głównego — dostaniesz powiadomienia o głosowaniach.',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
}

/* ---------- Bits ---------- */

function RolePicker({ value, onChange, disabled, compact }: { value: Role; onChange: (r: Role) => void; disabled?: boolean; compact?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Rola" className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/40">
      {ROLES.map((r, i) => {
        const on = r === value;
        return (
          <button key={r} role="radio" aria-checked={on} disabled={disabled} onClick={() => !on && onChange(r)}
            className={clsx('flex w-full items-center gap-3 px-4 text-left transition-colors disabled:opacity-60',
              compact ? 'py-2.5' : 'py-3', i > 0 && 'border-t border-zinc-800/80', on ? 'bg-indigo-950/40' : 'hover:bg-zinc-800/40')}>
            <div className="min-w-0 flex-1">
              <div className={clsx('text-[15px]', on ? 'font-medium text-zinc-50' : 'text-zinc-200')}>{ROLE_LABELS[r]}</div>
              {!compact && <div className="text-[13px] text-zinc-500">{ROLE_HINT[r]}</div>}
            </div>
            <span className={clsx('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
              on ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-zinc-600')}>
              {on && <Check className="h-3 w-3" strokeWidth={3} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const ROLE_TEXT: Partial<Record<Role, string>> = {
  admin: 'text-indigo-300',
  chair: 'text-emerald-400',
  auditor: 'text-sky-400',
  election_committee: 'text-amber-400',
  secretary: 'text-violet-300',
};

function Avatar({ name, muted }: { name: string; muted?: boolean }) {
  const initials = name.includes('@')
    ? name[0].toUpperCase()
    : name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
  return (
    <span aria-hidden className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold',
      muted ? 'border border-dashed border-zinc-700 text-zinc-500' : 'bg-zinc-800 text-zinc-300')}>
      {initials || '?'}
    </span>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-800 px-6 py-10 text-center">
      <Users className="mx-auto h-8 w-8 text-zinc-600" />
      <p className="mt-3 text-[15px] text-zinc-300">Nikt jeszcze nie ma dostępu</p>
      <p className="mt-1 text-[13px] text-zinc-500">Dodaj radnych — możesz wkleić całą listę naraz.</p>
      <button onClick={onAdd} className="press mt-4 h-10 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white">Dodaj radnych</button>
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  if (n === 1) return one;
  const d = n % 10, t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
}

function parseList(text: string): { rows: { email: string; fullName: string }[]; invalid: number } {
  const rows: { email: string; fullName: string }[] = [];
  let invalid = 0;
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const emailMatch = line.match(/[^\s,;<>"'\t]+@[^\s,;<>"'\t]+\.[^\s,;<>"'\t]+/);
    if (!emailMatch) { invalid++; continue; }
    const email = emailMatch[0].toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    const fullName = line.replace(emailMatch[0], '').replace(/[<>"'\t,;]+/g, ' ').replace(/\s+/g, ' ').trim();
    rows.push({ email, fullName });
  }
  return { rows, invalid };
}
