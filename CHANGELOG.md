# Změny

Formát podle [Keep a Changelog](https://keepachangelog.com/cs/1.1.0/),
verzování podle [SemVer](https://semver.org/lang/cs/).

## [0.1.0] — 2026-08-19

První veřejná verze. Editor je funkčně hotový; číslo 0.x drží prostor pro
změny API, než ho prověří nasazení v ostrém provozu.

### Jádro

- Round-trip serializace: obsah, kterého se nikdo nedotkl, se uloží znak po
  znaku stejně. Jediná vždy prováděná změna je převod CRLF na LF.
- Editace přes `beforeinput` a vlastní příkazy, bez `document.execCommand`.
- Schema ve dvou režimech (`legacy`, `strict`) se srovnáváním tvaru až ve chvíli,
  kdy se s blokem opravdu pracuje.
- Sanitizace nezávislá na schématu: skripty, `on*` atributy a `javascript:`
  odkazy padají vždy.
- Historie, výběr odolný vůči přesunům uzlů, mapování pozic mezi DOM a zdrojem.

### Obsah

- Bloky, nadpisy, citace, oddělovač, zarovnání včetně do bloku, výška řádku.
- Seznamy se zanořováním a líným srovnáním neplatných struktur.
- Tabulky: mřížkový model, řádky a sloupce, slučování, tažení šířky sloupce,
  vlastnosti tabulky i řádku.
- Odkazy, obrázky s adaptérem pro nahrávání, videa z povolených hostitelů.
- Vkládání z Google Docs, Wordu, LibreOffice, prostého textu a Markdownu.
- Písma včetně webových z Google Fonts, barva písma a pozadí s vlastním
  výběrem barvy.

### Ovládání

- Lišta se skupinami, nabídkový pruh, plovoucí lišta nad vybraným prvkem.
- Dialogy popsané deklarativně, se zachováním výběru.
- Zdrojový kód ve velkém okně se zvýrazněnou syntaxí, zalamováním a přenosem
  pozice kurzoru z obsahu a zpátky.
- Nastavení pro uživatele: rozměry, dva řádky lišty, zapnutí a pořadí tlačítek
  tažením myší, informační řádek s cestou k prvku, změna velikosti tažením za
  roh — a výpis hotové konfigurace podle aktuálního stavu.

### Ověření

- 457 jednotkových testů (vitest + linkedom) a 287 testů v prohlížeči
  (Playwright + Chromium), z toho round-trip nad 142 reálnými dokumenty.
