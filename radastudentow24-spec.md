# RadaStudentów24 — Specyfikacja MVP

> **Faza 0 — Dokument referencyjny**
> Data: 27 czerwca 2026
> Pilot: RUSS UEW (Rada Uczelniana Samorządu Studentów, Uniwersytet Ekonomiczny we Wrocławiu)

---

## 1. Problemy do rozwiązania

| # | Ból | Stan obecny | Cel MVP |
|---|------|-------------|---------|
| 1 | Głosowania | Google Forms, brak weryfikacji, brak kworum auto | Głosowanie imienne/tajne w czasie rzeczywistym, kworum automatyczne |
| 2 | Protokoły | Ręczne pisanie przez protokolanta, ogromne obciążenie kadrowe | Auto-generowany szkielet protokołu, ręczne uzupełnienie dyskusji |
| 3 | Uchwały | Ręczne formatowanie po posiedzeniu | Auto-generowana formatka PDF z danymi z głosowania |
| 4 | Agenda i materiały | Mail od Przewodniczącego (często na ostatnią chwilę) | Porządek obrad widoczny w systemie, materiały załączone do punktów |

---

## 2. Parametry pilota — RUSS UEW

| Parametr | Wartość |
|----------|---------|
| Skład organu | 15 Radnych + Przewodniczący = **16 osób** |
| Kworum | **> 50% składu = min. 9 osób** |
| Tryb głosowania (jawne) | **Imienne** — widać kto jak głosował |
| Tryb głosowania (tajne) | **Anonimowe** — system rejestruje że głos oddano, nie rejestruje kto jak |
| Próg przegłosowania | **Zwykła większość** obecnych (> 50% głosów "za" z oddanych) |
| Numeracja uchwał | `Uchwała {nr}/{rok_kadencji}/RUSS` np. `Uchwała 20/2025-2026/RUSS` |
| Podpis uchwały | Przewodniczący RUSS |
| Podpis protokołu | Przewodniczący RUSS lub Członek Zarządu ds. Administracji SSUEW |
| Posiedzenia zwyczajne | Terminy ustalane na początku roku akademickiego, stacjonarnie |
| Posiedzenia nadzwyczajne | Zdalnie (aktualnie Google Forms — do zastąpienia) |
| Dostęp do logów | **Komisja Rewizyjna** — wgląd read-only w pełne logi głosowań |
| Prowadzenie wyborów Zarządu | **SKW (Studencka Komisja Wyborcza)** — rola "prowadzący posiedzenie" |

---

## 3. Role i uprawnienia

```
┌─────────────────────────────────────────────────────────┐
│                    ROLE W SYSTEMIE                       │
├──────────────────────┬──────────────────────────────────┤
│ Admin instancji      │ Konfiguracja organu, kadencji,   │
│                      │ użytkowników. Pełny dostęp.      │
├──────────────────────┼──────────────────────────────────┤
│ Przewodniczący       │ Tworzy posiedzenia, ustala        │
│                      │ porządek, otwiera/zamyka           │
│                      │ głosowania, podpisuje uchwały.     │
├──────────────────────┼──────────────────────────────────┤
│ Prowadzący           │ Jak Przewodniczący, ale na         │
│ posiedzenie          │ pojedyncze posiedzenie.            │
│ (np. SKW)            │ Delegowana rola.                   │
├──────────────────────┼──────────────────────────────────┤
│ Radny (Członek)      │ Potwierdza obecność, głosuje,      │
│                      │ widzi porządek i materiały.         │
├──────────────────────┼──────────────────────────────────┤
│ Protokolant          │ Uzupełnia notatki z dyskusji       │
│                      │ w auto-generowanym szkielecie.     │
├──────────────────────┼──────────────────────────────────┤
│ Komisja Rewizyjna    │ Read-only: logi głosowań,          │
│                      │ protokoły, uchwały, obecności.     │
├──────────────────────┼──────────────────────────────────┤
│ Obserwator           │ Widzi porządek obrad i wyniki      │
│                      │ głosowań (publiczna strona).       │
└──────────────────────┴──────────────────────────────────┘
```

---

