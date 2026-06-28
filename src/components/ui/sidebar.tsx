'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import type { Role } from '@/types/database';

const NAV_ITEMS = [
  { href: '/sessions', label: 'Posiedzenia', icon: CalendarIcon, roles: null },
  { href: '/resolutions', label: 'Uchwały', icon: FileTextIcon, roles: null },
  { href: '/audit', label: 'Logi', icon: ShieldIcon, roles: ['admin', 'chair', 'auditor'] as Role[] },
];

interface SidebarProps {
  userName: string;
  role: string;
  organName: string;
}

export function Sidebar({ userName, role, organName }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(role as Role)
  );

  return (
    <aside className="flex w-56 flex-col border-r border-zinc-800 bg-zinc-900/50">
      {/* Header */}
      <div className="border-b border-zinc-800 px-4 py-5">
        <div className="text-sm font-semibold text-zinc-100 tracking-tight">
          RadaStudentów24
        </div>
        {organName && (
          <div className="mt-0.5 text-xs text-zinc-500">{organName}</div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {visibleItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
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
