# RadaStudentów24 — Roadmap

> Globalny multi-tenant SaaS do obsługi posiedzeń organów samorządu studenckiego.
> Wzorzec konkurencji: **eSesja** (parytet funkcji + wyprzedzenie: automatyzacja,
> poprawna anonimowość, self-serve SaaS). Docelowo: kilkadziesiąt RUSS-ów, URSS-ów,
> Komisji Branżowych PSRP — każdy jako osobny, izolowany tenant z własnym wyglądem.

## ✅ Zrobione

- **Rdzeń bezpieczeństwa**: kworum egzekwowane w `tally_vote`, tajne głosowanie
  poprawnie anonimowe (rozdzielony głos/kwit, brak korelacji czasu), audit log
  tylko server-side, auth magic-link (token_hash + PKCE), Next 16 `proxy.ts`.
- **Multi-tenant**: routing `/[org]`, izolacja przez RLS + `getOrgContext`,
  branding (akcent, logo) i `enabled_modules` per-org, przełącznik organizacji.
- **Bootstrap & admin**: tabela `invitations`, onboarding przez trigger (mandat
  przy 1. logowaniu), panel `/[org]/admin` (zaproszenia, role, deaktywacja).
- **Posiedzenia**: tworzenie, porządek obrad, start, check-in, głosowanie
  jawne/tajne z **live tally**, **widok rzutnikowy** (pełny ekran), responsywny
  interfejs mobilny (drawer nav, duże przyciski głosowania).

## 🔜 Następne moduły

### A. Głos i dyskusja (kolejka mówców) + wnioski proceduralne  ✅ ZROBIONE (v1)
Tabela `floor_requests` (typ/status/kolejność), `sessions.on_break_until`, RLS, realtime.
- Radny z telefonu: **„✋ Zabierz głos"**, **Ad vocem**, **Wniosek formalny**
  (przerwa / przedłużenie czasu / zamknięcie listy / reasumpcja / inny; z parametrem
  minut i uzasadnieniem). Może wycofać zgłoszenie.
- Prowadzący: **kolejka mówców na żywo** (formalne z pierwszeństwem, wyróżnione);
  „Udziel głosu" → „Zakończ"; „Przyjmij/Odrzuć" wniosek. Przyjęcie **przerwy**
  uruchamia **timer** (`on_break_until`) z odliczaniem na panelu i rzutniku.
- Rzutnik: „GŁOS MA: *Imię Nazwisko*" + kolejka + wielkie odliczanie przerwy.
- ✅ **Głosowanie proceduralne z wniosku**: przy wniosku formalnym prowadzący ma
  „Głosuj" → tworzy szybkie **jawne** głosowanie (`Wniosek formalny: …`); po
  przyjęciu chair klika „Przyjmij", co go wykonuje (np. odpala przerwę).
- **TODO v2:** timer dla „przedłużenia czasu"; auto-wykonanie wniosku po
  przegłosowaniu (dziś dwa kroki: Głosuj → Przyjmij).