## 4. Model danych (Supabase/PostgreSQL)

### 4.1 Instancja i konfiguracja

```sql
-- Instancja organizacji (neutralna — dziś RUSS UEW, jutro inna uczelnia)
CREATE TABLE organizations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,                    -- "Samorząd Studentów UEW"
  slug          TEXT UNIQUE NOT NULL,             -- "uew" → uew.radastudentow24.pl
  logo_url      TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Organ w ramach organizacji
CREATE TABLE organs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID REFERENCES organizations(id),
  name          TEXT NOT NULL,                    -- "Rada Uczelniana Samorządu Studentów"
  short_name    TEXT NOT NULL,                    -- "RUSS"
  total_seats   INT NOT NULL,                     -- 16
  quorum_type   TEXT DEFAULT 'majority',          -- 'majority' | 'two_thirds' | 'custom'
  quorum_value  NUMERIC,                          -- null for majority (auto > 50%), or custom number
  resolution_prefix TEXT DEFAULT 'Uchwała',       -- prefix numeracji
  resolution_pattern TEXT DEFAULT '{nr}/{kadencja}/{organ}',
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Kadencja
CREATE TABLE terms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organ_id      UUID REFERENCES organs(id),
  label         TEXT NOT NULL,                    -- "2025-2026"
  starts_at     DATE NOT NULL,
  ends_at       DATE NOT NULL,
  is_active     BOOLEAN DEFAULT true,
  resolution_counter INT DEFAULT 0               -- auto-increment per kadencja
);
```

### 4.2 Użytkownicy i mandaty

```sql
-- Profil użytkownika (Supabase Auth linkowany)
CREATE TABLE profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id),
  full_name     TEXT NOT NULL,
  email         TEXT NOT NULL,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Mandat — kto zasiada w organie w danej kadencji
CREATE TABLE mandates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id       UUID REFERENCES terms(id),
  profile_id    UUID REFERENCES profiles(id),
  role          TEXT NOT NULL DEFAULT 'member',   -- 'chair' | 'member' | 'auditor' | 'secretary' | 'election_committee'
  label         TEXT,                             -- "Przewodniczący RUSS", "Radny", "Komisja Rewizyjna"
  is_active     BOOLEAN DEFAULT true,
  granted_at    TIMESTAMPTZ DEFAULT now(),
  revoked_at    TIMESTAMPTZ,
  UNIQUE(term_id, profile_id)
);
```

### 4.3 Posiedzenia

```sql
CREATE TABLE sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organ_id      UUID REFERENCES organs(id),
  term_id       UUID REFERENCES terms(id),
  title         TEXT NOT NULL,                    -- "III Posiedzenie RUSS 2025-2026"
  session_type  TEXT DEFAULT 'regular',           -- 'regular' | 'extraordinary'
  mode          TEXT DEFAULT 'in_person',          -- 'in_person' | 'remote' | 'hybrid'
  scheduled_at  TIMESTAMPTZ NOT NULL,
  location      TEXT,
  opened_at     TIMESTAMPTZ,                      -- faktyczne otwarcie
  closed_at     TIMESTAMPTZ,                      -- faktyczne zamknięcie
  status        TEXT DEFAULT 'draft',             -- 'draft' | 'scheduled' | 'in_progress' | 'closed' | 'protocol_pending' | 'archived'
  chaired_by    UUID REFERENCES profiles(id),     -- kto prowadzi (domyślnie Przewodniczący, ale może SKW)
  protocol_by   UUID REFERENCES profiles(id),     -- kto protokołuje
  created_by    UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Obecność
CREATE TABLE attendance (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID REFERENCES sessions(id),
  mandate_id    UUID REFERENCES mandates(id),
  status        TEXT DEFAULT 'absent',            -- 'present' | 'absent' | 'late' | 'excused' | 'left_early'
  checked_in_at TIMESTAMPTZ,
  checked_out_at TIMESTAMPTZ,
  UNIQUE(session_id, mandate_id)
);
```

### 4.4 Porządek obrad

