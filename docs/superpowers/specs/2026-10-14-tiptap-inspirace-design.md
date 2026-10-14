# Nápady z TipTapu: odkazy při vkládání, Markdown zkratky, placeholder, limit, lomítko, úkoly, details, úchyt

Datum: 2026-10-14

## Proč

TipTap má několik drobností, které výrazně zrychlují psaní. Samotný TipTap
(ProseMirror) nasadit nejde: převádí dokument do svého schématu a porušil by
záruku, že načtený a nedotčený obsah se uloží znak po znaku stejně. Přebíráme
proto jen nápady a stavíme je nad stávající architekturou Nibble.

## Zadání a předpoklady

Zadal Rudolf:
- osm funkcí ve dvou vlnách (níže),
- úkoly se ukládají jako seznam s atributy a zaškrtávátko kreslí CSS,
- limit znaků jen varuje, nic neblokuje ani neusekává.

Předpoklady (k potvrzení při kontrole tohoto dokumentu):
- Každá funkce je volitelná (plugin nebo volba). Výchozí chování editoru se
  pro stávající nastavení nemění.
- Žádná funkce nemění načtený obsah, dokud se ho uživatel nedotkne.
  Placeholder, úchyt, popup i zaškrtávátko jsou čistě vizuální a do HTML se
  nezapíšou.
- Každá změna obsahu, kterou funkce udělá, je samostatný krok historie
  (vlastní `kind` v `editor.commit`), takže jde vrátit jedním Ctrl+Z.

## Měřítka hotovosti

- Všech 145 fixtures v `packages/core/test/fixtures` projde načtením a uložením
  znak po znaku beze změny, se všemi novými pluginy zapnutými.
- Každá funkce má e2e test na vyvolání, undo a krajní případy uvedené níže.
- `npm test`, `npm run typecheck` a e2e procházejí.

## Vlna 1

### 1. Odkazy při vkládání (rozšíření pluginu `autolink`)

Soubor: `packages/plugins/src/tools.ts`.

- Plugin přidá posluchač `paste` na `editor.root` ve fázi capture, takže
  běží dřív než `bindPaste` v jádře.
- Zasáhne jen tehdy, když:
  - je editor v režimu `design`,
  - neplatí `editor.pastePlainNext` (Ctrl+Shift+V),
  - ve schránce nejsou soubory obrázků,
  - `text/plain` po oříznutí bílých znaků je celý jedna adresa
    (`https?://…`) nebo e-mail,
  - kurzor ani výběr neleží uvnitř `<a>`.
- Je-li výběr neprázdný, obalí vybraný obsah do `<a href>` (text i vnořené
  formátování zůstane). Výběr přes více bloků se neobaluje a vložení
  propadne jádru.
- Je-li výběr prázdný, vloží `<a href="…">…</a>` s adresou jako textem.
- Volá `preventDefault` a `stopImmediatePropagation` a uloží
  `commit('autolink')`.
- Sdílí regulární výrazy se stávajícím rozpoznáním při psaní, s jedním
  rozdílem: vzor pro vkládání je ukotvený na celý text (`^…$`).

### 2. Markdown zkratky (nový plugin `markdown`)

Soubor: `packages/plugins/src/markdown.ts`.

Blokové zkratky platí, když je text bloku před kurzorem přesně vzor a za
kurzorem v bloku nic není nebo cokoli (obsah se zachová):

