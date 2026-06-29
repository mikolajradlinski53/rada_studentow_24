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

### A. Głos i dyskusja (kolejka mówców) + wnioski proceduralne  ← NASTĘPNE
Realtime, mobilny. Tabela `floor_requests` (typ/status/kolejność), RLS, realtime.
- Radny z telefonu: **„✋ Zgłoś się do głosu"** — typy: *zabranie głosu*, *ad vocem*,
  oraz **wnioski formalne/proceduralne**: o **przerwę** w posiedzeniu, o
  **przedłużenie czasu** (np. na pytania w absolutorium), o zamknięcie listy mówców,
  o reasumpcję. Może wycofać zgłoszenie.
- Prowadzący: **kolejka mówców na żywo**; „Udziel głosu" → „Zakończ". Wniosek
  formalny wyróżniony i z pierwszeństwem; prowadzący może go **przekuć w szybkie
  głosowanie proceduralne** (np. „czy przegłosować przerwę 10 min?").
- Wnioski czasowe (przerwa / przedłużenie) niosą parametr (np. minuty); po
  przyjęciu uruchamiają widoczny **timer** na panelu i rzutniku.
- Rzutnik: „GŁOS MA: *Imię Nazwisko*" + kolejka + ewentualny timer przerwy.

### B. Wybory kandydatów
Głosowanie wyboru osoby/osób z listy (Zarząd, komisje, ławnicy) — wiele opcji,
próg, wiele mandatów do obsadzenia. Wzorzec eSesji „wybory".

### C. Auto-protokół  (największy zabójca papierologii — nasza przewaga)
Po zamknięciu posiedzenia generowany szkielet: lista obecności, kworum, porządek,
**wyniki wszystkich głosowań** (z imienną listą przy jawnych), wnioski formalne i
ich rozstrzygnięcia, przerwy. Pola „przebieg dyskusji" do uzupełnienia przez
protokolanta. Statusy draft → review → approved.

### D. Uchwały (PDF) + rejestr publiczny
Z głosowania `passed` → uchwała z numeracją (`next_resolution_number`), formatka
PDF z danymi z głosowania i podpisem, publiczny rejestr do pobrania (portal
mieszkańca — nasza przewaga nad zamkniętym eSesją).

### E. Komisja Rewizyjna — realny audit log
Zapis zdarzeń (`session.opened`, `vote.opened`, `ballot.cast`, …) server-side do
`audit_log`, filtrowalny panel read-only. Dziś tabela i RLS gotowe, brak zapisu.

### F. Transmisja (YouTube) + nakładki
Embed transmisji na stronie posiedzenia/rzutniku, nakładki: aktualny punkt, mówca,
wyniki głosowania. Wzorzec eSesji „transmisja".

## 🎨 Indywidualny interfejs per-podmiot (przekrojowe, rozwijane stopniowo)

Każdy tenant (RUSS UEW, URSS, Komisja Branżowa PSRP, …) ma czuć, że to **jego**
system. Mamy fundament (akcent, logo, moduły); rozwijamy do pełnego brandingu:

- **Theming**: akcent + logo już są; dołożyć paletę (tło/akcent/kontrast),
  favicon/nazwę w `<title>`, opcjonalnie własną typografię. Token `--accent`
  przeniknięty do komponentów (przyciski, aktywne stany, paski).
- **Panel brandingu w `/[org]/admin`**: admin podmiotu sam ustawia logo (Supabase
  Storage), kolory, nazwę wyświetlaną, włączone moduły — bez ingerencji w kod.
- **Domeny**: dziś `/[org]` (slug). Później **subdomeny** `uew.radastudentow24.pl`
  jako rewrite w `proxy.ts` (slug już w bazie), a docelowo **własne domeny**
  podmiotów (CNAME) — pełne white-label.
- **Treści per-org**: własne wzorce numeracji uchwał, nazewnictwo ról/organów,
  regulaminowe progi (kworum, większości) — częściowo w `organs`/`terms`, do
  wyklikania w panelu.
- **Izolacja**: każdy widzi wyłącznie swój `/[org]` (RLS + `getOrgContext`) —
  fundament pod dziesiątki niezależnych instancji w jednym wdrożeniu.

## 🧩 Drobne polish (na bieżąco)
- ✅ Rzutnik przy głosowaniu jawnym pokazuje **kto jak zagłosował** (tajne — nie).
- Obecność: statusy `late`/`excused`/`left_early` + check-out w UI.
- Lint debt: pre-existing `any` casts, set-state-in-effect na live page.