```sql
CREATE TABLE agenda_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID REFERENCES sessions(id),
  position      INT NOT NULL,                     -- kolejność
  title         TEXT NOT NULL,                     -- "Rozpatrzenie projektu uchwały w sprawie..."
  item_type     TEXT DEFAULT 'discussion',         -- 'procedural' | 'discussion' | 'resolution' | 'election' | 'information'
  description   TEXT,
  status        TEXT DEFAULT 'pending',            -- 'pending' | 'in_progress' | 'completed' | 'postponed'
  discussion_notes TEXT,                           -- uzupełniane przez protokolanta w trakcie/po
  started_at    TIMESTAMPTZ,
  ended_at      TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Materiały/załączniki do punktów
CREATE TABLE agenda_attachments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_item_id UUID REFERENCES agenda_items(id),
  file_name     TEXT NOT NULL,
  file_url      TEXT NOT NULL,                     -- Supabase Storage URL
  file_type     TEXT,                              -- 'pdf' | 'docx' | 'image' | 'other'
  uploaded_by   UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ DEFAULT now()
);
```

### 4.5 Głosowania (serce systemu)

```sql
CREATE TABLE votes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_item_id UUID REFERENCES agenda_items(id),
  session_id    UUID REFERENCES sessions(id),
  title         TEXT NOT NULL,                     -- "Głosowanie nad przyjęciem uchwały nr..."
  vote_type     TEXT NOT NULL DEFAULT 'open',      -- 'open' (imienne) | 'secret' (anonimowe)
  threshold     TEXT DEFAULT 'simple_majority',    -- 'simple_majority' | 'absolute_majority' | 'two_thirds'
  status        TEXT DEFAULT 'pending',            -- 'pending' | 'open' | 'closed' | 'cancelled'
  opened_at     TIMESTAMPTZ,
  closed_at     TIMESTAMPTZ,

  -- Wyniki (wypełniane po zamknięciu)
  votes_for     INT DEFAULT 0,
  votes_against INT DEFAULT 0,
  votes_abstain INT DEFAULT 0,
  total_eligible INT DEFAULT 0,                    -- ilu obecnych mogło głosować
  result        TEXT,                              -- 'passed' | 'rejected' | 'no_quorum'
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Pojedynczy głos
CREATE TABLE ballots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vote_id       UUID REFERENCES votes(id),
  mandate_id    UUID REFERENCES mandates(id),      -- NULL dla głosowania tajnego (wiemy ŻE głosował, nie JAK)
  choice        TEXT NOT NULL,                     -- 'for' | 'against' | 'abstain'
  cast_at       TIMESTAMPTZ DEFAULT now(),

  -- Dla głosowania jawnego: mandate_id NOT NULL
  -- Dla głosowania tajnego: mandate_id NULL, ale osobna tabela secret_ballot_receipts
  UNIQUE(vote_id, mandate_id)                      -- jeden głos per osoba per głosowanie
);

-- Potwierdzenie udziału w głosowaniu tajnym (bez ujawniania wyboru)
CREATE TABLE secret_ballot_receipts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vote_id       UUID REFERENCES votes(id),
  mandate_id    UUID REFERENCES mandates(id),
  cast_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE(vote_id, mandate_id)
);
```

### 4.6 Uchwały i protokoły

```sql
CREATE TABLE resolutions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vote_id       UUID REFERENCES votes(id),         -- powiązanie z głosowaniem
  session_id    UUID REFERENCES sessions(id),
  term_id       UUID REFERENCES terms(id),
  number        INT NOT NULL,                      -- 20
  signature     TEXT NOT NULL,                     -- "Uchwała 20/2025-2026/RUSS"
  title         TEXT NOT NULL,                     -- "w sprawie zatwierdzenia budżetu..."
  body          TEXT NOT NULL,                     -- treść uchwały (Markdown lub HTML)
  legal_basis   TEXT,                              -- "Na podstawie §X Regulaminu SSUEW..."
  status        TEXT DEFAULT 'draft',              -- 'draft' | 'adopted' | 'published' | 'revoked'
  signed_by     UUID REFERENCES profiles(id),      -- Przewodniczący
  signed_at     TIMESTAMPTZ,
  pdf_url       TEXT,                              -- wygenerowany PDF
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE protocols (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID REFERENCES sessions(id) UNIQUE,
  status        TEXT DEFAULT 'draft',              -- 'draft' | 'review' | 'approved' | 'published'
  generated_at  TIMESTAMPTZ,                       -- kiedy system wygenerował szkielet
  body          TEXT,                              -- pełna treść (Markdown) — auto + ręczne notatki
  signed_by     UUID REFERENCES profiles(id),
  signed_at     TIMESTAMPTZ,
  pdf_url       TEXT,
  approved_at   TIMESTAMPTZ,                       -- zatwierdzenie na kolejnym posiedzeniu
  created_at    TIMESTAMPTZ DEFAULT now()
);
```

