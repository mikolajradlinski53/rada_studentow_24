# Multi-tenant Foundation + Bootstrap & Admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-org MVP into a multi-tenant SaaS with `/[org]` isolation, per-org branding/modules, an invitation-based onboarding, a `/[org]/admin` panel, and a seed that bootstraps RUSS UEW + the first admin.

**Architecture:** Existing `organizations → organs → terms` is already org-scoped with RLS. We add: (a) DB migration `002` — `invitations` table, branding/module columns, onboarding trigger, admin RLS; (b) a single `getOrgContext(slug)` helper centralizing org-scoped mandate resolution; (c) routing refactor moving the dashboard under `app/[org]/(dashboard)`; (d) the admin panel with server actions; (e) `seed.sql`.

**Tech Stack:** Next.js 16 (App Router, Server Components, Server Actions, `proxy.ts`), Supabase (Postgres + RLS + Auth magic-link), TypeScript, Tailwind v4.

**Verification model:** No unit-test harness exists and the work is infra-heavy (SQL/RLS/routing). Each task is gated by `npx tsc --noEmit` and/or `npx next build`, plus an explicit manual E2E checklist in the final task. SQL tasks include copy-paste verification queries to run in the Supabase SQL editor.

---

## File Structure

- Create `supabase/migrations/002_multitenant_admin.sql` — invitations, branding/module columns, onboarding trigger update, admin helper + RLS.
- Create `supabase/seed.sql` — RUSS UEW org/organ/term + admin invitation.
- Create `src/lib/org.ts` — `getOrgContext(slug)` (org-scoped mandate/role/term resolution; fixes audit #8).
- Create `src/app/[org]/(dashboard)/admin/page.tsx` — admin panel (server component).
- Create `src/app/[org]/(dashboard)/admin/actions.ts` — server actions (invite/changeRole/deactivate).
- Modify `src/types/database.ts` — `Organization` fields, `Invitation`, `OrgModule`.
- Move `src/app/(dashboard)/**` → `src/app/[org]/(dashboard)/**`, then modify for `org` param + links.
- Modify `src/app/page.tsx` — redirect to default org.
- Modify `src/components/ui/sidebar.tsx` — branding, org switcher, admin link, module filter, `/[org]` hrefs.

---

## Task 1: Migration 002 — schema (invitations + branding/modules)

**Files:**
- Create: `supabase/migrations/002_multitenant_admin.sql`

- [ ] **Step 1: Create the migration file with schema additions**

```sql
-- RadaStudentów24 — Migration 002: multi-tenant branding/modules + invitations + admin RLS

-- ============================================================
-- 1. BRANDING & FEATURE FLAGS (per organization)
-- ============================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS accent_color TEXT,
  ADD COLUMN IF NOT EXISTS enabled_modules TEXT[] NOT NULL
    DEFAULT ARRAY['sessions','resolutions','audit'];

-- ============================================================
-- 2. INVITATIONS — pre-authorize an email before the account exists
-- ============================================================

CREATE TABLE IF NOT EXISTS invitations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id     UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('admin','chair','member','auditor','secretary','election_committee')),
  label       TEXT,
  invited_by  UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(term_id, email)
);

CREATE INDEX IF NOT EXISTS idx_invitations_email_pending
  ON invitations (lower(email)) WHERE accepted_at IS NULL;

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Verify SQL parses (psql dry-run optional)**

If a local DB/psql is available run it; otherwise visually confirm syntax. This step has no automated gate — correctness is verified when applied in Task 10's E2E (the migration must apply cleanly on a fresh project).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/002_multitenant_admin.sql
git commit -m "feat(db): migration 002 — invitations table + org branding/modules"
```

---

## Task 2: Migration 002 — admin helper + onboarding trigger

**Files:**
- Modify: `supabase/migrations/002_multitenant_admin.sql` (append)

- [ ] **Step 1: Append the admin helper function**

```sql
-- ============================================================
-- 3. HELPER — is the current user an admin of this org?
-- ============================================================

CREATE OR REPLACE FUNCTION user_is_org_admin(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM mandates m
    JOIN terms t  ON t.id = m.term_id
    JOIN organs o ON o.id = t.organ_id
    WHERE m.profile_id = auth.uid()
      AND o.org_id = p_org_id
      AND m.is_active = true
      AND m.role = 'admin'
  );
$$;
```

- [ ] **Step 2: Append the onboarding trigger replacement**

```sql
-- ============================================================
-- 4. ONBOARDING — accept invitations on first login
-- ============================================================
-- Replaces handle_new_user() from migration 001: after creating the profile,
-- materialize mandates from any pending invitations matching the email.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;

  -- Materialize mandates from pending invitations for this email.
  INSERT INTO mandates (term_id, profile_id, role, label)
  SELECT i.term_id, NEW.id, i.role, i.label
  FROM invitations i
  WHERE lower(i.email) = lower(NEW.email)
    AND i.accepted_at IS NULL
  ON CONFLICT (term_id, profile_id) DO NOTHING;

  UPDATE invitations
  SET accepted_at = now()
  WHERE lower(email) = lower(NEW.email)
    AND accepted_at IS NULL;

  RETURN NEW;
END;
$$;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/002_multitenant_admin.sql
git commit -m "feat(db): org-admin helper + invitation-accepting onboarding trigger"
```

---

## Task 3: Migration 002 — RLS policies (invitations + mandate writes)

**Files:**
- Modify: `supabase/migrations/002_multitenant_admin.sql` (append)

- [ ] **Step 1: Append invitation policies (admin of the term's org)**

```sql
-- ============================================================
-- 5. RLS — invitations (managed by org admins) + mandate writes
-- ============================================================
-- org_id for an invitation is derived: invitation.term_id -> terms -> organs.org_id

CREATE POLICY "invitation_admin_all" ON invitations FOR ALL
  USING (EXISTS (
    SELECT 1 FROM terms t JOIN organs o ON o.id = t.organ_id
    WHERE t.id = invitations.term_id AND user_is_org_admin(o.org_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM terms t JOIN organs o ON o.id = t.organ_id
    WHERE t.id = invitations.term_id AND user_is_org_admin(o.org_id)
  ));
```

- [ ] **Step 2: Append mandate insert/update policies for admins**

```sql
-- Admins may grant/revoke/relabel mandates within their org.
CREATE POLICY "mandate_admin_insert" ON mandates FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM terms t JOIN organs o ON o.id = t.organ_id
    WHERE t.id = mandates.term_id AND user_is_org_admin(o.org_id)
  ));

CREATE POLICY "mandate_admin_update" ON mandates FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM terms t JOIN organs o ON o.id = t.organ_id
    WHERE t.id = mandates.term_id AND user_is_org_admin(o.org_id)
  ));
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/002_multitenant_admin.sql
git commit -m "feat(db): RLS for invitations and admin-managed mandates"
```

---

## Task 4: Seed file — RUSS UEW + first admin

**Files:**
- Create: `supabase/seed.sql`

- [ ] **Step 1: Create the idempotent seed**

```sql
-- RadaStudentów24 — Seed (RUSS UEW pilot)
-- Run AFTER migrations 001 and 002. Idempotent.
-- >>> Set the bootstrap admin email below before running. <<<

-- Bootstrap admin (gets an 'admin' invitation -> becomes admin on first login):
--   mikolaj.radlinski.53@gmail.com

INSERT INTO organizations (id, name, slug, accent_color, enabled_modules) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Samorząd Studentów UEW', 'uew',
   '#4f46e5', ARRAY['sessions','resolutions','audit'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO organs (id, org_id, name, short_name, total_seats, quorum_type, resolution_prefix, resolution_pattern) VALUES
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
   'Rada Uczelniana Samorządu Studentów', 'RUSS', 16, 'majority',
   'Uchwała', '{nr}/{kadencja}/{organ}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO terms (id, organ_id, label, starts_at, ends_at, is_active) VALUES
  ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222',
   '2025-2026', '2025-09-01', '2026-08-31', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO invitations (term_id, email, role, label) VALUES
  ('33333333-3333-3333-3333-333333333333', 'mikolaj.radlinski.53@gmail.com', 'admin', 'Administrator instancji')
ON CONFLICT (term_id, email) DO UPDATE SET role = EXCLUDED.role;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/seed.sql
git commit -m "feat(db): seed RUSS UEW + bootstrap admin invitation"
```

---

## Task 5: Types — Organization fields, Invitation, OrgModule

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Add `OrgModule` and extend `Organization`**

In `src/types/database.ts`, replace the `Organization` interface and add `OrgModule` above it:

```typescript
export type OrgModule = 'sessions' | 'resolutions' | 'audit';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  accent_color: string | null;
  enabled_modules: OrgModule[];
  created_at: string;
}
```

- [ ] **Step 2: Add the `Invitation` interface (after `Mandate`)**

```typescript
export interface Invitation {
  id: string;
  term_id: string;
  email: string;
  role: Role;
  label: string | null;
  invited_by: string | null;
  created_at: string;
  accepted_at: string | null;
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/types/database.ts
git commit -m "feat(types): Organization branding/modules + Invitation"
```
Expected: tsc exits 0.

---

## Task 6: Org context helper

**Files:**
- Create: `src/lib/org.ts`

- [ ] **Step 1: Write `getOrgContext`**

```typescript
import { createServerSupabase } from '@/lib/supabase/server';
import type { Organization, Role } from '@/types/database';

export interface OrgContext {
  org: Organization;
  termId: string;
  organId: string;
  organShortName: string;
  role: Role;
  mandateId: string;
}

/**
 * Resolves the org by slug and the caller's active mandate WITHIN that org.
 * Returns null when the org doesn't exist or the user has no active mandate in
 * it — callers treat null as notFound(). This is the isolation gate (RLS also
 * prevents any cross-org data leakage) and gives a deterministic per-org role.
 */
export async function getOrgContext(slug: string): Promise<OrgContext | null> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // RLS: organizations are only selectable by their members, so this also gates access.
  const { data: org } = await supabase
    .from('organizations')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (!org) return null;

  // Active term of this org (single organ/term in the pilot).
  const { data: term } = await supabase
    .from('terms')
    .select('id, organ_id, organs!inner(org_id, short_name)')
    .eq('organs.org_id', org.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (!term) return null;

  // Caller's active mandate in that term (deterministic role per-org).
  const { data: mandate } = await supabase
    .from('mandates')
    .select('id, role')
    .eq('profile_id', user.id)
    .eq('term_id', term.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (!mandate) return null;

  return {
    org: org as Organization,
    termId: term.id,
    organId: term.organ_id,
    organShortName: (term as { organs?: { short_name?: string } }).organs?.short_name ?? '',
    role: mandate.role as Role,
    mandateId: mandate.id,
  };
}

/** Lists the orgs the caller has an active mandate in (for the switcher). */
export async function getMyOrgs(): Promise<Pick<Organization, 'id' | 'slug' | 'name'>[]> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from('organizations')
    .select('id, slug, name')
    .order('name');
  return (data as Pick<Organization, 'id' | 'slug' | 'name'>[]) ?? [];
}
```

Note: `getMyOrgs` relies on RLS (`organizations` SELECT = members only), so it already returns only the user's orgs.

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/org.ts
git commit -m "feat: getOrgContext — org-scoped mandate/role resolution"
```
Expected: tsc exits 0.

---

## Task 7: Move dashboard routes under `[org]`

**Files:**
- Move: `src/app/(dashboard)/` → `src/app/[org]/(dashboard)/`

- [ ] **Step 1: Move the route group with git**

```bash
mkdir -p "src/app/[org]"
git mv "src/app/(dashboard)" "src/app/[org]/(dashboard)"
```

- [ ] **Step 2: Verify the tree**

```bash
ls "src/app/[org]/(dashboard)"
```
Expected: `audit  layout.tsx  resolutions  sessions`.

- [ ] **Step 3: Commit the move (no logic change yet)**

```bash
git add -A
git commit -m "refactor: move dashboard routes under /[org]"
```

---

## Task 8: Org-aware dashboard layout

**Files:**
- Modify: `src/app/[org]/(dashboard)/layout.tsx`

- [ ] **Step 1: Rewrite the layout to use `getOrgContext`**

```tsx
import { redirect, notFound } from 'next/navigation';
import { getOrgContext, getMyOrgs } from '@/lib/org';
import { createServerSupabase } from '@/lib/supabase/server';
import { Sidebar } from '@/components/ui/sidebar';

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const ctx = await getOrgContext(slug);
  if (!ctx) notFound(); // org missing OR no active mandate here → isolation gate

  const { data: profile } = await supabase
    .from('profiles').select('full_name').eq('id', user.id).maybeSingle();

  const orgs = await getMyOrgs();

  return (
    <div
      className="flex h-screen bg-zinc-950 text-zinc-100"
      style={ctx.org.accent_color ? ({ ['--accent' as string]: ctx.org.accent_color }) : undefined}
    >
      <Sidebar
        orgSlug={ctx.org.slug}
        orgName={ctx.org.name}
        organName={ctx.organShortName}
        userName={profile?.full_name ?? user.email ?? ''}
        role={ctx.role}
        modules={ctx.org.enabled_modules}
        orgs={orgs}
      />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck (will fail until Sidebar props updated in Task 9 — that's expected)**

Run: `npx tsc --noEmit`
Expected: errors only about `Sidebar` props mismatch. Proceed to Task 9 before committing.

---

## Task 9: Sidebar — branding, org switcher, admin link, module filter

**Files:**
- Modify: `src/components/ui/sidebar.tsx`

- [ ] **Step 1: Replace the component (keep the inline SVG icons at the bottom of the file unchanged)**

Replace everything from the top of the file through the end of the `Sidebar` function (do NOT touch the `CalendarIcon`/`FileTextIcon`/`ShieldIcon` definitions below it) with:

```tsx
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
  organName: string;
  userName: string;
  role: string;
  modules: OrgModule[];
  orgs: { id: string; slug: string; name: string }[];
}

export function Sidebar({ orgSlug, orgName, organName, userName, role, modules, orgs }: SidebarProps) {
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
      <div className="border-b border-zinc-800 px-4 py-5">
        <div className="text-sm font-semibold text-zinc-100 tracking-tight">RadaStudentów24</div>
        {orgs.length > 1 ? (
          <select
            value={orgSlug}
            onChange={(e) => router.push(`/${e.target.value}/sessions`)}
            className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-300 focus:border-indigo-500 focus:outline-none"
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.slug}>{o.name}</option>
            ))}
          </select>
        ) : (
          organName && <div className="mt-0.5 text-xs text-zinc-500">{organName}</div>
        )}
      </div>

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
                isActive ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-zinc-800 px-4 py-4">
        <div className="text-sm text-zinc-300 truncate">{userName}</div>
        <div className="mt-0.5 text-xs text-zinc-600 capitalize">{role}</div>
        <button onClick={handleLogout} className="mt-3 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          Wyloguj się
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Add a `SettingsIcon` next to the other icon helpers at the bottom of the file**

```tsx
function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/components/ui/sidebar.tsx src/app/[org]/(dashboard)/layout.tsx
git commit -m "feat: org-aware sidebar (branding, switcher, admin link, module filter) + layout"
```
Expected: tsc exits 0.

---

## Task 10: Thread `org` slug through dashboard pages & links

**Files:**
- Modify: `src/app/[org]/(dashboard)/sessions/page.tsx`
- Modify: `src/app/[org]/(dashboard)/sessions/new/page.tsx`
- Modify: `src/app/[org]/(dashboard)/sessions/[id]/page.tsx`
- Modify: `src/app/[org]/(dashboard)/sessions/[id]/live/page.tsx`
- Modify: `src/components/session/start-session-button.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Sessions list — accept `org` param, scope by org, prefix links**

In `sessions/page.tsx`, change the signature and links. Replace the function signature and the session/mandate fetch + the two `href`s:

```tsx
export default async function SessionsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const supabase = await createServerSupabase();

  const { data: sessions } = await supabase
    .from('sessions')
    .select('*, organ:organs(short_name, org_id), chair_profile:profiles!sessions_chaired_by_fkey(full_name)')
    .order('scheduled_at', { ascending: false });

  const { data: { user } } = await supabase.auth.getUser();
  const { data: mandate } = await supabase
    .from('mandates').select('role').eq('profile_id', user?.id ?? '')
    .eq('is_active', true).limit(1).maybeSingle();

  const canCreate = mandate?.role === 'admin' || mandate?.role === 'chair';
```

Then update the "Nowe posiedzenie" links (both occurrences) from `href="/sessions/new"` to `href={`/${org}/sessions/new`}`, and the per-session link block:

```tsx
                href={
                  session.status === 'in_progress'
                    ? `/${org}/sessions/${session.id}/live`
                    : `/${org}/sessions/${session.id}`
                }
```

- [ ] **Step 2: Session detail — `org` param + links**

In `sessions/[id]/page.tsx` change the params type to `Promise<{ org: string; id: string }>`, destructure `const { org, id } = await params;`, switch the mandate lookup `.single()` is already `.maybeSingle()`, and update links: back link `href={`/${org}/sessions`}`, the live link `href={`/${org}/sessions/${session.id}/live`}`. Pass `org` to `StartSessionButton`:

```tsx
{canStart && <StartSessionButton sessionId={session.id} org={org} />}
```
and update the wrapper + its import usage:
```tsx
function StartSessionButton({ sessionId, org }: { sessionId: string; org: string }) {
  return <StartSessionButtonClient sessionId={sessionId} org={org} />;
}
```

- [ ] **Step 3: Start button — accept `org`, push org-scoped live URL**

In `src/components/session/start-session-button.tsx`:

```tsx
export function StartSessionButtonClient({ sessionId, org }: { sessionId: string; org: string }) {
```
and change the redirect:
```tsx
    router.push(`/${org}/sessions/${sessionId}/live`);
```

- [ ] **Step 4: New session — `org` param; resolve organ/term via getOrgContext**

In `sessions/new/page.tsx` (client component) we cannot call `getOrgContext` (server). Instead read `org` from the route with `useParams`, and after insert push to `/${org}/sessions/${id}`. Replace the organ/term resolution to scope by org slug:

```tsx
'use client';
import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function NewSessionPage() {
  const router = useRouter();
  const params = useParams<{ org: string }>();
  const orgSlug = params.org;
  // ...unchanged state...
```
Replace the mandate/organ resolution block with an org-scoped lookup:
```tsx
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Active term + organ of THIS org (scoped by slug).
    const { data: term } = await supabase
      .from('terms')
      .select('id, organ_id, organs!inner(org_id, organizations!inner(slug))')
      .eq('organs.organizations.slug', orgSlug)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (!term) {
      setError('Brak aktywnej kadencji dla tej organizacji');
      setLoading(false);
      return;
    }

    const organId = term.organ_id;
    const termId = term.id;
```
Update the insert to use `term_id: termId` and `organ_id: organId`, and the redirect:
```tsx
    router.push(`/${orgSlug}/sessions/${session.id}`);
```

- [ ] **Step 5: Live page — accept `org` in params (no behavior change needed)**

In `sessions/[id]/live/page.tsx` change the params type only:
```tsx
export default function LiveSessionPage({ params }: { params: Promise<{ org: string; id: string }> }) {
```
The body already reads `p.id`; leave the rest unchanged.

- [ ] **Step 6: Root page — redirect to default org**

Replace `src/app/page.tsx`:
```tsx
import { redirect } from 'next/navigation';
import { getMyOrgs } from '@/lib/org';

export default async function Home() {
  const orgs = await getMyOrgs();
  if (orgs.length === 0) redirect('/login');
  redirect(`/${orgs[0].slug}/sessions`);
}
```

- [ ] **Step 7: Typecheck + build + commit**

```bash
npx tsc --noEmit && npx next build
git add -A
git commit -m "feat: thread org slug through dashboard pages, links, and root redirect"
```
Expected: tsc 0, build succeeds, routes show `/[org]/sessions` etc.

---

## Task 11: Admin panel — page + server actions

**Files:**
- Create: `src/app/[org]/(dashboard)/admin/actions.ts`
- Create: `src/app/[org]/(dashboard)/admin/page.tsx`

- [ ] **Step 1: Server actions with admin re-verification + guards**

`src/app/[org]/(dashboard)/admin/actions.ts`:
```tsx
'use server';

import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/lib/org';
import { createServerSupabase } from '@/lib/supabase/server';
import type { Role } from '@/types/database';

const VALID_ROLES: Role[] = ['admin', 'chair', 'member', 'auditor', 'secretary', 'election_committee'];

export async function inviteMember(slug: string, email: string, role: Role) {
  const ctx = await getOrgContext(slug);
  if (!ctx || ctx.role !== 'admin') return { error: 'Brak uprawnień' };
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes('@')) return { error: 'Niepoprawny email' };
  if (!VALID_ROLES.includes(role)) return { error: 'Niepoprawna rola' };

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('invitations')
    .upsert(
      { term_id: ctx.termId, email: normalized, role },
      { onConflict: 'term_id,email' }
    );
  if (error) return { error: error.message };
  revalidatePath(`/${slug}/admin`);
  return { ok: true };
}

export async function changeMandateRole(slug: string, mandateId: string, role: Role) {
  const ctx = await getOrgContext(slug);
  if (!ctx || ctx.role !== 'admin') return { error: 'Brak uprawnień' };
  if (!VALID_ROLES.includes(role)) return { error: 'Niepoprawna rola' };
  if (mandateId === ctx.mandateId && role !== 'admin') {
    return { error: 'Nie możesz odebrać sobie roli admina' };
  }
  const supabase = await createServerSupabase();
  const { error } = await supabase.from('mandates').update({ role }).eq('id', mandateId);
  if (error) return { error: error.message };
  revalidatePath(`/${slug}/admin`);
  return { ok: true };
}

export async function deactivateMandate(slug: string, mandateId: string) {
  const ctx = await getOrgContext(slug);
  if (!ctx || ctx.role !== 'admin') return { error: 'Brak uprawnień' };
  if (mandateId === ctx.mandateId) return { error: 'Nie możesz deaktywować własnego mandatu' };
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('mandates')
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq('id', mandateId);
  if (error) return { error: error.message };
  revalidatePath(`/${slug}/admin`);
  return { ok: true };
}

export async function cancelInvitation(slug: string, invitationId: string) {
  const ctx = await getOrgContext(slug);
  if (!ctx || ctx.role !== 'admin') return { error: 'Brak uprawnień' };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from('invitations').delete().eq('id', invitationId);
  if (error) return { error: error.message };
  revalidatePath(`/${slug}/admin`);
  return { ok: true };
}
```

- [ ] **Step 2: Admin page (server component) with a small client form**

`src/app/[org]/(dashboard)/admin/page.tsx`:
```tsx
import { notFound } from 'next/navigation';
import { getOrgContext } from '@/lib/org';
import { createServerSupabase } from '@/lib/supabase/server';
import { AdminClient } from './admin-client';

export default async function AdminPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!ctx || ctx.role !== 'admin') notFound();

  const supabase = await createServerSupabase();

  const { data: members } = await supabase
    .from('mandates')
    .select('id, role, is_active, profile:profiles(full_name, email)')
    .eq('term_id', ctx.termId)
    .eq('is_active', true)
    .order('role');

  const { data: pending } = await supabase
    .from('invitations')
    .select('id, email, role')
    .eq('term_id', ctx.termId)
    .is('accepted_at', null)
    .order('created_at', { ascending: false });

  return (
    <AdminClient
      org={org}
      myMandateId={ctx.mandateId}
      members={(members as never) ?? []}
      pending={(pending as never) ?? []}
    />
  );
}
```

- [ ] **Step 3: Admin client component**

Create `src/app/[org]/(dashboard)/admin/admin-client.tsx`:
```tsx
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

type Member = { id: string; role: Role; is_active: boolean; profile: { full_name: string; email: string } | null };
type Pending = { id: string; email: string; role: Role };

export function AdminClient({
  org, myMandateId, members, pending,
}: { org: string; myMandateId: string; members: Member[]; pending: Pending[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ error?: string; ok?: boolean }>) => {
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
```

- [ ] **Step 4: Typecheck + build + commit**

```bash
npx tsc --noEmit && npx next build
git add -A
git commit -m "feat: /[org]/admin panel — invite members, change role, deactivate"
```
Expected: tsc 0, build succeeds, `/[org]/admin` listed in routes.

---

## Task 12: Verification — apply migrations + manual E2E

**Files:** none (verification only)

- [ ] **Step 1: Apply schema to a Supabase project**

In the Supabase SQL editor (or `supabase db reset` with local CLI), run in order: `001_initial_schema.sql`, `002_multitenant_admin.sql`, then `seed.sql` (with the admin email already set to `mikolaj.radlinski.53@gmail.com`).

- [ ] **Step 2: Verify seed + invitation present**

```sql
SELECT slug, enabled_modules FROM organizations WHERE slug = 'uew';
SELECT email, role, accepted_at FROM invitations;
```
Expected: one `uew` row; one invitation `mikolaj.radlinski.53@gmail.com / admin / NULL`.

- [ ] **Step 3: E2E happy path (browser)**

1. `npm run dev`; open the app → redirected to `/login`.
2. Log in with `mikolaj.radlinski.53@gmail.com` (magic link).
3. Land on `/uew/sessions`. Confirm sidebar shows "Administracja".
4. Open `/uew/admin`; verify your own member row (role Administrator) and no pending.
5. Add a member: another email + role "Radny" → appears under "Oczekujący".
6. Verify mandate materialization:
```sql
SELECT p.email, m.role, m.is_active FROM mandates m JOIN profiles p ON p.id = m.profile_id;
```
   (After that email logs in once, they get a member mandate and the invitation flips to accepted.)

- [ ] **Step 4: E2E isolation checks**

1. As the admin, visit `/nonexistent/sessions` → 404.
2. As a non-admin member, visit `/uew/admin` → 404.
3. Confirm a member with no mandate in another org cannot see it (no switcher entry / 404 on its slug).

- [ ] **Step 5: Final build gate + push**

```bash
npx tsc --noEmit && npx next build
git push origin main
```
Expected: green typecheck + build; branch pushed.
