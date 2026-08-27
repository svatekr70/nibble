# Změny

Formát podle [Keep a Changelog](https://keepachangelog.com/cs/1.1.0/),
verzování podle [SemVer](https://semver.org/lang/cs/).

## Nevydáno

### Změněno

- Ikony lišty jsou z [Lucide](https://lucide.dev) (ISC) místo ručně kreslených.
  Generuje je `npm run icons` z mapy jmen v `tools/build-icons.mjs`, do balíčku
  jde 52 ikon a `@iconify-json/lucide` je jen vývojová závislost. Copyright je
  v `licenses/lucide.txt` — ISC ho vyžaduje u všech kopií.
  **Nekompatibilní změna pro toho, kdo sahal na `ICONS`:** hodnoty už nejsou
  data cesty, ale celé nitro značky `<svg>` — část ikon má víc tvarů než jeden
  `<path>`. `iconSvg(name)` funguje beze změny.

### Přidáno

- **Lišta se nezalamuje.** Při větším počtu tlačítek zabrala klidně čtyři řádky
  a z editoru zbyl proužek. Co se na šířku nevejde, jde pod trojtečku vpravo
  a rozbalí se kliknutím; po použití se panel zavře. Odchází se po skupinách,
  ať v liště nezbyde osamocené tlačítko, a skupiny se přesouvají, neklonují —
  klon by měl vlastní stav.
- *Nastavení editoru* ukazuje pod tlačítky verzi. Dosazuje ji bundler
  z `package.json`, takže se nemá kde rozejít s vydáním.
- **Rozepsané se neztratí.** Obsah se průběžně ukládá do `localStorage` a po
  načtení stránky se nad lištou nabídne pruh „Máte tu rozepsanou verzi z 14:32"
  s možností Obnovit nebo Zahodit. Nabízí, neobnovuje — automatické obnovení by
  přepsalo text, který mezitím mohl někdo změnit jinde. Ukládá se jen odchylka
  od výchozího obsahu, po odeslání formuláře záloha mizí a starší než týden se
  uklidí. Zapnuté bez ptaní, vypíná se `autosave: false` — a uživatel má vlastní
  přepínač „Pamatovat si rozepsané" v Nastavení editoru.
- Kotva: *Vložit → Kotva* zapíše `id` na blok, ve kterém stojí kurzor, takže na
  něj vede odkaz `#nazev`. `<a name>` HTML5 zrušil. Název se navrhne z textu
  bloku a převede na tvar bez diakritiky; obsazený se očísluje, prázdné pole
  kotvu zruší. V editoru je blok s kotvou označený ⚓ přes `::before` — v obsahu
  po značce nezůstane stopa.
- Hledání dostalo **Najít další** a **Nahradit** — dosud se dalo jen nahradit vše.
  Panel je proto nemodální (`show()` místo `showModal()`), aby bylo na nález
  v obsahu vidět, a zůstává otevřený, dokud se nezavře. Nález se zvýrazňuje přes
  `CSS.highlights`, takže se obsah při hledání nemění; kde API není, ukáže se
  obyčejný výběr. Ve stavovém řádku je „3 z 7". Po nahrazení se rovnou stojí na
  dalším nálezu, za posledním se pokračuje od prvního.
- `DialogSpec` umí `modeless: true` a `actions` — tlačítka, po kterých dialog
  zůstane otevřený, s callbackem `onAction`.
- Znakové odrážky: pomlčka, šipka, fajfka. `list-style-type` bere i řetězec,
  takže se obejdou bez stylopisu u obsahu — na rozdíl od oddělovače za číslem,
  který se proto pořád nenabízí.
- Seznam definic `<dl>`. Enter střídá druh prvku — po `<dt>` vznikne `<dd>`
  a naopak — protože po termínu se čeká vysvětlení. V prázdném prvku se ze
  seznamu vystoupí, Backspace na začátku spojí s předchozím a u prvního
  vystoupí. Zapnutí z několika odstavců je střídá stejně. Zanořování schválně
  není: `<dl>` uvnitř `<dd>` je platné HTML, ale co má Tab zanořit — termín,
  vysvětlení, nebo obojí — nemá zjevnou odpověď.
- Vlastnosti seznamu: druh značky (čísla, písmena, římské číslice, tři druhy
  odrážek, bez značky), `list-style-position` a počáteční číslo. Zapisuje se
  atribut `type` i `list-style-type` ve stylu — každé je jinde k něčemu.
  Každá úroveň se nastavuje nezávisle, dialog nabídne celý řetěz nad kurzorem.
  Otevřít a potvrdit beze změny nesmí obsahem hnout, proto zápis při shodné
  hodnotě nesáhne na nic: přes CSSOM by se `style` přepsal kanonickým tvarem
  a přeformátoval blok, kterého se nikdo nedotkl.
  Oddělovač za číslem (tečka, závorka) schválně chybí — HTML na to nemá nic
  a přenositelné CSS taky ne.

### Opraveno

- Formátování přes hranici bloků strukturu netrhá. Zapínalo se přes
  `extractContents()` — obsah se vyjmul, obalil a vložil zpátky — a rozsah od
  poloviny jednoho odstavce do poloviny druhého z nich udělal čtyři, protože
  vyjmuté kusy se vložily jako sourozenci. U seznamu vznikly ze dvou položek
  čtyři a přibyl prázdný obal. Formátuje se teď v živém DOMu, po textových
  uzlech na místě, stejně jako se odjakživa odformátovávalo. Týká se i barev,
  písma a velikosti.
- Smazání výběru přes víc bloků zbytky spojí a uklidí po sobě. `deleteContents()`
  bloky vyprázdnil, ale nechal stát: kurzor pak skončil v kořeni mezi nimi a další
  psaní vyrobilo holý text mimo blok. Po Ctrl+A a Backspace zbýval prázdný nadpis
  a prázdná položka seznamu — teď zůstane jeden prázdný odstavec.
- Vyčistit formát nenechává prázdné slupky `<strong></strong>`, nezdvojuje odkaz
  a funguje i na části úseku a na vnořeném formátu. Šlo o tentýž
  `extractContents()`; používá se teď Formatter. Odkaz se schválně neruší — na to
  je vlastní tlačítko.
- Odebrat odkaz funguje i na výběru, nejen z kurzoru, a zruší všechny odkazy,
  kterých se výběr dotkl. Hledalo se přes `range.startContainer`, jenže ten při
  výběru taženém myší leží mimo vybraný text. Odkaz nad výběrem, který stávající
  odkaz přesahuje, se nově udělá nad celým výběrem, místo aby jen přepsal cíl
  toho starého.
- Kopírování uvnitř editoru nezanáší obsah spočítanými styly. Chrome do schránky
  přibalí `color`, `background-color` i `text-align: start`; Nibble ji proto plní
  sám. Vyjmutí přestalo nechávat `&nbsp;` a prázdné obaly.
- Horní a dolní index se vylučují — zapnutí jednoho vypne druhý. Dřív šlo mít
  obojí a vzniklo `<sup><sub>…</sub></sup>`.
- Inline obal kolem blokového obsahu se při vkládání rozbalí. Google Docs kolem
  zkopírovaného úseku dává `<b style="font-weight:normal">`, což je kontejner,
  ne formátování — a `<b>` kolem `<p>` je neplatné HTML.
- Plovoucí lišta u odkazu jde pod prvek, když se nad něj nevejde. Dřív se
  zarazila o horní okraj a přistála přes odkaz, který se právě upravoval.
- Odformátování prostředka úseku sáhne jen na to, co je vybrané. `intersectsNode`
  bral i uzly, které se rozsahu jen dotýkaly hranicí, takže odtučnění „c"
  v `a<strong>bcd</strong>ef` odtučnilo i „b".
- Seznam zapnutý v prázdném odstavci se dal dopsat. Kurzor mířil na odstavec,
  který se do položky rozbalil a zanikl, takže po zapnutí zůstala v editoru
  osamocená „1." a první napsané písmeno spadlo za seznam.
- Vystoupení ze seznamu na nejvyšší úrovni — Enter v prázdné položce, Backspace
  na začátku první, vypnutí seznamu tlačítkem — posadí kurzor do odstavce, který
  po položce zbyl. `outdentItem` proto vrací prvek, ve kterém obsah skončil, ne
  jen `true`: `<li>` v té chvíli zaniká a `closestListItem` na odpojené položce
  vrací ji samotnou, takže kurzor končil mimo dokument.
- Obalení holého textu odstavcem se zastaví i na seznamu. `<ul>` a `<ol>`
  blokem v editorovém smyslu nejsou (jinak by `closestBlock` vracel seznam
  místo položky), takže je `ensureBlock` spolkl a vznikalo
  `<p><ol>…</ol>text</p>`. Totéž uvnitř `<li>`, `<blockquote>` a buněk tabulky.

### Ověření

- Testy seznamů po každé operaci píšou. Dosud kontrolovaly jen výslednou
  strukturu, a ta bývala v pořádku i tehdy, když kurzor skončil mimo ni —
  přesně to byla tahle chyba.

## [0.3.0] — 2026-08-26

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