### 4.7 Logi audytowe (dla Komisji Rewizyjnej)

```sql
CREATE TABLE audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID REFERENCES organizations(id),
  actor_id      UUID REFERENCES profiles(id),
  action        TEXT NOT NULL,                     -- 'session.opened' | 'vote.opened' | 'ballot.cast' | 'resolution.signed' ...
  target_type   TEXT,                              -- 'session' | 'vote' | 'resolution' | 'attendance'
  target_id     UUID,
  metadata      JSONB,                             -- dodatkowe dane kontekstowe
  ip_address    INET,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Indeks dla Komisji Rewizyjnej
CREATE INDEX idx_audit_log_org_created ON audit_log(org_id, created_at DESC);
```

---

## 5. Flow MVP — posiedzenie od A do Z

```
PRZED POSIEDZENIEM
──────────────────
1. Przewodniczący tworzy posiedzenie w systemie
   → ustala datę, typ (zwyczajne/nadzwyczajne), tryb (stacjonarne/zdalne)

2. Przewodniczący dodaje porządek obrad
   → punkty z typem (dyskusja, uchwała, proceduralne)
   → załącza materiały do punktów

3. System wysyła powiadomienie do Radnych
   → email + opcjonalnie webhook do Messengera
   → "Posiedzenie RUSS 15.07, porządek obrad dostępny w systemie"

4. Radni przeglądają agendę i materiały w aplikacji

W TRAKCIE POSIEDZENIA
─────────────────────
5. Przewodniczący otwiera posiedzenie
   → Radni potwierdzają obecność (check-in na telefonie)
   → System liczy kworum w czasie rzeczywistym
   → Brak kworum? → czerwony alert, posiedzenie nie może procedować

6. Punkt po punkcie:
   a) Przewodniczący otwiera punkt
   b) Dyskusja (protokolant notuje)
   c) Jeśli punkt uchwałodawczy → Przewodniczący otwiera głosowanie
      → Radni głosują na telefonie (za/przeciw/wstrzymuję się)
      → Wynik wyświetla się natychmiast na ekranie prowadzącego
      → Głosowanie jawne: widać kto jak głosował
      → Głosowanie tajne: widać tylko wynik liczbowy
   d) Przewodniczący zamyka punkt

7. Przewodniczący zamyka posiedzenie

PO POSIEDZENIU
──────────────
8. System generuje szkielet protokołu
   → lista obecności, kworum, porządek obrad
   → wyniki wszystkich głosowań
   → puste pola "przebieg dyskusji" do uzupełnienia

9. Protokolant uzupełnia notatki z dyskusji

10. System generuje uchwały (PDF)
    → z danymi z głosowania, numeracją, podpisem Przewodniczącego

11. Protokół i uchwały → do zatwierdzenia na kolejnym posiedzeniu

12. Komisja Rewizyjna ma dostęp do logów audytowych
```

---

## 6. Stack techniczny

| Warstwa | Technologia | Uzasadnienie |
|---------|-------------|--------------|
| Frontend | **Next.js 15 + Tailwind CSS** | Spójny z doświadczeniem Mikołaja, SSR dla SEO publicznych uchwał |
| Backend/DB | **Supabase (PostgreSQL + Auth + Storage + Realtime)** | Realtime channels kluczowe dla live voting |
| Hosting | **Vercel** | Szybki deploy, preview branches |
| PDF generation | **@react-pdf/renderer** lub **puppeteer** | Generacja uchwał i protokołów |
| Auth | **Supabase Auth (magic link)** | Studenci nie pamiętają haseł — link na maila |
| Realtime voting | **Supabase Realtime (Broadcast)** | Głosy widoczne natychmiast u prowadzącego |