### B. Wybory kandydatów  ✅ ZROBIONE (v1, anonimowe, jednokrotny wybór)
Punkt porządku typu „Wybory" → prowadzący otwiera wybory (lista kandydatów +
liczba miejsc). Radni wybierają **jednego** kandydata; głos **anonimowy** (RPC
`cast_election_ballot` — niepowiązany głos + kwit do dedupe, turnout w
`secret_cast_count`). Po zamknięciu: wynik per-kandydat, **top-`seats` = wybrani**.
Live panel + rzutnik (kandydaci + turnout na żywo, zwycięzcy po zamknięciu).
Tabele `vote_candidates`, `election_ballots`; `votes.vote_kind`/`seats`.
- ✅ **Wybór wielokrotny**: przy `seats > 1` radny zaznacza **do N** kandydatów
  (checkboxy + „Oddaj głos"); RPC `cast_election_ballots(uuid[])` waliduje 1..seats,
  brak duplikatów, przynależność do głosowania; jeden kwit/turnout na wyborcę.
- **TODO v2:** wariant jawny/imienny, próg wyboru / druga tura.

### C. Auto-protokół  ✅ ZROBIONE (v1, bez transkrypcji/PDF)
Generowanie strukturalnego szkicu (Markdown) z danych posiedzenia: nagłówek,
kworum, lista obecności (obecni/nieobecni), porządek + miejsca na „przebieg
dyskusji", **wszystkie głosowania** (imienne listy przy jawnych), wnioski formalne.
Edytor dla prowadzącego/protokolanta (textarea), statusy draft → review →
approved → published, „Generuj/Regeneruj szkielet". Strona
`/[org]/sessions/[id]/protocol`, używa istniejącej tabeli `protocols`.
- **TODO v2:** transkrypcja (Whisper/STT, sekcja niżej) wstrzykiwana w „przebieg
  dyskusji" + przypisanie po kolejce mówców; eksport **PDF**; podpis; edycja przez
  rolę `secretary` (dziś prowadzący/admin) przez wiring `protocol_by`.

**Transkrypcja mowy (Whisper / STT) jako *pluggable* źródło dyskusji:**
- Cel: zredukować ręczne spisywanie „przebiegu dyskusji". Źródło transkrypcji
  abstrakcyjne (interfejs), żeby wymieniać silnik bez zmian w protokole.
- Whisper nie jest natywnie streamingowy i real-time na większym modelu wymaga
  GPU — **nie zhostuje go Vercel**. Stąd etapy:
  1. **Batch po posiedzeniu** (start): nagranie audio → faster-whisper (self-host)
     lub Whisper API → tekst do szkicu protokołu. Maks. wartości, min. infry.
  2. **Streaming STT** (Deepgram/AssemblyAI/Azure) lub WhisperLive na GPU — napisy
     na żywo na panelu/rzutniku.
  3. **Self-host Whisper na GPU** (Modal/RunPod/własny box) gdy ważna prywatność/koszt.
- **Synergia z modułem A:** kolejka mówców daje „kto i od kiedy mówi" → znaczniki
  czasu kolejki × transkrypcja = **automatyczne przypisanie fragmentów do radnego**
  bez diaryzacji głosu. To kluczowa przewaga auto-protokołu.
- **Prawne:** nagrywanie/transkrypcja wymaga poinformowania uczestników
  (zgoda/regulamin) — komunikat w systemie + zapis zgody.

### D. Uchwały  ✅ ZROBIONE (v1; rejestr publiczny = v2)
Z przyjętego głosowania (`passed`) → **„Utwórz uchwałę"** na stronie posiedzenia:
numeracja przez `next_resolution_number`, sygnatura z wzorca organu
(`Uchwała {nr}/{kadencja}/{organ}`). Edytor (tytuł „w sprawie…", podstawa prawna,
treść §, status draft → adopted → published → revoked; ustawienie „Uchwalona"
**podpisuje** — signed_by/at). **Wersja do druku** `/[org]/resolutions/[id]/print`
(czysty dokument na białym tle, nav `print:hidden`) → przeglądarka „Zapisz jako PDF".
Rejestr `/[org]/resolutions` linkuje do edytora i druku.
- ✅ **Publiczny rejestr** (portal mieszkańca): `/[org]/rejestr` (lista) i
  `/[org]/rejestr/[id]` (dokument), **bez logowania** — proxy traktuje `rejestr`
  jako trasę publiczną, RLS wystawia tylko uchwały `published` + dane organizacji.
  `resolutions.org_id` zdenormalizowany, by anon mógł filtrować bez czytania
  sessions/organs. Wspólny komponent `ResolutionDocument` (druk + publiczny).
- **TODO v2:** generowany PDF (`@react-pdf/renderer`) zamiast druku, e-podpis,
  nazwisko podpisującego w publicznym dokumencie (denormalizacja).

### E. Komisja Rewizyjna — realny audit log  ✅ ZROBIONE (v1)
Funkcja `log_audit` (SECURITY DEFINER, jedyna ścieżka zapisu — bezpośrednie
INSERT-y zablokowane RLS): stempluje `actor_id`, wyprowadza `org_id` z celu.
Logowane zdarzenia: `session.opened/closed`, `vote.opened/closed`, `ballot.cast`
(tylko udział, nigdy wybór — anonimowość tajnych zachowana), `protocol.generated`,
`resolution.created/signed/published`. Panel `/[org]/audit` (admin/chair/auditor)
pokazuje czas, osobę, akcję i podpowiedź (sygnatura / typ głosowania).
- ✅ **Filtry**: po typie akcji + zakresie dat (URL searchParams, `AuditFilters`),
  limit 200.
- ✅ **Eksport CSV** (bieżące filtry, do 5000 wpisów; BOM dla Excela/PL) —
  `lib/csv.ts` (współdzielony helper) + `ExportCsvButton`.
- **TODO v2:** filtr po posiedzeniu, `attendance.checked_in`, zdarzenia dyskusji.

### F. Transmisja (YouTube)  ✅ ZROBIONE (v1, bez nakładek)
`sessions.stream_url`; prowadzący ustawia link YouTube w panelu live (embed
widoczny dla zdalnych radnych). **Publiczna strona** `/[org]/transmisja/[id]`
(bez logowania — RLS wystawia sesje, które opublikowały stream) z osadzonym
odtwarzaczem. Parser `youtubeId` (watch/live/youtu.be/embed/shorts).
- **TODO v2:** nakładki na stronie publicznej (aktualny punkt, mówca, wynik
  głosowania na żywo) — wymaga publicznego odczytu agendy/głosowań (anon RLS).

## 🎨 Indywidualny interfejs per-podmiot (przekrojowe, rozwijane stopniowo)

Każdy tenant (RUSS UEW, URSS, Komisja Branżowa PSRP, …) ma czuć, że to **jego**
system. Mamy fundament (akcent, logo, moduły); rozwijamy do pełnego brandingu:

- ✅ **Panel brandingu w `/[org]/admin`**: admin podmiotu sam ustawia **nazwę,
  kolor akcentu, logo (URL), włączone moduły** — bez ingerencji w kod (RLS
  `org_admin_update`). Sidebar renderuje logo + akcent na aktywnej pozycji menu;
  `enabled_modules` steruje widocznością zakładek.
- **Theming (rozwój)**: przeniknąć token `--accent` do większej liczby komponentów
  (przyciski, paski, kropka „na żywo"), favicon/`<title>` per-org, własna
  typografia; **upload logo do Supabase Storage** zamiast URL.
- **Domeny**: dziś `/[org]` (slug). Później **subdomeny** `uew.radastudentow24.pl`
  jako rewrite w `proxy.ts` (slug już w bazie), a docelowo **własne domeny**
  podmiotów (CNAME) — pełne white-label.
- **Treści per-org**: własne wzorce numeracji uchwał, nazewnictwo ról/organów,
  regulaminowe progi (kworum, większości) — częściowo w `organs`/`terms`, do
  wyklikania w panelu.
- **Izolacja**: każdy widzi wyłącznie swój `/[org]` (RLS + `getOrgContext`) —
  fundament pod dziesiątki niezależnych instancji w jednym wdrożeniu.

## 🧩 Drobne polish (na bieżąco)
- ✅ **Imię i nazwisko** zamiast fragmentu maila: admin podaje nazwę przy
  zaproszeniu (`invitations.full_name` → trigger), a każdy użytkownik może
  poprawić własne dane na `/[org]/profile` (link w sidebarze).
- ✅ Rzutnik przy głosowaniu jawnym pokazuje **kto jak zagłosował** (tajne — nie).
- ✅ **Lista obecności prowadzącego (roll call)** + tryb `attendance_mode`
  (`chair`/`self`): przy stacjonarnym to prowadzący wpisuje obecnych, a RLS blokuje
  samodzielne odhaczanie się (zdalny radny nie „wejdzie" na głosowanie). Statusy
  present/late/excused/absent w UI.
- ✅ Check-out (`left_early`) w liście obecności (ustawia `checked_out_at`, nie
  liczy się do kworum) + **eksport CSV** listy obecności (nazwisko/status/wejście/wyjście).
- Lint debt: pre-existing `any` casts, set-state-in-effect na live page.
