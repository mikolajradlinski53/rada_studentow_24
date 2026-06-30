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
- **TODO v2:** przekucie wniosku formalnego w szybkie głosowanie proceduralne
  (dziś prowadzący przyjmuje/odrzuca decyzją); timer dla „przedłużenia czasu".

### B. Wybory kandydatów
Głosowanie wyboru osoby/osób z listy (Zarząd, komisje, ławnicy) — wiele opcji,
próg, wiele mandatów do obsadzenia. Wzorzec eSesji „wybory".

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
- **TODO v2:** **publiczny rejestr** (portal mieszkańca, anon RLS + trasa publiczna),
  generowany PDF (`@react-pdf/renderer`) zamiast druku, e-podpis.

### E. Komisja Rewizyjna — realny audit log  ✅ ZROBIONE (v1)
Funkcja `log_audit` (SECURITY DEFINER, jedyna ścieżka zapisu — bezpośrednie
INSERT-y zablokowane RLS): stempluje `actor_id`, wyprowadza `org_id` z celu.
Logowane zdarzenia: `session.opened/closed`, `vote.opened/closed`, `ballot.cast`
(tylko udział, nigdy wybór — anonimowość tajnych zachowana), `protocol.generated`,
`resolution.created/signed/published`. Panel `/[org]/audit` (admin/chair/auditor)
pokazuje czas, osobę, akcję i podpowiedź (sygnatura / typ głosowania).
- **TODO v2:** filtry (po typie/dacie/posiedzeniu), `attendance.checked_in`,
  zdarzenia dyskusji, eksport.

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