---

## 7. Widoki MVP (ekrany)

### Dla Przewodniczącego / Prowadzącego:
1. **Dashboard** — lista posiedzeń (nadchodzące, w trakcie, archiwalne)
2. **Edytor posiedzenia** — porządek obrad, materiały, ustawienia
3. **Panel prowadzenia** — live view: obecność, kworum, otwieranie punktów i głosowań
4. **Wyniki głosowania** — real-time, pełny ekran (do rzutnika na sali)

### Dla Radnego:
5. **Moje posiedzenia** — agenda, materiały do przeczytania
6. **Ekran głosowania** — duże przyciski ZA / PRZECIW / WSTRZYMUJĘ SIĘ
7. **Check-in** — potwierdzenie obecności

### Dla Protokolanta:
8. **Edytor protokołu** — auto-szkielet + pola do uzupełnienia

### Dla Komisji Rewizyjnej:
9. **Logi audytowe** — filtrowalne po posiedzeniu, typie akcji, dacie

### Publiczny:
10. **Rejestr uchwał** — lista uchwalonych aktów z PDF do pobrania

---

## 8. Harmonogram — lato 2026

| Tydzień | Daty | Faza | Deliverable |
|---------|------|------|-------------|
| 0 | 27.06 | ✅ Faza 0 | Ten dokument |
| 1 | 30.06–06.07 | Faza 1a | Supabase schema, Auth (magic link), role/RLS |
| 2 | 07.07–13.07 | Faza 1b | UI: dashboard, edytor posiedzenia, porządek obrad |
| 3 | 14.07–20.07 | Faza 1c | **Głosowanie realtime** — serce MVP |
| 4 | 21.07–27.07 | Faza 2a | Auto-protokół (szkielet) + edytor dla protokolanta |
| 5 | 28.07–03.08 | Faza 2b | Generator uchwał (PDF) + rejestr uchwał |
| 6 | 04.08–10.08 | Faza 2c | Panel Komisji Rewizyjnej, audit log, polish |
| 7 | 11.08–17.08 | Faza 3a | **Pilot — test na realnym/symulowanym posiedzeniu RUSS** |
| 8 | 18.08–31.08 | Faza 3b | Bugfix, UX feedback, dokumentacja |

---

## 9. Decyzje architektoniczne — neutralność rdzenia

Cała logika jest **org_id-scoped**. Nic w kodzie nie jest hardcoded na "RUSS" czy "UEW".
Nazewnictwo, progi, numeracja — wszystko w tabelach `organs` i `terms`.

To znaczy, że po pilocie na RUSS UEW, uruchomienie instancji dla innej uczelni
to dosłownie: nowy wiersz w `organizations` + `organs` + `terms` + zaproszenie użytkowników.

Przyszła warstwa FUE mogłaby być dashboardem cross-organization (porównanie frekwencji,
benchmarking aktywności organów), ale to jest post-MVP.

---

## 10. Ryzyka i otwarte pytania

| Ryzyko | Mitygacja |
|--------|-----------|
| Brak internetu na sali RUSS | Tryb offline z sync? Dla MVP: wymagany internet, ale mobilny hotspot jako fallback |
| Głosowanie tajne — czy technicznie anonimowe wystarczy prawnie? | Konsultacja z opiekunem prawnym SS lub wzorowanie na eSesja |
| Przewodniczący nie chce używać nowego narzędzia | Pilot z buy-in Przewodniczącego od początku — Mikołaj jako wdrożeniowiec |
| Protokolant i tak musi pisać notatki z dyskusji | System redukuje pracę o ~60-70%, nie o 100%. Ale to i tak game-changer |
| Czas — 8 tygodni to ambitnie | Priorytet: głosowanie > protokół > uchwały. Lepiej mieć działające głosowanie bez PDF-ów niż nic |
