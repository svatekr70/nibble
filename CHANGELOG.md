# Změny

Formát podle [Keep a Changelog](https://keepachangelog.com/cs/1.1.0/),
verzování podle [SemVer](https://semver.org/lang/cs/).

## Nevydáno

### Přidáno

- Plugin `emoji`: mřížka emotikonů s kategoriemi a hledáním, obojí česky.
  Vkládá se znak, ne obrázek — v uloženém HTML tedy nepřibude nic, co by se
  muselo hostovat, a serializér prochází text po kódových bodech, takže složené
  emoji (vlajky, ZWJ) přežijí uložení v celku. V hledání se ignoruje diakritika
  (`zirafa` najde žirafu) a prohledávají se i klíčová slova (`halloween` najde
  dýni). Seznam je ruční výběr osmi set položek; vlastní se předá přes
  `createEmojiPlugin({ emoji, categories })`.
- Plugin `charmap`: mapa speciálních znaků v téže mřížce — interpunkce,
  mezery, měny, matematika, zlomky, šipky, písmena s diakritikou, řecká
  abeceda a symboly. Hledá se i podle kódu (`U+00A9`), který se pod mřížkou
  ukazuje. Neviditelné znaky (pevná mezera, měkký rozdělovník) mají v mřížce
  náhradu, aby políčko nevypadalo prázdné. Při `entityEncoding: 'named'` se
  vložený znak uloží pojmenovanou entitou, tedy `&copy;` místo `©`.
- Nové druhy pole dialogu `emoji` a `chars` — tatáž mřížka, liší se sazbou
  políček. Seznam se do nich předává zvenčí, aby se přes tisíc položek dostalo
  do balíčku jen tomu, kdo si ten plugin zapne.

### Ověření

- 519 jednotkových testů (vitest + linkedom) a 311 testů v prohlížeči
  (Playwright + Chromium). U vložených znaků se ověřuje i tvar uloženého
  HTML: `©` se při `entityEncoding: 'named'` uloží jako `&copy;` a složené
  emoji (vlajky, ZWJ) přežije uložení v celku.

## [0.2.0] — 2026-08-20

### Přidáno

- Vkládání tabulek z Google Sheets a Excelu. Formátování se přebírá z toho,
  co aplikace do schránky opravdu dá: Sheets posílá styly u každé buňky,
  Excel je má v bloku stylů pod třídami `xl*` — ten se teď rozepisuje
  k prvkům, jinak by z Excelu přišla tabulka bez jediné barvy.
- Shodný rámeček ve všech buňkách se zapíše jednou místo ke každé straně
  každé buňky zvlášť. Na reálném sešitu 46 × 41 to je 119 kB rozdílu.
- Velikosti písma ze sešitu se přepočítají na poměr k jeho základu (`em`),
  takže si tabulka nese vzájemné poměry a přizpůsobí se písmu stránky.
  Rodina písma se nepřebírá.

### Opraveno

- `<colgroup>` a `<col>` se při vkládání zahazovaly jako prázdné obaly —
  vložená tabulka tím přišla o všechny šířky sloupců.
- Prázdný `<tr>` se rozbalil a jeho buňky zůstaly viset přímo v `<tbody>`.
- Google Sheets se rozpoznával jako Word (posílá `mso-data-placement`), takže
  se na něj pouštěla přestavba wordovských seznamů.
- Vkládání z Excelu končilo obrázkem: Excel dává do schránky kromě HTML
  i náhled zkopírované oblasti a ten měl přednost. Když je v HTML tabulka,
  má teď přednost ona.
- Fragment ze schránky, který začíná uvnitř tabulky (tak ho značkuje Excel),
  se bral doslova — prohlížeč pak `<tr>` bez tabulky zahodil a nezbyl text.

### Ověření

- 482 jednotkových testů (vitest + linkedom) a 290 testů v prohlížeči
  (Playwright + Chromium). Chování tabulek ze schránky se ověřovalo proti
  skutečným vzorkům z Google Sheets (46 × 41 buněk) a z Excelu.

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
