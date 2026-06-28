# Multi-tenant foundation + Bootstrap & Admin — Design

> Data: 2026-06-28
> Krok 1 ambitnego roadmapu SaaS. Spec dotyczy WYŁĄCZNIE kroku 1.
> Wzorzec konkurencji: eSesja (badanie poniżej w sekcji "Kontekst").

## 1. Cel i zakres

Przekształcić obecny single-org MVP w **multi-tenant SaaS** z izolacją organizacji
oraz odblokować realne użycie przez **bootstrap** (seed + pierwszy admin) i **panel
`/admin`** do zapraszania członków i zarządzania mandatami.

Po tym kroku: instancja stawiana z `001` + `002` + `seed.sql`; pierwszy admin loguje
się magic-linkiem, dostaje mandat z zaproszenia, z `/[org]/admin` zaprasza radnych.
Każda organizacja (RUSS UEW, FUE, …) widzi wyłącznie swoją strefę pod `/[org]`.

**W zakresie:**
- Routing per-organizacja: prefix ścieżki `/[org]` (slug). Subdomeny — później.
- Rozwiązywanie kontekstu org + kontrola dostępu (proxy.ts + layout).
- Branding per-org (logo + akcent kolorystyczny) i `enabled_modules` (feature flags).
- Tabela `invitations` + onboarding przez email (mandat tworzony przy 1. logowaniu).
- Panel `/[org]/admin`: lista członków + oczekujących, dodawanie po emailu z rolą,
  zmiana roli, deaktywacja mandatu.
- `seed.sql`: org UEW + organ RUSS + kadencja 2025-2026 + zaproszenie admina.
- Przeniesienie istniejących tras dashboardu pod `/[org]` i org-scoped zapytania.

**Poza zakresem (kolejne kroki roadmapu):**
- Subdomeny (`uew.radastudentow24.pl`) — później jako rewrite w proxy.ts.
- UI edycji ustawień organu / kadencji / przełączania modułów przez admina.
- Automatyczna wysyłka maili zaproszeń (osoba loguje się sama istniejącym ekranem).
- Import CSV, wybory kandydatów, auto-protokół, uchwały PDF, audit, transmisja.

## 2. Kontekst — research eSesja (do czego się odnosimy)

eSesja (MWC) — modułowy system obsługi rad; wersja uczelniana dla Rad Wydziału/Senatu.
Funkcje rdzenia: głosowania jawne/niejawne/imienne/nieimienne, wybory kandydatów,
ankiety; porządek obrad (import .doc/.docx lub ręcznie) + materiały; protokół;
kalendarium + archiwum; wyniki real-time na rzutnik. Moduły: transmisja (YouTube),
interpelacje, dyskusja, informator, SMS; portal mieszkańca (publiczny). Logowanie AD.

Nasze przewagi (realizowane w tym i kolejnych krokach): self-serve multi-tenant SaaS
z brandingiem; automatyczne kworum + twarda blokada wyniku bez kworum (już zrobione);
poprawna anonimowość tajnego głosowania (już zrobione); auto-protokół + auto-uchwała
PDF; read-only audit dla Komisji Rewizyjnej; logowanie magic-link.

## 3. Model danych — migracja `002`

### 3.1 Branding i moduły (kolumny na `organizations`)
```sql
ALTER TABLE organizations
  ADD COLUMN accent_color   TEXT,                      -- np. '#4f46e5' (null = default)
  ADD COLUMN enabled_modules TEXT[] NOT NULL
    DEFAULT ARRAY['sessions','resolutions','audit'];   -- feature flags per-org
```
`logo_url` już istnieje. Layout czyta branding po slug; sidebar pokazuje tylko
moduły z `enabled_modules` → "indywidualne UI, które widzą tylko oni".

### 3.2 Zaproszenia
```sql
CREATE TABLE invitations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id     UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,                 -- przechowywany lowercase
  role        TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('admin','chair','member','auditor','secretary','election_committee')),
  label       TEXT,
  invited_by  UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(term_id, email)
);
CREATE INDEX idx_invitations_email ON invitations(lower(email)) WHERE accepted_at IS NULL;
```

### 3.3 Onboarding — zmiana `handle_new_user()`
Po utworzeniu profilu trigger dopina mandaty z pasujących, niezaakceptowanych zaproszeń
(match po `lower(email)`), ustawia `accepted_at`. Idempotentnie (ON CONFLICT po
`UNIQUE(term_id, profile_id)` w mandates — nic nie robi).
```sql
-- w handle_new_user(), po INSERT INTO profiles:
INSERT INTO mandates (term_id, profile_id, role, label)
SELECT i.term_id, NEW.id, i.role, i.label
FROM invitations i
WHERE lower(i.email) = lower(NEW.email) AND i.accepted_at IS NULL
ON CONFLICT (term_id, profile_id) DO NOTHING;

UPDATE invitations SET accepted_at = now()
WHERE lower(email) = lower(NEW.email) AND accepted_at IS NULL;
```

### 3.4 Helper + polityki RLS
```sql
-- Admin organu (przez dowolny aktywny mandat 'admin' w tej org), SECURITY DEFINER.
CREATE FUNCTION user_is_org_admin(p_org_id UUID) RETURNS BOOLEAN ...
```
- `invitations`: SELECT/INSERT/UPDATE/DELETE dla `user_is_org_admin(org tej kadencji)`.
- `mandates`: dołożyć `mandate_insert` i `mandate_update` dla `user_is_org_admin`
  (dziś brak — admin nie może edytować ról/deaktywować). SELECT bez zmian.
- Self-insert mandatu wykonuje wyłącznie trigger (definer) — nie klient.

