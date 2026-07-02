# RadaStudentów24

Multi-tenant SaaS do obsługi posiedzeń organów samorządu studenckiego (rady, komisje,
senaty). Głosowania w czasie rzeczywistym, wybory, dyskusja z kolejką mówców,
auto-protokół, uchwały z publicznym rejestrem, transmisja i audyt — każdy podmiot
(RUSS, URSS, komisja PSRP…) jako osobny, izolowany tenant z własnym brandingiem.

Wzorzec: **eSesja** — z przewagami: prawidłowa anonimowość głosowań tajnych,
automatyzacja protokołów, publiczny rejestr uchwał i transmisja bez licencji
per-instancja, self-serve multi-tenant.

## Stack

- **Next.js 16** (App Router, Server Components/Actions, `proxy.ts`) + **Tailwind v4**
- **Supabase** — Postgres + RLS + Auth (magic link) + Realtime
- **Vercel** (hosting), **TypeScript**

## Funkcje

- **Multi-tenant**: routing `/[org]`, izolacja przez RLS, branding per-org
  (logo/akcent/moduły) edytowalny w panelu admina.
- **Posiedzenia**: porządek obrad + materiały, obecność (lista prowadzącego lub
  samodzielny check-in, tryb per-posiedzenie), kworum liczone na żywo.
- **Głosowania**: jawne (imienne) / tajne (anonimowe, bez korelacji głosu z osobą),
  live tally, **widok rzutnikowy** pełnoekranowy.
- **Wybory kandydatów**: jedno- i wielomandatowe (top-N), anonimowe.
- **Dyskusja**: kolejka mówców, ad vocem, wnioski formalne (przerwa/przedłużenie/
  reasumpcja) z timerem przerwy i możliwością przekucia w głosowanie proceduralne.
- **Auto-protokół**: generowany szkielet (obecność, kworum, agenda, wyniki, wnioski)
  + edytor dla protokolanta.
- **Uchwały**: z przyjętego głosowania → numeracja, edytor, wersja do druku/PDF,
  **publiczny rejestr** `/[org]/rejestr`.
- **Transmisja**: embed YouTube w aplikacji + publiczna strona `/[org]/transmisja/[id]`.
- **Audyt** (Komisja Rewizyjna): log zdarzeń z filtrami i eksportem CSV.
- **Profil**: użytkownik ustawia imię i nazwisko.

Szczegółowy status i plany: [docs/ROADMAP.md](docs/ROADMAP.md).

## Konfiguracja

### 1. Zmienne środowiskowe

Lokalnie w `.env.local`, na produkcji w **Vercel → Settings → Environment Variables**:

```
NEXT_PUBLIC_SUPABASE_URL=https://twoj-projekt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ... (anon / publishable key)
OPENAI_API_KEY=sk-...   # opcjonalnie — włącza transkrypcję nagrań w auto-protokole
```

(Wartości Supabase: przycisk **Connect** → App Frameworks → Next.js.)

### 2. Baza — migracje

W Supabase **SQL Editor** uruchom po kolei (idempotentne):

```
001_initial_schema.sql   — tabele, RLS, funkcje (kworum, tally, cast_ballot)
002_multitenant_admin.sql — invitations, branding/moduły, onboarding, admin RLS
003_live_tally.sql        — licznik tajnego głosowania (live turnout)
004_discussion.sql        — kolejka mówców + wnioski + przerwa
005_audit_log.sql         — funkcja log_audit
006_attendance_mode.sql   — tryb obecności (prowadzący/samodzielnie) + RLS
007_public_registry.sql   — publiczny rejestr uchwał
008_elections.sql         — wybory kandydatów
009_org_branding.sql      — edycja brandingu przez admina
010_transmission.sql      — transmisja (stream_url) + publiczny odczyt
011_multiseat_elections.sql — wybory wielomandatowe
012_user_names.sql        — imię i nazwisko z zaproszenia
```

Następnie **`supabase/seed.sql`** (ustaw w nim email bootstrap-admina) — tworzy
organizację UEW + organ RUSS + kadencję + zaproszenie admina.

### 3. Auth (magic link)

Supabase → **Authentication → URL Configuration**:

- **Site URL**: adres produkcyjny (Vercel)
- **Redirect URLs**: `https://twoja-domena/**` (oraz `http://localhost:3000/**` do dewelopmentu)

### 4. Pierwszy admin

Zaloguj się emailem z `seed.sql` → dostajesz mandat admina → `/[org]/admin`:
zapraszasz radnych (email + imię/nazwisko + rola) i ustawiasz branding.

## Development

```bash
npm install
npm run dev      # http://localhost:3000
npx tsc --noEmit # typecheck
npx next build   # produkcyjny build
```

## Architektura (skrót)

- Trasy dashboardu pod `src/app/[org]/(dashboard)/…`; trasy publiczne
  (`rejestr`, `transmisja`) poza grupą; `proxy.ts` pilnuje auth + tras publicznych.
- `getOrgContext(slug)` ([src/lib/org.ts](src/lib/org.ts)) — rozwiązanie organizacji
  i roli użytkownika w jej obrębie (deterministycznie per-org).
- `useLiveSession(sessionId)` ([src/lib/use-live-session.ts](src/lib/use-live-session.ts))
  — współdzielony hook realtime dla panelu live i widoku rzutnikowego.
- Zapisy wrażliwe przez funkcje `SECURITY DEFINER` (głosy, audyt) — bezpośrednie
  inserty zablokowane RLS.
