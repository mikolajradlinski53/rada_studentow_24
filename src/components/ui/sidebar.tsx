'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { clsx } from 'clsx';
import type { Role, OrgModule } from '@/types/database';

const NAV_ITEMS: {
  module: OrgModule | null;
  path: string;
  label: string;
  icon: (p: { className?: string }) => React.ReactNode;
  roles: Role[] | null;
}[] = [
  { module: 'sessions', path: 'sessions', label: 'Posiedzenia', icon: CalendarIcon, roles: null },
  { module: 'resolutions', path: 'resolutions', label: 'Uchwały', icon: FileTextIcon, roles: null },
  { module: 'audit', path: 'audit', label: 'Logi', icon: ShieldIcon, roles: ['admin', 'chair', 'auditor'] },
  { module: null, path: 'admin', label: 'Administracja', icon: SettingsIcon, roles: ['admin'] },
];

interface SidebarProps {
  orgSlug: string;
  orgName: string;
  userName: string;
  role: string;
  modules: OrgModule[];
  orgs: { id: string; slug: string; name: string }[];
}

export function Sidebar({ orgSlug, orgName, userName, role, modules, orgs }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  const visibleItems = NAV_ITEMS.filter(
    (item) =>
      (item.module === null || modules.includes(item.module)) &&
      (!item.roles || item.roles.includes(role as Role))
  );

  return (
    <aside className="flex w-56 flex-col border-r border-zinc-800 bg-zinc-900/50">
      {/* Header */}
      <div className="border-b border-zinc-800 px-4 py-5">
        <div className="text-sm font-semibold text-zinc-100 tracking-tight">
          RadaStudentów24
        </div>
        {orgs.length > 1 ? (
          <select
            value={orgSlug}
            onChange={(e) => router.push(`/${e.target.value}/sessions`)}
            className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-300 focus:border-indigo-500 focus:outline-none"
            aria-label="Wybierz organizację"
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.slug}>{o.name}</option>
            ))}
          </select>
        ) : (
          orgName && <div className="mt-0.5 text-xs text-zinc-500 truncate">{orgName}</div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {visibleItems.map((item) => {
          const href = `/${orgSlug}/${item.path}`;
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={item.path}
              href={href}
              className={clsx(
                'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
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
        <div className="text-sm text-zinc-300 truncate">{userName}</div>
        <div className="mt-0.5 text-xs text-zinc-600 capitalize">{role}</div>
        <button
          onClick={handleLogout}
          className="mt-3 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Wyloguj się
        </button>
      </div>
    </aside>
  );
}

// Inline SVG icons (no external dependency needed)
function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function FileTextIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}