| Napíšu | Spouští | Výsledek |
|---|---|---|
| `#`–`######` | mezera | `h1`–`h6` |
| `-`, `*` | mezera | odrážkový seznam |
| `1.` (libovolné číslo) | mezera | číslovaný seznam (číslo ≠ 1 nastaví `start`) |
| `>` | mezera | citace |
| `[ ]`, `[x]` | mezera | úkol (jen když je zapnutý plugin `tasks`) |
| `---` | Enter | `<hr>` a nový prázdný odstavec za ním |
| ```` ``` ```` | Enter | `<pre>` |

Řádkové zkratky se spouštějí zavíracím znakem:
`**x**` → `strong`, `*x*` a `_x_` → `em`, `` `x` `` → `code`, `~~x~~` → `s`.
Obsah mezi značkami nesmí začínat ani končit mezerou. `_` uvnitř slova
(`snake_case`) se nespouští.

Průběh: napsaný znak projde běžnou cestou (`insertText`, `commit('type')`).
Plugin pak v mikroúloze zkontroluje text před kurzorem a při shodě v jedné
operaci odstraní značky, použije formát a uloží `commit('markdown')`.
První Ctrl+Z tedy vrátí doslovný text včetně posledního napsaného znaku.

Výjimky, kdy se nic nespouští: uvnitř `pre`, `code`, `a`, při IME skládání
a když blok už je ve formátu, do kterého by se převáděl.

### 3. Placeholder (volba v jádru)

- `NibbleConfig.placeholder?: string`. Když chybí a cílem je `<textarea>`,
  `create()` převezme její atribut `placeholder`.
- Editor nastaví na kořen `data-placeholder` a třídu `nb-empty`, když je
  dokument prázdný (jeden prázdný blok). Třída se přepočítává na `change`
  a `setcontent`.
- Text kreslí CSS v `packages/ui/src/nibble.css` přes
  `.nb-empty > :first-child::before { content: attr(…) }`. Barva je šedá
  a text se nedá označit.
- `getHTML()` třídu ani atribut nevrací (kořen do výstupu nepatří).

### 4. Limit znaků (rozšíření `wordcount`)

- Nová továrna `createWordcountPlugin({ maxChars?: number })`. Stávající
  `wordcount` zůstává jako `createWordcountPlugin()`.
- Se zadaným limitem ukazuje stavový řádek `N slov · 152 / 160 znaků`.
  Po překročení dostane stavová položka třídu `nb-over` (červená).
- Při každém přechodu přes hranici (oběma směry) editor vyšle událost
  `limit` s `{ count, max, over }`. Formulář si podle ní může zakázat
  odeslání.
- Nic neblokuje a nic neusekává, ani u staršího obsahu, který už je delší.

## Vlna 2

### 5. Seznam úkolů (nový plugin `tasks`)

Formát (převzatý od TipTapu kvůli kompatibilitě při vkládání):

```html
<ul data-type="taskList">
  <li data-type="taskItem" data-checked="true">Hotovo</li>
  <li data-type="taskItem" data-checked="false">Zbývá</li>
