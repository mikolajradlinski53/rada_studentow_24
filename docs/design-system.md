# System wizualny

Kierunek: aplikacja w duchu Apple (iOS Settings / Wallet). Spokojna, urzędowo
wiarygodna, czytelna na telefonie w trakcie posiedzenia.

## Motyw (jasny + ciemny)

Komponenty piszemy w klasach palety Tailwinda **pod tryb ciemny** (`bg-zinc-950`
tło, `bg-zinc-900/50` karta, `text-zinc-100` tekst, `bg-emerald-900/40` + `text-emerald-300`
tint). [`src/app/theme.css`](../src/app/theme.css) przemapowuje palety, więc te same
klasy w jasnym trybie dają szare tło grupowane `#f2f2f7`, białe karty i ciemny tekst.

- Plik jest **generowany**: `npm run theme` (źródło: [`scripts/gen-theme.cjs`](../scripts/gen-theme.cjs)).
- Tryb: systemowy, albo wymuszony w Profilu (`<html data-theme="light|dark">`).
- `.theme-fixed`: przypina oryginalną paletę. Używaj dla rzutnika (zawsze ciemny) i
  dokumentów „na papierze” (uchwała do druku: `bg-white text-zinc-900`).

## Tokeny

| Rola | Klasa |
|---|---|
| Tło strony | `bg-zinc-950` |
| Karta / lista | `bg-zinc-900/50 border border-zinc-800` |
| Pole / wypełnienie | `bg-zinc-800/80 border-zinc-700` |
| Tekst główny / drugorzędny / wyciszony | `text-zinc-100` / `text-zinc-400` / `text-zinc-500` |
| Akcent (systemowy błękit) | `indigo-*` (nazwa zostaje, kolor to `blue`) |
| Sukces / błąd / ostrzeżenie | `emerald-*` / `red-*` / `amber-*` |

Pełne wypełnienia przycisków: odcienie **500/600** (nie zmieniają się między trybami).
Tekst na ciemnym tle: 300/400 (w jasnym trybie automatycznie 700/600).

## Kształt, typografia, ruch

- **Promienie:** karty i listy `rounded-2xl`, przyciski i pola `rounded-xl`, plakietki `rounded-full`.
- **Dotyk:** min. 44 px wysokości (`h-11`/`h-12`), główne akcje na całą szerokość na telefonie.
- **Font:** Geist + Geist Mono (`next/font`). Tytuły stron `text-[22px] font-semibold tracking-tight`.
- **Ruch:** `press` (skala 0.97 przy naciśnięciu), `--ease-out`, `--ease-drawer` dla arkuszy;
  wszystko respektuje `prefers-reduced-motion`.
- **Teksty:** bez półpauz (—) w UI; przecinek, kropka albo dwukropek.
