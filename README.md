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
- **Aplikacja na telefon (PWA)**: instalacja na ekranie głównym (Android: jeden
  przycisk, iOS: Udostępnij → Do ekranu początkowego), dolny pasek nawigacji,
  **powiadomienia push** o otwarciu posiedzenia i każdego głosowania, ekran nie
  gaśnie w trakcie posiedzenia, głos potwierdzany w dwóch krokach, strona offline.

Szczegółowy status i plany: [docs/ROADMAP.md](docs/ROADMAP.md).

## Konfiguracja

### 1. Zmienne środowiskowe

Lokalnie w `.env.local`, na produkcji w **Vercel → Settings → Environment Variables**:

```
NEXT_PUBLIC_SUPABASE_URL=https://twoj-projekt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ... (anon / publishable key)
WHISPER_API_URL=https://whisper.twoj-serwer.pl/v1/audio/transcriptions  # opcjonalnie
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...   # opcjonalnie — powiadomienia push
VAPID_PRIVATE_KEY=...              # (npx web-push generate-vapid-keys)
VAPID_SUBJECT=mailto:admin@twoja-domena.pl
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # hasła tymczasowe, organ/kadencja, superadmin, cron (TYLKO serwer)
CRON_SECRET=...                    # przypomnienia push (Vercel Cron, vercel.json)
```

**Dostęp radnych.** Admin dodaje osoby w *Administracja → Dostęp do platformy*
(pojedynczo albo wklejając listę z Excela) i nadaje im **hasło tymczasowe** —
widoczne raz, do wysłania przyciskiem „Wyślij radnemu”. Przy pierwszym logowaniu
radny ustawia własne hasło. Hasła wymagają `SUPABASE_SERVICE_ROLE_KEY` (Supabase →
Settings → API → `service_role`; nigdy z prefiksem `NEXT_PUBLIC_`). Zapasowo działa
logowanie **linkiem z maila** (na iPhonie link otwiera Safari, nie zainstalowaną
aplikację). Gdy będzie domena + własny SMTP, w Supabase → Authentication → Email
Templates → *Magic Link* dodaj `{{ .Token }}` i ustaw `NEXT_PUBLIC_EMAIL_OTP_CODE=1`
— logowanie przełączy się na 6-cyfrowy kod, który działa też w aplikacji.

Klucze VAPID generuje się **raz** i nie zmienia — nowa para unieważnia wszystkie
zapisane subskrypcje (każdy musiałby włączyć powiadomienia od nowa). Na iOS
powiadomienia działają od iOS 16.4 i tylko w aplikacji dodanej do ekranu głównego.

Transkrypcja auto-protokołu używa **self-hostowanego Whispera** (jeden serwer dla
wszystkich podmiotów, stały koszt zamiast opłat za minutę) — zob.
[docs/whisper-selfhost.md](docs/whisper-selfhost.md). Asystent treści (ulepszanie
protokołów, formatowanie uchwał, tłumaczenie PL→EN) używa **self-hostowanego LLM
(Ollama)** — zob. [docs/ai-selfhost.md](docs/ai-selfhost.md). Oba opcjonalne.

(Wartości Supabase: przycisk **Connect** → App Frameworks → Next.js.)

### 2. Baza — migracje

Przez **Supabase CLI**: `npm run db:login`, `npm run db:link`, potem `npm run db:push`
— szczegóły (w tym jednorazowy baseline istniejącej bazy) w
[docs/supabase-cli.md](docs/supabase-cli.md).

Alternatywnie w Supabase **SQL Editor** uruchom po kolei (idempotentne):

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
013_resolution_bilingual.sql — uchwały PL/EN
014_push_notifications.sql — subskrypcje push (PWA) + broadcast RPC
015_accept_invitations.sql — zaproszenia działają też dla istniejących kont
016_fix_session_timezone.sql — korekta godzin posiedzeń zapisanych jako UTC
017_platform_admin_materials_secretary.sql — superadmin, protokolant, materiały (Storage)
018_motion_votes_logo_upload.sql — wniosek formalny ↔ głosowanie, upload logo
019_db_hardening.sql — uprawnienia w tally_vote / numeracji, anon bez akcji RPC
020_rsvp_speech_timer.sql — „będę / nie będę”, limit czasu wypowiedzi
021_chair_turnout.sql — prowadzący widzi, kto już zagłosował (nie jak)
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
