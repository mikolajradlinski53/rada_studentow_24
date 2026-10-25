# Supabase CLI — migracje bez SQL Editora

CLI jest w `devDependencies` (`npx supabase …`), skróty są w `package.json` jako `npm run db:*`.
Konfiguracja projektu: [`supabase/config.toml`](../supabase/config.toml).

## Pierwsze uruchomienie (raz na komputer)

```bash
npm run db:login        # otwiera przeglądarkę → token zapisuje się lokalnie
npm run db:link         # wybierz projekt z listy, podaj hasło bazy (Settings → Database)
```

## Jednorazowo: baseline istniejącej bazy

Migracje 001–013 były uruchamiane ręcznie w SQL Editorze, więc CLI o nich nie wie
i przy `db push` próbowałby je odpalić drugi raz. Oznacz je jako zastosowane:

```bash
npm run db:baseline     # migration repair --status applied 001 … 013
npm run db:status       # kolumna "Remote" powinna mieć 001–013, 014 tylko "Local"
```

Jeśli 014 (`push_notifications`) była już uruchomiona ręcznie — nic nie szkodzi,
jest idempotentna; `db:push` po prostu ją potwierdzi.

## Na co dzień

| Komenda | Co robi |
|---|---|
| `npm run db:new -- nazwa` | nowy plik `supabase/migrations/<timestamp>_nazwa.sql` |
| `npm run db:push` | wysyła niezastosowane migracje na produkcję (pyta o potwierdzenie) |
| `npm run db:status` | porównanie migracji lokalnych i na serwerze |
| `npm run db:diff` | różnica schematu: produkcja vs pliki migracji (wykrywa ręczne zmiany) |
| `npm run db:types` | generuje typy TS bazy do `src/types/supabase.gen.ts` |

Zasada: **schemat zmieniamy tylko migracjami** — nic ręcznie w dashboardzie, inaczej
`db push` i rzeczywistość się rozjadą (`db:diff` to pokaże).

Pisz migracje idempotentnie (`IF NOT EXISTS`, `CREATE OR REPLACE`,
`DROP POLICY IF EXISTS` przed `CREATE POLICY`), jak istniejące 001–014.

## Lokalna baza (opcjonalnie, wymaga Dockera)

```bash
npx supabase start      # Postgres + Auth + Studio lokalnie, stosuje migracje + seed.sql
npx supabase db reset   # od zera: wszystkie migracje + seed
npx supabase stop
```

`start` wypisze lokalne `API URL` i `anon key` — wstaw je do `.env.local`, żeby
`npm run dev` działał na lokalnej bazie. Maile z magic linkiem trafiają do Mailpit
(adres w wyjściu `start`).