</ul>
```

- Příkaz `tasklist` přepne běžný seznam nebo blok na úkoly a zpět.
  Zpětný převod odstraní jen atributy `data-type` a `data-checked`.
- Zaškrtávátko kreslí CSS `li[data-type="taskItem"]::before`. Klik do jeho
  oblasti (levý okraj položky) přepne `data-checked` a uloží
  `commit('task')`. Kurzor se klikem do této oblasti nepřesouvá.
- Enter: `splitBlock` kopíruje atributy, takže nová položka by zdědila
  `data-checked="true"`. Plugin po rozdělení nastaví novou položku na
  `"false"`. Enter na prázdné položce ze seznamu vyskočí (stávající chování
  seznamů).
- Vnořené úkoly fungují přes stávající Tab/Shift+Tab.
- Tlačítko do lišty a položka do nabídky, ikona z Tableru (`list-check`).
- Dodáme CSS útržek pro veřejný web (do README), aby EverFLOW zobrazil
  ☐/☑ i mimo editor.

### 6. Rozbalovací blok (nový plugin `details`)

- Příkaz `details` vloží
  `<details><summary>Nadpis</summary><p>…</p></details>`. Je-li označený
  obsah, stane se z něj tělo bloku.
- V editoru je tělo vidět vždy, a to přes CSS
  `details::details-content { content-visibility: visible; display: block }`.
- Klik na `summary` v editoru blok nesbaluje (prohlížeči se zruší výchozí
  akce). Jinak by se měnil atribut `open` a s ním i HTML, aniž by o to
  uživatel stál.
- Kontextová lišta nad blokem má přepínač „Rozbalený na webu“ (atribut
  `open`) a tlačítko „Zrušit blok“, které obsah rozbalí zpět do dokumentu.
- Enter v `summary` přesune kurzor na začátek těla. Backspace na začátku
  prázdného `summary` blok nesmaže.
- `details` a `summary` přibudou do `PASTE_ALLOWED_TAGS`.

### 7. Lomítkové příkazy (nový plugin `slash` + `CaretMenu` v UI)

Rozdělení odpovídá architektuře: plugin dodává data, `@nibble/ui` je
vykresluje.

- Registr UI dostane `ui.addSuggestion(name, spec)`:
  ```ts
  interface SuggestionSpec {
    trigger: string;                       // '/'
    startOfBlock?: boolean;                // spouštět jen na začátku bloku
    items(editor: Editor, query: string): SuggestionItem[];
    onPick(editor: Editor, item: SuggestionItem): void;
  }
  interface SuggestionItem { id: string; label: string; icon?: string; keywords?: string[] }
  ```
- `@nibble/ui` dostane komponentu `CaretMenu`: popup ukotvený na obdélník
  kurzoru, který si **nebere fokus**. Klávesy ↑/↓/Enter/Tab/Esc zachytává
  přes `keydown` na kořeni editoru, jen když je popup otevřený.
- Chování:
  - `/` napsané v prázdném bloku (nebo na jeho začátku) otevře nabídku.
  - Další psaní ji filtruje podle `label` a `keywords` bez ohledu na
    diakritiku a velikost písmen (`/nad` → Nadpis 1–3).
  - Enter nebo Tab vybere: smaže `/dotaz` a spustí příkaz.
  - Esc, mezera bez shody, opuštění bloku nebo ztráta fokusu nabídku zavřou
    a text nechají.
- Položky se zobrazí, jen když `editor.can(příkaz)`: Nadpis 1–3, Odrážky,
  Číslování, Úkoly, Citace, Blok kódu, Čára, Tabulka, Obrázek, Video,
  Rozbalovací blok. Položky, které otevírají dialog (tabulka, obrázek,
  video), dialog otevřou.
- Registr je obecný a v budoucnu půjde použít i pro `:emoji:`
  (teď se nedělá).

### 8. Úchyt pro přetažení bloku (nový plugin `dragHandle`)

- Při najetí myší na přímého potomka `editor.root` se v levém okraji
  hostitele objeví úchyt ⠿. Úchyt je mimo `contenteditable` a nikdy není
  v obsahu.
- Tažení používá pointer events (`setPointerCapture`), ne nativní drag & drop,
  aby se nepletlo s přetahováním textu v `Paste.ts`.
- Během tažení ukazuje vodorovná čára cíl mezi bloky. Esc tažení zruší.
- Po puštění se uzel přesune beze změny (`insertBefore`) a uloží se
  `commit('move')`. Puštění na stejné místo nic neuloží.
- Klik na úchyt bez tažení označí celý blok.
- Na zařízeních bez jemného ukazatele (`pointer: coarse`) se úchyt nezobrazuje.

## Testy

- Vitest:
  - rozpoznání adresy pro vkládání,
  - vzory Markdown zkratek (čisté funkce nad textem),
  - filtrování položek lomítkové nabídky včetně diakritiky,
  - převod seznamu na úkoly a zpět,
  - kontrola fixtures se zapnutými pluginy.
- Playwright (`e2e/`), jeden spec na funkci:
  - vyvolání a výsledné HTML,
  - Ctrl+Z vrátí přesně stav před převodem,
  - krajní případy:
    - vložení adresy do odkazu,
    - Ctrl+Shift+V,
    - `_` uvnitř slova,
    - zkratka v `pre`,
    - Enter na prázdném úkolu,
    - klik do summary,
    - Esc v nabídce,
    - přetažení na první a poslední místo,
    - placeholder po smazání všeho textu,
    - událost `limit` oběma směry.

## Pořadí a commity

1. Odkazy při vkládání
2. Placeholder
3. Limit znaků
4. Markdown zkratky
5. Úkoly
6. Rozbalovací blok
7. Lomítkové příkazy (`addSuggestion`, `CaretMenu`, plugin `slash`)
8. Úchyt

Každý bod je samostatný commit se zápisem v `CHANGELOG.md`. Vydání nové
verze není součástí této práce.

## Mimo rozsah

- Spolupráce více lidí (Yjs), komentáře, AI.
- `:emoji:` přes lomítkovou nabídku.
- Interaktivní zaškrtávání úkolů na veřejném webu EverFLOW.
