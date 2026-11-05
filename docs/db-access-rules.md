# Uprawnienia w bazie: zasady dla nowych migracji

Każde uprawnienie w systemie sprowadza się do pytania: **czy ta osoba ma aktywny
mandat w tej kadencji?** Odpowiadają na nie gotowe funkcje pomocnicze. Reguły
RLS i funkcje `SECURITY DEFINER` mają z nich korzystać, a nie sprawdzać tabelę
`mandates` ręcznie.

Trzy luki bezpieczeństwa wzięły się dokładnie z ręcznego sprawdzania mandatu bez
pełnego warunku:

| Migracja | Co było nie tak |
|---|---|
| 025 | `cast_ballot` nie sprawdzał, czy mandat jest z kadencji posiedzenia |
| 030 | samodzielna obecność, kolejka mówców i pokwitowania KR akceptowały mandat nieaktywny lub z innej kadencji (zawyżone kworum) |
| 031 | dostęp do organizacji i prawa admina z mandatu w dowolnej, także zakończonej, kadencji |

## Funkcje pomocnicze

Wszystkie uwzględniają superadmina (`is_platform_admin()`) i wymagają
`mandates.is_active`.

| Funkcja | Zwraca prawdę, gdy osoba… | Zakres |
|---|---|---|
| `user_has_org_access(org_id)` | ma aktywny mandat w **aktywnej** kadencji organizacji | organizacja |
| `user_is_org_admin(org_id)` | jak wyżej, z rolą `admin` | organizacja |
| `get_user_org_ids()` | lista organizacji jak w `user_has_org_access` | organizacja |
| `user_in_term(term_id)` | ma aktywny mandat w tej kadencji | kadencja |
| `user_can_manage_term(term_id)` | jak wyżej, z rolą `admin` lub `chair` | kadencja |
| `user_can_manage_session(session_id)` | `admin`/`chair` w kadencji posiedzenia albo jest jego prowadzącym (`chaired_by`) | posiedzenie |
| `user_can_write_protocol(session_id)` | może prowadzić posiedzenie, jest protokolantem (`secretary`) albo `protocol_by` | posiedzenie |
| `get_user_role(term_id)` | rola w tej kadencji (do wyświetlania, nie do decyzji o dostępie) | kadencja |

Aplikacja liczy to samo w `getOrgContext()` ([src/lib/org.ts](../src/lib/org.ts)).
Zmieniając jedną stronę, zmień drugą, inaczej UI pokaże przycisk, którego baza
nie przepuści (albo odwrotnie: baza przepuści, czego UI nie pokazuje).

## Zasady

1. **Użyj funkcji pomocniczej.** Nowa reguła RLS ma wyglądać jak
   `USING (user_in_term(term_id))` albo `user_can_manage_session(session_id)`.
2. **„Mój wiersz” to nie wszystko.** Gdy wiersz należy do mandatu
   (`mandate_id`), sprawdź naraz trzy rzeczy: mandat jest mój
   (`m.profile_id = auth.uid()`), jest aktywny (`m.is_active`) i jest z kadencji
   tego posiedzenia lub ankiety (`JOIN sessions s ON s.term_id = m.term_id`).
   Wzór: polityka `attendance_upsert` w migracji 030.
3. **Funkcja `SECURITY DEFINER` sprawdza uprawnienia sama.** Omija RLS, więc musi
   zweryfikować `auth.uid()` i mandat w kadencji, zanim cokolwiek zapisze. Zawsze
   `SET search_path = public` oraz `REVOKE … FROM PUBLIC, anon` i
   `GRANT EXECUTE … TO authenticated`.
4. **Wyniki zapisuje tylko serwer.** Liczby głosów, wynik i frekwencję zapisują
   `cast_*` i `tally_vote*`. Wyzwalacz `guard_vote_integrity` (migracja 029)
   blokuje to dla wywołań z API, więc nowe kolumny wyników dopisz do jego listy.
5. **Tajność to brak danych, nie brak uprawnień.** W głosowaniu tajnym nie zapisuj
   nigdzie pary osoba i wybór, nawet w tabeli bez polityki odczytu (migracja 027).
   Głosowanie jawne pokazuje wybory dopiero po zamknięciu (migracja 028).
6. **Rejestr zdarzeń bez treści głosu.** `log_audit` zapisuje fakt („oddano głos”),
   nigdy wybór.

## Jak sprawdzić nową regułę

Test na prawdziwej bazie w transakcji, która się wycofuje. Nic nie zostaje.

```sql
begin;
create temp table probe_out(step text, ok bool, detail text) on commit drop;
grant all on probe_out to authenticated;
-- przygotowanie danych jako właściciel (np. dezaktywacja mandatu, stara kadencja)
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '<profile_id>', 'role', 'authenticated')::text, true);
  begin
    insert into attendance (session_id, mandate_id, status) values ('<s>', '<m>', 'present');
    insert into probe_out values ('nieaktywny mandat nie melduje obecności', false, 'przepuszczono!');
  exception when others then
    insert into probe_out values ('nieaktywny mandat nie melduje obecności', true, sqlerrm);
  end;
end $$;
reset role;
select * from probe_out;
rollback;
```

Uruchom: `npx supabase db query --linked -f plik.sql --output-format json`.

Do testu wybieraj osoby spoza `platform_admins`: superadmin z założenia widzi
wszystko, więc z nim test zawsze „przechodzi”.

Minimum dla każdej nowej reguły:
- osoba z aktywnym mandatem we właściwej kadencji może;
- osoba z mandatem nieaktywnym nie może;
- osoba z mandatem z innej kadencji (albo innej organizacji) nie może.
