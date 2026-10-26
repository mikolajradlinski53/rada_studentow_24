'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { BarChart3, CalendarDays, FileText, ShieldCheck, Settings, UserRound, Vote } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Role, OrgModule } from '@/types/database';

type NavItem = {
  module: OrgModule | null;
  path: string;
  label: string;
  short: string;
  icon: (p: { className?: string }) => React.ReactNode;
  roles: Role[] | null;
  /** Shown in the desktop rail only (the phone tab bar is capped at 5). */
  desktopOnly?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { module: 'sessions', path: 'sessions', label: 'Posiedzenia', short: 'Posiedzenia', icon: CalendarDays, roles: null },
  { module: 'resolutions', path: 'resolutions', label: 'Uchwały', short: 'Uchwały', icon: FileText, roles: null },
  { module: 'sessions', path: 'polls', label: 'Ankiety', short: 'Ankiety', icon: Vote, roles: null, desktopOnly: true },
  { module: 'sessions', path: 'stats', label: 'Frekwencja', short: 'Frekwencja', icon: BarChart3, roles: null, desktopOnly: true },
  { module: 'audit', path: 'audit', label: 'Logi', short: 'Logi', icon: ShieldCheck, roles: ['admin', 'chair', 'auditor'] },
  { module: null, path: 'admin', label: 'Administracja', short: 'Admin', icon: Settings, roles: ['admin'] },
];

interface SidebarProps {
  orgSlug: string;
  orgName: string;
  organId: string;
  logoUrl: string | null;
  userName: string;
  role: string;
  modules: OrgModule[];
  orgs: { id: string; slug: string; name: string }[];
}

function visibleNav(modules: OrgModule[], role: string) {
  return NAV_ITEMS.filter(
    (item) =>
      (item.module === null || modules.includes(item.module)) &&
      (!item.roles || item.roles.includes(role as Role))
  );
}