## 4. Routing i izolacja organizacji

### 4.1 Struktura tras
Przenieść `src/app/(dashboard)/**` → `src/app/[org]/(dashboard)/**`.
Trasy publiczne/auth bez zmian (`/login`, `/auth/callback`). `/` przekierowuje do
domyślnej org użytkownika (pierwsza po nazwie) lub `/login`.

`[org]` = `organizations.slug`. Linki w całej apce budowane z prefiksem `/${org}`.

### 4.2 Rozwiązywanie kontekstu i dostęp
- `proxy.ts` (istniejący): poza dotychczasową ochroną auth — jeśli ścieżka ma segment
  `[org]`, sprawdza zalogowanie (jak dziś). Twardą izolację danych egzekwuje RLS;
  proxy nie musi znać org (utrzymujemy go "lekkim" zgodnie z dokumentacją Next 16).
- `app/[org]/(dashboard)/layout.tsx`: ładuje organizację po slug; jeśli brak LUB
  użytkownik nie ma aktywnego mandatu w tej org → `notFound()`. To realna bramka
  izolacji w UX (RLS i tak nic obcego nie zwróci).
- **Org-scoped wybór mandatu** (naprawia audyt #8): zamiast `mandates.limit(1)`,
  layout wybiera mandat **w obrębie org z URL** (`term → organ → org = bieżąca`).
  Rola i uprawnienia stają się deterministyczne per-org.

### 4.3 Przełącznik organizacji
Sidebar: lista org użytkownika (z jego aktywnych mandatów); wybór = nawigacja do
`/${slug}/sessions`. Gdy jedna org — bez przełącznika, sama nazwa.

## 5. Panel `/[org]/admin`

Dostęp: tylko `role = 'admin'` w bieżącej org (layout/route guard + RLS).
Server Component + Server Actions (Next 16; weryfikacja uprawnień w każdej akcji —
nie polegamy na proxy, zgodnie z dokumentacją Next 16 o Server Functions).

**Widok:**
- Sekcja "Członkowie" — `mandates ⨝ profiles` aktywnej kadencji: imię, email, rola
  (select), badge "aktywny", akcja "Deaktywuj".
- Sekcja "Oczekujący" — `invitations` z `accepted_at IS NULL`: email, rola, badge
  "oczekuje na 1. logowanie", akcja "Anuluj".
- Formularz "Dodaj radnego": email + rola → `invitations` UPSERT (ON CONFLICT
  (term_id,email) → update roli). Email normalizowany do lowercase.

**Server Actions:**
- `inviteMember(termId, email, role)` — UPSERT invitation; jeśli email należy do
  istniejącego już członka org → komunikat zamiast duplikatu.
- `changeMandateRole(mandateId, role)` — UPDATE mandates.
- `deactivateMandate(mandateId)` — `is_active=false, revoked_at=now()`.

**Guardy:** nie można zdeaktywować własnego mandatu admina; nie można zdjąć roli
ostatniego aktywnego admina w org (walidacja w akcji).

## 6. Seed i pierwszy admin — `supabase/seed.sql`

Idempotentny (`ON CONFLICT DO NOTHING`), stałe UUID jak w komentarzu `001`:
- organizations(UEW, slug 'uew', accent_color, enabled_modules default)
- organs(RUSS, 16, 'majority')
- terms('2025-2026', aktywna)
- **`invitations(email = '<<BOOTSTRAP_ADMIN_EMAIL>>', role='admin')`** — wyraźna
  zmienna na górze pliku do podmiany przed uruchomieniem.

Procedura: `001` → `002` → ustaw email → `seed.sql` → zaloguj się tym emailem.

## 7. Zmiany w istniejącym kodzie

- Przeniesienie tras pod `[org]`; aktualizacja wszystkich `<Link>`/`router.push`
  na prefiks `/${org}` (sessions list, detail, new, live, start button, sidebar).
- `new/page.tsx`: organ/term brane z mandatu w bieżącej org (nie `limit(1)`).
- `sidebar.tsx`: branding (logo/nazwa/akcent), przełącznik org, link "Administracja"
  tylko dla admina, filtr modułów wg `enabled_modules`.
- Strony `sessions/resolutions/audit`: org-scoped (i tak przez RLS, ale linki z prefiksem).

## 8. Testowanie / weryfikacja

- `tsc --noEmit` + `next build` zielone (jak po fixach krytycznych).
- Ścieżka E2E (manualnie / opis w PR): seed → login admin → /uew/admin → zaproś
  radnego → wyloguj → login jako radny → mandat dopięty → widzi /uew/sessions →
  brak dostępu do innej org (404) i do /uew/admin (404/redirect).
- Test izolacji: użytkownik bez mandatu w org X dostaje `notFound()` na `/x/*`.
- Test RLS: zaproszenie/zmiana roli przez nie-admina odrzucone.

## 9. Ryzyka / decyzje

- **Trigger a RLS:** `handle_new_user` jest SECURITY DEFINER — wstawia mandaty z
  pominięciem RLS; bezpieczne, bo źródłem jest tylko tabela `invitations` zarządzana
  przez adminów. ✓
- **Wielokrotne org:** wybór mandatu zawsze w kontekście `[org]` — brak
  niedeterminizmu z audytu #8. ✓
- **Subdomeny później:** slug już w bazie; migracja na `uew.radastudentow24.pl` to
  rewrite w proxy.ts bez zmian w strukturze tras. ✓
- **Pierwszy admin bez zaproszenia:** jeśli email seeda się nie zgadza, instancja nie
  ma admina → wymaga ręcznej korekty `invitations`/SQL (udokumentowane w seedzie).