/** Applies the org accent to the whole document (incl. portaled sheets); see globals.css. */
function useOrgAccent(accent: string | null) {
  useEffect(() => {
    const root = document.documentElement;
    if (!accent || !/^#[0-9a-f]{6}$/i.test(accent)) return;
    root.style.setProperty('--org-accent', accent);
    root.classList.add('org-accent');
    return () => { root.classList.remove('org-accent'); root.style.removeProperty('--org-accent'); };
  }, [accent]);
}

/** Id of the organ's session currently in progress (realtime), or null. */
function useLiveSessionId(organId: string) {
  const [liveId, setLiveId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const load = () =>
      supabase.from('sessions').select('id').eq('organ_id', organId).eq('status', 'in_progress').eq('kind', 'sitting')
        .order('opened_at', { ascending: false }).limit(1).maybeSingle()
        .then(({ data }) => setLiveId(data?.id ?? null));
    load();
    const channel = supabase
      .channel(`organ-live-${organId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: `organ_id=eq.${organId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [organId]);

  return liveId;
}

/**
 * Dashboard frame: desktop left rail, or on phones a top app bar + bottom tab
 * bar around the scrolling content (native-app layout, safe-area aware).
 */
export function AppShell({ children, accent, ...props }: SidebarProps & { children: React.ReactNode; accent: string | null }) {
  const liveId = useLiveSessionId(props.organId);
  const pathname = usePathname();
  useOrgAccent(accent);
  const liveHref = liveId ? `/${props.orgSlug}/sessions/${liveId}/live` : null;
  const onLivePage = !!liveHref && pathname.startsWith(liveHref);

  return (
    <div
      className="flex h-dvh flex-col bg-zinc-950 text-zinc-100 md:flex-row print:block print:h-auto print:bg-white"
      style={accent ? ({ ['--accent']: accent } as React.CSSProperties) : undefined}
    >
      {/* Desktop: fixed left rail */}
      <aside className="hidden w-56 flex-col border-r border-zinc-800 bg-zinc-900/50 md:flex print:hidden">
        <SidebarInner {...props} liveHref={liveHref} />
      </aside>

      {/* Mobile: top app bar (paints under the notch in the installed app) */}
      <header className="pt-safe pl-safe pr-safe shrink-0 border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur-xl md:hidden print:hidden">
        <div className="flex h-12 items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            {props.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={props.logoUrl} alt="" className="h-7 w-7 shrink-0 rounded-xl object-contain" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/icons/icon-192.png" alt="" className="h-7 w-7 shrink-0 rounded-lg" />
            )}
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-semibold tracking-tight text-zinc-100">
                {props.orgName || 'RadaStudentów24'}
              </div>
            </div>
          </div>
          {liveHref && !onLivePage && (
            <Link
              href={liveHref}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-emerald-900/40 active:scale-95"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
              </span>
              Na żywo
            </Link>
          )}
        </div>
      </header>

      <main className="pl-safe pr-safe min-w-0 flex-1 overflow-y-auto overflow-x-clip overscroll-contain print:overflow-visible print:p-0">
        <div className="mx-auto max-w-5xl px-4 py-5 md:px-6 md:py-8 print:max-w-none print:p-0">{children}</div>
      </main>

      <MobileTabBar orgSlug={props.orgSlug} role={props.role} modules={props.modules} liveId={liveId} />
    </div>
  );
}

/** Mobile bottom tab bar — thumb-reachable navigation like a native app. */
function MobileTabBar({ orgSlug, role, modules, liveId }: Pick<SidebarProps, 'orgSlug' | 'role' | 'modules'> & { liveId: string | null }) {
  const pathname = usePathname();
  const items = [
    ...visibleNav(modules, role).filter((i) => !i.desktopOnly),
    { module: null, path: 'profile', label: 'Profil', short: 'Profil', icon: UserRound, roles: null } as NavItem,
  ];

  return (
    <nav
      className="pb-safe pl-safe pr-safe shrink-0 border-t border-zinc-800/80 bg-zinc-950/90 backdrop-blur-xl md:hidden print:hidden"
      aria-label="Nawigacja"
    >
      <div className="flex h-16 items-stretch">
        {items.map((item) => {
          const href = `/${orgSlug}/${item.path}`;
          const active = pathname.startsWith(href);
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={clsx(
                'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[10.5px] font-medium transition-colors active:scale-95',
                active ? 'text-zinc-50' : 'text-zinc-500'
              )}
            >
              <span
                className={clsx('flex h-7 w-12 items-center justify-center rounded-full transition-colors', active && 'bg-zinc-800')}
                style={active ? { color: 'var(--accent, #818cf8)' } : undefined}
              >
                <Icon className="h-[19px] w-[19px]" />
              </span>
              <span className="max-w-full truncate px-0.5">{item.short}</span>
              {item.path === 'sessions' && liveId && (
                <span className="absolute right-[calc(50%-18px)] top-2.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-zinc-950" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function SidebarInner({
  orgSlug, orgName, logoUrl, userName, role, modules, orgs, liveHref,
}: SidebarProps & { liveHref: string | null }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-zinc-800 px-4 py-5">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="mb-2 h-8 w-auto max-w-[10rem] object-contain" />
        )}
        <div className="text-sm font-semibold tracking-tight text-zinc-100">RadaStudentów24</div>
        {orgs.length > 1 ? (
          <OrgSwitcher orgSlug={orgSlug} orgs={orgs} />
        ) : (
          orgName && <div className="mt-0.5 truncate text-xs text-zinc-500">{orgName}</div>
        )}
      </div>

      {liveHref && !pathname.startsWith(liveHref) && (
        <Link href={liveHref}
          className="mx-2 mt-3 flex items-center gap-2 rounded-xl border border-emerald-800/70 bg-emerald-950/40 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-950/70">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          Trwa posiedzenie, wejdź
        </Link>
      )}

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 px-2 py-3">
        {visibleNav(modules, role).map((item) => {
          const href = `/${orgSlug}/${item.path}`;
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={item.path}
              href={href}
              style={isActive ? { borderColor: 'var(--accent, #6366f1)' } : undefined}
              className={clsx(
                'flex items-center gap-2.5 rounded-xl border-l-2 px-3 py-2.5 text-sm transition-colors',
                isActive
                  ? 'border-l-2 bg-zinc-800 text-zinc-100'
                  : 'border-transparent text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="border-t border-zinc-800 px-4 py-4">
        <Link href={`/${orgSlug}/profile`} className="block truncate text-sm text-zinc-300 hover:text-zinc-100 transition-colors">
          {userName}
        </Link>
        <div className="mt-0.5 text-xs capitalize text-zinc-600">{role}</div>
        <div className="mt-3 flex items-center gap-3">
          <Link href={`/${orgSlug}/profile`} className="text-xs text-zinc-500 transition-colors hover:text-zinc-300">
            Profil
          </Link>
          <button onClick={handleLogout} className="text-xs text-zinc-500 transition-colors hover:text-zinc-300">
            Wyloguj się
          </button>
        </div>
      </div>
    </div>
  );
}

export function OrgSwitcher({ orgSlug, orgs, className }: { orgSlug: string; orgs: { id: string; slug: string; name: string }[]; className?: string }) {
  const router = useRouter();
  return (
    <select
      value={orgSlug}
      onChange={(e) => router.push(`/${e.target.value}/sessions`)}
      className={clsx(
        'mt-1.5 w-full rounded-xl border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-300 focus:border-indigo-500 focus:outline-none',
        className
      )}
      aria-label="Wybierz organizację"
    >
      {orgs.map((o) => <option key={o.id} value={o.slug}>{o.name}</option>)}
    </select>
  );
}

export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await createClient().auth.signOut();
        router.push('/login');
      }}
      className={className}
    >
      Wyloguj się
    </button>
  );
}
