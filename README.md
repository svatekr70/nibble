# Nibble

Lehký WYSIWYG editor pro HTML. Náhrada za TinyMCE bez API klíče, bez cloudu
a bez placených funkcí.

Vznikl kvůli jedné vlastnosti, kterou běžné editory nemají: **čeho se uživatel
nedotkne, to se nesmí změnit**. Načtu, nesáhnu, uložím → znak po znaku totéž,
včetně entit, uvozovek v atributech a komentářů. V databázi, kde jsou dokumenty
staré deset let a prošly třemi nástroji, je to rozdíl mezi editorem a tichou
ztrátou dat.

```js
const editor = await Nibble.create({ target: '#obsah', schema: 'legacy' })
attachToolbar(editor, { menubar: true })
editor.on('change', ({ html }) => uloz(html))
```

**Dokumentace: [svatekr70.github.io/nibble](https://svatekr70.github.io/nibble/)** —
[živé demo](https://svatekr70.github.io/nibble/demo/) na reálném dokumentu,
[příručka](https://svatekr70.github.io/nibble/guide/) od instalace přes přechod
z TinyMCE po vlastní plugin a [API dokumentace](https://svatekr70.github.io/nibble/api/)
s úplným výčtem voleb, metod, událostí a CSS proměnných. Web se dá spustit
i lokálně přes `npm run site:build && npm run site:dev`.

```
jádro + lišta   ~144 kB raw / ~44 kB gzip      (TinyMCE ≈ 430 kB gzip)
závislosti      žádné běhové
testy           457 jednotkových + 287 v prohlížeči
                z toho 142 reálných dokumentů z ostrého provozu
```

Umí: odstavce, nadpisy H1–H6, citace, předformátovaný text, oddělovač,
zarovnání, odrážkové a číslované seznamy včetně zanořování, tučné, kurzívu,
podtržení, přeškrtnutí, **výběr písma a jeho velikosti**, **barvu písma
a pozadí**, zrušení formátování, odkazy,
obrázky, tabulky včetně tažení šířky sloupců, videa a zvuk, zdrojový kód,
automatické odkazy, počítadlo slov, hledání a nahrazování, celou obrazovku,
českou typografii, dialogy, plovoucí lištu, vkládání z Wordu a Google Docs,
Markdown, historii a ovládání klávesnicí.

## Hlavní myšlenka

Editor, který se nasazuje na existující databázi, musí splnit jednu věc dřív než
cokoli jiného: **čeho se uživatel nedotkne, to nesmí změnit.**

Není to samozřejmost. Prohlížeč při parsování HTML obsah normalizuje — přepíše
uvozovky u atributů, změní jejich pořadí, rozbalí entity. Editor, který při
ukládání vychází z DOMu, tak přepíše i části dokumentu, na které nikdo nesáhl.
Ve stávající databázi to znamená, že první uložení kterékoli staré stránky ji
tiše přepíše. Undo na to není.

Nibble si proto u každého bloku nechá **původní řetězec** a při ukládání ho
vypíše doslova, dokud se blok nezmění. Ověřeno na 142 dokumentech z produkce:

```
načtení → uložení bez úpravy   →  znak po znaku totéž
načtení → napsání 6 znaků      →  liší se přesně těch 6 bajtů, nic víc
načtení → úprava → undo        →  znak po znaku totéž
```

### Jediná výjimka

CRLF se sjednotí na LF. Není to volba: parser HTML mění CRLF na LF už při čtení
vstupu podle specifikace a `textarea.value` ho zahodí taky. Držet `\r` ve
zdrojových řetězcích by znamenalo, že se editor chová pokaždé jinak podle toho,
jak se obsah na stránku dostal. V cílovém projektu se to týká zhruba 1 100 dokumentů.

## Vložený obsah je výjimka

Načtený dokument se nechává být. To, co právě přišlo ze schránky, ale vzniká
teď a nese s sebou nepořádek zdrojové aplikace — kdyby prošlo, usadí se
v databázi natrvalo. Na vložený obsah se proto pravidla vztahují v plné síle.

Co se čistí, určila data z ostrého provozu, ne obecná představa:

| zdroj | výskyt v obsahu |
|---|---|
| Google Docs (`dir="ltr"`, `role`, `docs-internal-guid`) | 12 617× |
| Quill (`class="ql-*"`, `data-list`) | 1 918× |
| ProseMirror / ChatGPT (`data-start`, `data-pm-*`) | 1 034× |
| Word (`mso-`, `<o:p>`, `MsoNormal`) | **0×** |

Word se v uloženém obsahu nevyskytuje ani jednou — přesto se řeší, protože do
schránky se dostane dřív nebo později. Ze stylů se nechává jen to, co nese
úmysl autora (barva, zarovnání, řez); `font-family`, `font-size` a `margin`
patří zdrojovému dokumentu, ne cílové stránce. Padá i `color: #000000`, které
Google Docs razítkuje na všechno — natvrdo černý text rozbije tmavý motiv.

### Tabulky z Google Sheets a Excelu

U tabulky je poměr obrácený: mřížka, šířky sloupců a odsazení buněk **jsou**
ten obsah, kvůli kterému se kopírovalo. Uvnitř tabulky proto projde i to, co by
v odstavci padlo — rámečky, `width`, `height`, `padding` a velikost písma.

Každá aplikace to posílá jinak a rozdíl není kosmetický:

| | Google Sheets | Excel |
|---|---|---|
| kde je formátování | u každé buňky | v bloku stylů pod třídami `xl*` |
| blok `<style>` | jen náhradní šedý rámeček — přeskakuje se | rozepíše se k prvkům |
| značka fragmentu | kolem tabulky | **uvnitř** tabulky, hned za `<table>` |
| obrázek ve schránce | ano | ano |

Poslední dva řádky rozhodují o tom, jestli vůbec něco dorazí. Fragment
z Excelu začíná `<col>` a `<tr>`, takže dodržet jeho hranice doslova znamená
vložit obsah, který prohlížeč mimo tabulku zahodí; bere se proto celé tělo.
A obrázek ve schránce je jen náhled zkopírované oblasti — když je v HTML
tabulka, má přednost ona, jinak by v obsahu skončil obrázek, se kterým už
nikdo nic neudělá.

Formátování se pak srovnává na to, co nese záměr autora. Shodný rámeček ve
všech buňkách se zapíše jednou (na reálném sešitu 46 × 41 to je 119 kB
rozdílu), `vertical-align: bottom` na úplně všech buňkách je výchozí stav
sešitu a padá, `width: 0px` na tabulce je vnitřní značka Sheets. Velikosti
písma se přepočítají na poměr k základu sešitu — `20pt` v desetibodovém sešitu
není „dvacet bodů", ale „dvakrát větší než okolí", a to platí i na stránce
s jiným písmem.

Čistý text se převádí z Markdownu, ale jen když má **výrazný** znak: nadpis,
blok kódu, odkaz nebo aspoň dva po sobě jdoucí řádky seznamu. Jedna pomlčka na
začátku řádku je běžná věta, ne struktura. `Ctrl+Shift+V` vloží vždy jako text.

## Poslední slovo má uživatel

Rozvržení lišty navrhne programátor, který Nibble do projektu zasazuje — a to je
správně, protože ví, co ta konkrétní aplikace potřebuje. Jenže uživatel u toho
sedí osm hodin denně a jeho zvyky se s tím návrhem potkat nemusí. Ozubené kolo
vpravo nahoře proto otevře nastavení, ve kterém si může přeskládat, co
potřebuje, aniž by kdokoli musel sahat do kódu:

- **šířka a výška** editoru — zadaná výška zapne rolování uvnitř, prázdné pole
  znamená „podle obsahu“,
- **zapnutí jednotlivých tlačítek**, jejich **pořadí** i pořadí celých skupin —
  obojí přetažením myší,
- **umístění skupiny** do prvního nebo druhého řádku lišty,
- **nabídkový pruh**, **lepkavá hlavička**, **informační řádek** a **změna
  velikosti tažením za roh** — každé zvlášť.

Ozubené kolo samo do rozvržení nepatří: nedá se vypnout ani přesunout a vždycky
sedí v horním řádku úplně vpravo, i kdyby v liště byla jediná skupina tlačítek.
Je to jediná cesta zpátky — kdyby si ho uživatel schoval, k nastavení už by se
nedostal. Skrýt ho může jen programátor při inicializaci (`settings: false`),
protože ten má pořád po ruce `ui.prefs`.

Volba se ukládá do `localStorage` pod klíčem `nibble:prefs:<id>`; `id` se zadává
jako `prefsKey`, takže dvě různá pole na jedné aplikaci mají každé své
nastavení. Když úložiště není k dispozici (soukromé okno, plná kvóta), nastavení
funguje dál — jen se nepřenese do příštího sezení. Spadnout kvůli tomu by bylo
horší.

Uloženému nastavení se přitom **nesmí věřit slepě**. Sedí v prohlížeči
uživatele, může být staré půl roku a mezitím mohly přibýt nové funkce. Slučuje
se proto s aktuální konfigurací tak, aby prvek, který uživatel zná, držel své
pořadí a zapnutí, ale prvek, který mezitím přibyl, se doplnil na konec své
skupiny. Bez toho by upgrade editoru znamenal, že nové tlačítko nikdo nikdy
neuvidí — a nikdo by netušil proč.

Po každé změně se ovládání postaví celé znovu. Dopočítávat, co přesně se pohnulo,
by bylo rychlejší a mnohem snadněji rozbitelné.

### Vypsat konfiguraci

Vedle „Výchozí nastavení" je tlačítko, které z aktuálního stavu dialogu udělá
hotový inicializační kód — imports, `Nibble.create()` i `attachToolbar()`
s rozvržením, řádky a nastavením:

```js
attachToolbar(editor, {
  layout: [
    ['undo', 'redo'],
    ['bold', 'italic', 'underline', 'strike'],
  ],
  // Skupiny, které si uživatel přesunul do druhého řádku.
  layoutBottom: [
    ['code', 'fullscreen'],
  ],
  menubar: true,
  prefs: {
    height: '400px',
  },
});
```

Když si uživatel lištu přeskládá tak, že to dává smysl, je to nejlepší podklad
pro to, jak má editor vypadat pro všechny ostatní — a z ladění „posuň to o jedno
doleva a pošli screenshot" se stane jedno zkopírování.

Vypisuje se přitom **jen to, co se liší od výchozího stavu**. Konfigurace, která
vyjmenovává i hodnoty shodné s výchozími, totiž zastarává potichu: až se výchozí
stav v novější verzi změní, tahle ho přebije a nikdo nebude vědět proč.

### Ovládací panel se drží u okraje

Nabídka i lišta sedí ve společné hlavičce s `position: sticky`, takže u dlouhého
dokumentu není potřeba rolovat nahoru kvůli každému tlačítku. Komu to vadí,
vypne si to v nastavení.

Stálo to jednu ústupku: obal editoru **nesmí mít `overflow: hidden`**. Zaoblené
rohy by se jím ořízly hezky, jenže z obalu by se stal posuvný kontejner
a `sticky` uvnitř by se neměl čeho chytit. Rohy se proto zaoblují na hlavičce
a na ploše s obsahem zvlášť.

### Dva řádky lišty

Skupina se dá poslat do druhého řádku — ten sedí **hned pod prvním**, ne dole
u obsahu. Uživatel v nastavení skládá lištu, ne rozhraní editoru; čára mezi
řádky se proto nekreslí a obě řady čte jako jeden celek.

### Informační řádek

Vlevo cesta k prvku pod kurzorem, vpravo místo pro údaje pluginů (počet slov),
v rohu úchyt pro změnu velikosti.

Cesta není ozdoba. V cizím HTML — a to je v cílovém projektu skoro všechno — bývá
`<span>` ve `<span>` uvnitř `<h4>` v buňce tabulky, a bez cesty uživatel netuší,
čeho se jeho úprava vlastně týká. Kliknutím na kterýkoli krok se navíc vybere
celý prvek, což je nejrychlejší způsob, jak se zbavit obalu, o kterém nevíte.

Úchyt v rohu je vlastní prvek, ne `resize: both` na obalu. CSS resize zapisuje
rozměry inline a nastavení uživatele by se s nimi rozešlo — takhle se rozměr po
puštění uloží mezi ostatní volby a přežije načtení stránky.

Zmenšení navíc **zapne rolování uvnitř**, i když uživatel žádnou výšku nezadal.
Bez toho by editor sice měl novou spodní hranu, ale text by pokračoval pod ní.

## Zdrojový kód

Velké okno, které jde zvětšit, zvýrazněná syntaxe — a hlavně: **kurzor skočí
tam, kde jste byli**. Kdo si otevře zdroj, chce pokračovat na svém odstavci,
ne ho hledat v pěti kilobajtech HTML. Označený text zůstane označený.

Značky se do dokumentu vkládat nedají (rozbily by záruku, že se nedotčený obsah
neuloží jinak), takže se pozice počítá: kolik **viditelných znaků textu** je
před kurzorem, a kde v HTML řetězci je stejné místo. Text se přitom počítá po
znacích, ne po bajtech — `&iacute;` je v HTML osm znaků, ale pro čtenáře jedno
písmeno. Bez toho by se pozice v českém dokumentu rozjela o desítky znaků.
Cesta funguje i zpátky: po úpravě zdroje se kurzor vrátí do obsahu.

Zvýraznění je klasická dvojice — pod průhlednou `<textarea>` leží `<pre>` se
stejným textem, jen obarveným. Zvýrazňovač má pár set bajtů; není to parser,
jen ho učiní čitelným. Výběr má proto průsvitné pozadí: krycí by obarvenou
kopii zakrylo a z označeného úseku by zbyl prázdný obdélník.

Řádky se **zalamují**, takže vodorovný posuvník není potřeba; přepínač pod
polem to vypne a volba se pamatuje. Zalamování musí přepnout obě vrstvy naráz —
kdyby zalamovala jen jedna, rozešly by se řádky a obarvení by přestalo sedět
na textu. Proto je to jedna třída na společném obalu, ne dvě nastavení.

> **Knihovna se musí bránit stylům hostitele.** `<pre>` a `<textarea>` jsou
> běžné značky, na které mívá stránka vlastní pravidla. Stačilo
> `pre { max-height: 260px }` kvůli výpisu jinde na stránce a půlka zdrojového
> kódu v dialogu zmizela — `max-height` přebije i výšku nastavenou inline.
> Rozměry se proto nastavují výslovně včetně stropů.

## Rozepsané se neztratí

Kdo píše půl hodiny a omylem obnoví stránku, přijde o všechno — a je to ta
ztráta, kterou uživatel editoru pamatuje nejdéle. Nibble proto průběžně ukládá
obsah do `localStorage` a po načtení nabídne, že ho vrátí:

```
┌────────────────────────────────────┐
│ Máte tu rozepsanou verzi z 14:32.  │
│              [Obnovit] [Zahodit]   │
├────────────────────────────────────┤
│ B  I  U  …                         │
```

**Nabídne, neobnoví.** Automatické obnovení by přepsalo text, který mezitím mohl
někdo změnit jinde — třeba druhý editor téhož záznamu — a uživatel by se to
nedozvěděl. Záloha je pojistka, ne zdroj pravdy. Obnovení jde vzít zpět Ctrl+Z.

Ukládá se jen odchylka od obsahu, se kterým editor začal: kdo si stránku jen
otevřel a nic nenapsal, žádnou zálohu nezanechá, a kdo vrátí změny zpět, tomu
se smaže. Po odeslání formuláře záloha mizí — text je v databázi, pojistka
doslouží.

Klíč je adresa stránky plus `name` nebo `id` pole, takže dva editory na jedné
stránce si nepřepisují data. Bez jména se použije pořadí editoru; funguje to,
dokud se pořadí nezmění, a je to pořád lepší než nezálohovat vůbec.

Zapnuté je to bez ptaní. Ochrana před ztrátou práce je něco, na co ten, kdo
editor nasazuje, dopředu nemyslí. Vypíná se `autosave: false`, doladit jde
`autosave: { key, delay, maxAge }`.

`localStorage` není samozřejmost — v soukromém okně nebo při zakázaných
souborech cookie může i jen sáhnutí na něj skončit výjimkou. Zálohování se
v takovém případě tiše vypne; editor kvůli pojistce padat nesmí.

## Kotva je `id` na bloku

`<a name>` HTML5 zrušil, takže kotva je `id`. Vkládá se z *Vložit → Kotva* a sedí
na bloku, ve kterém stojí kurzor:

```html
<h2 id="prvni-kapitola">První kapitola</h2>
<p id="poznamka">Text odstavce…</p>
```

Prázdný obal `<span id></span>` na místě kurzoru by uměl kotvu doprostřed věty,
ale v obsahu není vidět a při mazání okolo se ztratí, aniž by si toho někdo
všiml. Blok přežije čištění, round-trip i pozdější úpravy — a odkaz na začátek
odstavce nebo nadpisu je to, co se skoro vždycky myslí.

Název se navrhne z textu bloku a převede na tvar, který projde i v adrese:
bez diakritiky, malými písmeny, mezery na pomlčky. Dvě stejná `id` jsou neplatné
HTML, takže se obsazený název očísluje — `kotva-2`. Vlastní název upravovaného
bloku se za kolizi nepočítá, jinak by se kotva při každém otevření dialogu
očíslovala znovu. Prázdné pole kotvu zruší; je to jediná cesta, jak ji sundat.

Blok s kotvou dostane v editoru značku ⚓ přes `::before`, takže se do obsahu
nic nepřidává a v uloženém HTML po ní není stopa. Kreslí se v pevných
jednotkách, ne v `em` — v `em` se u nadpisu odsune dál, než sahá odsazení
obsahu, a ořízne se o levý okraj.

## Hledání je panel, ne dialog

„Najít další" a „Nahradit" potřebují, aby bylo na obsah vidět — nález se ukazuje
v něm. Panel se proto otevírá přes `show()`, ne `showModal()`: nemá backdrop
a pod ním se dá dál pracovat.

Nález se kreslí přes **`CSS.highlights`**, ne obalením do `<mark>`. Hledání nemá
důvod sahat do dokumentu, ve kterém jen hledá — a obalování by ho měnilo. Kde
API není (starší Safari a Firefox), zbývá obyčejný výběr; ten je v rozostřeném
editoru bledý, ale vidět je. Obojí naráz nemá smysl: výběr se podle specifikace
kreslí přes vlastní zvýraznění a žluté podbarvení by přebil.

Panel si drží jen to, co se z obsahu přečíst nedá — **kolikátý nález je na řadě**.
Samotné nálezy se pokaždé hledají znovu: obsah se mezitím mohl změnit nahrazením
i tím, že do něj někdo psal, a uložený seznam uzlů by po takové změně ukazoval
jinam. Za posledním nálezem se pokračuje od prvního.

Nemodální panel a tlačítka, po kterých se nezavírá, umí dialog obecně —
`modeless: true` a `actions` v `DialogSpec`.

## Ikony

Ikony jsou z **[Lucide](https://lucide.dev)** (ISC). Do repozitáře je zapisuje
`npm run icons`, který je vytáhne z `@iconify-json/lucide` podle mapy jmen
v `tools/build-icons.mjs`. Nové tlačítko znamená přidat tam řádek a skript
spustit — `packages/ui/src/icons.ts` se needituje ručně.

Generuje se, ne načítá za běhu: do balíčku jde 52 ikon místo celé sady
a `@iconify-json/lucide` zůstává vývojovou závislostí, kterou nikdo, kdo Nibble
používá, neinstaluje.

Jediný zásah do tvaru je síla čáry — z 2 na 1.75, protože v liště se ikona
zmenšuje na 18 px a plná dvojka je tam zbytečně tučná.

Licence a copyright jsou v [`licenses/lucide.txt`](licenses/lucide.txt). ISC
vyžaduje, aby copyright zůstal u všech kopií, takže ten soubor patří i do
distribuce.

## Seznam definic

`<dl>` má proti `<ul>` a `<ol>` dva druhy položek, které se střídají: `<dt>` je
termín, `<dd>` jeho vysvětlení. Psaní v něm proto vypadá jinak — **Enter
nepokračuje tím, čím uživatel právě psal**, ale přepne na ten druhý druh. Po
termínu se čeká vysvětlení, po vysvětlení další termín:

| Kde je kurzor | Enter |
|---|---|
| v `<dt>` | vznikne `<dd>` |
| v `<dd>` | vznikne `<dt>` |
| v prázdném prvku | odstavec za seznamem |

Dva odstavce v jednom vysvětlení se dělají Shift+Enterem, tedy `<br>`.

Zapnutí z odstavců je střídá stejně: první termín, druhý vysvětlení, třetí zase
termín. Kdo píše seznam definic jako odstavce, píše je právě takhle — a po
převodu tedy nemusí nic překlikávat.

**Zanořování tady schválně není.** `<dl>` uvnitř `<dd>` je platné HTML, ale
ovládat ho Tabem jako u seznamu by znamenalo rozhodnout, jestli se zanořuje
termín, vysvětlení, nebo obojí — a žádná z odpovědí není zjevná. Tab proto
v seznamu definic zůstává na fokusu.

V liště tlačítko není: definiční seznamy jsou málo časté a lišta je plná.
Najdete ho v *Formát → Seznam* a v nastavení lišty, kdyby ho někdo chtěl mít
po ruce.

## Vlastnosti seznamu

Druh značky, odsazení a počáteční číslo. Dialog se otevře z kontextové lišty
u kurzoru nebo z *Formát → Seznam*.

Zapisuje se **atribut i vlastnost stylu současně**:

```html
<ol type="a" style="list-style-type: lower-alpha;" start="3">
<ul type="square" style="list-style-type: square;">
<ol style="list-style-type: none;">     <!-- „bez značky": atribut na to není -->
```

Vypadá to jako zbytečná dvojkolejnost, ale každá půlka je jinde k něčemu:
`list-style-type` umí i to, na co atribut nestačí, a `type` projde i tam, kde
se inline styl seznamu nedodrží. Uložené HTML se čte i jinde než v prohlížeči.

Odrážky jdou nastavit i na znak — pomlčka, šipka, fajfka. `list-style-type`
bere kromě klíčových slov i řetězec, takže se obejdou bez stylopisu u obsahu:

```html
<ul style="list-style-type: &quot;– &quot;;">
```

**Oddělovač za číslem — tečka, závorka — Nibble nenabízí, a je v tom rozdíl
proti znakovým odrážkám.** Řetězec v `list-style-type` je statický: jako
odrážka poslouží, ale počítat neumí. HTML na to nemá nic
a přenositelné CSS taky ne: `::marker { content }` i `@counter-style` potřebují
stylopis u obsahu a jinde spadnou zpátky na tečku. Slíbit v dialogu něco, co se
v půlce míst nezobrazí, je horší než to nenabídnout.

Každá úroveň je vlastní `<ul>`/`<ol>`, takže se nastavuje samostatně. Dialog
proto vysází skupinu polí pro každou úroveň nad kurzorem — u jednoúrovňového
seznamu jsou dvě pole, ve třetí úrovni devět. Rozbalovátko „která úroveň" by
nešlo: dialog se vrací až při potvrzení, takže po jeho přepnutí se zbylá pole
nemají jak přenačíst.

Otevřít dialog a potvrdit beze změny **nesmí obsahem hnout**. Zápis do `style`
jde přes CSSOM, který atribut vždycky přepíše kanonickým tvarem — z
`style="list-style-type:lower-alpha"` by se stalo `list-style-type: lower-alpha;`
a přeformátoval by se blok, kterého se nikdo nedotkl. Zápis proto při shodné
hodnotě nesáhne na nic.

## Vlastnosti tabulky a řádku

Dialogy nabízejí to, co je v datech vidět: `cellpadding` (5×), `border` (2×),
`width` a `border-collapse` ve stylu. Řádky v produkčním obsahu nenesou nic
a `<thead>` tam není ani jednou — právě proto má smysl umět řádek na záhlaví
přepnout, jinak se k němu uživatel nedostane. Přepnutí přitom **přepíše buňky
na `<th>`**; bez toho by to za záhlaví nepovažoval prohlížeč ani čtečka.

Barvy se zadávají textem, ne výběrem barvy. Vypadá to jako krok zpět, ale
`<input type="color">` každou hodnotu převede na `#rrggbb` — a tabulka, která
má v obsahu `rgb(245, 245, 245)`, by se tím přepsala už jen otevřením dialogu.
Textové pole vrátí beze změny to, co bylo.

## Rozměr tabulky se vybírá okem

Tlačítko *Tabulka* otevře mřížku: najetím se ukáže `3 × 4`, kliknutím tabulka
vznikne. Mřížka se přitom rozrůstá pod rukou — jakmile najedete do posledního
řádku nebo sloupce, přibude další, takže pevný strop není vidět, dokud se do něj
nenarazí. Dialog s plným nastavením (záhlaví, přesná čísla) zůstává pod ní.

Mřížka je v registru vlastní druh prvku, stejně jako barva. Jádro ví, co se má
s vybraným rozměrem stát; jak mřížka vypadá a jak se v ní najíždí, je věc
vykreslení.

## Nabídkový pruh

Volitelný — zapíná se při připojení UI:

```js
attachToolbar(editor, { menubar: true });          // výchozí rozvržení
attachToolbar(editor, { menubar: [/* vlastní */] });
attachToolbar(editor);                             // jen lišta
```

Položky **odkazují na registrované prvky jménem**, ne na příkazy. Nabídka tak
neví nic o tom, co dělají ani kdy jsou dostupné — jen říká, co kde má být:

```js
{ label: 'Zarovnání', items: [
  { control: 'alignleft' }, { control: 'aligncenter' },
] }
```

Prvek, který nikdo nezaregistroval (protože se nenačetl jeho plugin), se
přeskočí i s oddělovačem. Bez pluginu tabulek zmizí celá nabídka *Tabulka* —
nabídka nikdy nenabízí něco, co neexistuje.

Barvy, písmo a druh bloku se z nabídky otevřou stejným ovládáním jako z lišty.
Nabídka je další cesta ke stejné věci, ne její druhá implementace.

> **Schránka z nabídky.** *Vyjmout* a *Kopírovat* fungují. *Vložit* potřebuje
> svolení prohlížeče; když ho uživatel nedá, editor to řekne nahlas místo aby
> se tvářil, že se nic nestalo. Klávesová zkratka funguje vždycky.

## Citace je obal, ne druh bloku

`<blockquote>` má podle specifikace obsahový model *flow content*, takže obojí
je platné HTML:

```html
<blockquote>text</blockquote>                  <!-- platné -->
<blockquote><p>text</p></blockquote>           <!-- platné, a Nibble píše tohle -->
```

Druhá varianta vyhrála ze čtyř důvodů: takhle to má **všech 14 citací
v produkčním obsahu**, příklady ve specifikaci ji používají taky, víceodstavcová
citace `<p>` potřebuje tak jako tak (a dva tvary pro jednu věc nikdo nechce)
a hlavně — uvnitř citace pořád jsou odstavce, jen jsou citované. Zarovnání,
Enter i výběr druhu bloku pak fungují na tom, co tam opravdu je.

Holá citace ze staršího obsahu se ale **při načtení nepřepisuje**. Srovná se až
při první úpravě, stejně líně jako neplatná struktura seznamů. Psaní se za
úpravu struktury nepovažuje: napsat znak do `<blockquote>text</blockquote>` dá
`<blockquote>text!</blockquote>`, ne přeskládaný dokument.

## Písmo

Nabídka má tři patra a každé má svůj důvod:

| | co to je | proč |
|---|---|---|
| **Obecné rodiny** | `sans-serif`, `serif`, `monospace`, `cursive` | Vysází se tím, co má čtenář po ruce. Přežije jakýkoli systém, nic se nestahuje. |
| **Klasiky** | Arial, Times New Roman, Georgia… | Jsou na Windows i macOS a v reálném obsahu už jsou (`arial, helvetica, sans-serif`). |
| **Google Fonts** | Roboto, Open Sans, Inter… | Vypadají všude stejně, ale stahují se za běhu. |

Každá položka je v nabídce vysázená svým písmem — člověk si vybírá okem, ne
podle názvu. Proto to není `<select>`: nativní `<option>` se napříč systémy
vlastním písmem vysázet nedá.

Google písma se stahují ve dvou okamžicích: **při otevření nabídky** (aby
náhledy dávaly smysl) a **při načtení obsahu**, který nějaké používá. Roboto
v cílovém projektu už je, takže bez toho druhého by se stará stránka vykreslila
náhradním písmem jen proto, že si ho čtenář nenainstaloval.

Stahování z Googlu je požadavek na cizí server. Kdo ho nechce, vypne ho:

```js
createFontPlugin({ loadGoogleFonts: false })          // jen systémová písma
createFontPlugin({ googleFonts: ['Roboto', 'Lato'] }) // vlastní výběr
createFontPlugin({ sizes: [10, 12, 14, 18, 24] })     // vlastní řada velikostí
```

Písmo se poznává podle **první rodiny v zásobníku**. Obsah z TinyMCE má
`Georgia, serif`, nabídka `Georgia, "Times New Roman", serif` — a je to totéž
písmo; zbytek zásobníku je jen záchrana.

> **Pozor na vkládání.** Čištění schránky `font-family` a `font-size` zahazuje
> záměrně: z Wordu přijde Calibri 11pt úplně na všem. Znamená to ale, že
> kopírování uvnitř editoru písmo neponese. Je to vědomý kompromis ve prospěch
> častějšího případu. Výjimkou je velikost písma uvnitř vložené tabulky — tam
> odlišuje nadpis od poznámky pod čarou a přebírá se jako poměr v `em`.

## Barvy

Výběr barvy má dva listy — kolo a palety — protože přesně tak to funguje
v Lattice, gridu používaném v cílovém projektu. Lidé to tam znají a nemá smysl je učit
jiné ovládání.

Zapisuje se `<span style="color: …">`, tedy tvar, který je v cílovém projektu už dnes
(`color` 432×, `background-color` 457×). Nový obsah proto vypadá stejně jako
ten, který tam roky je.

Vlastní paletu předá hostitelská aplikace nebo plugin:

```js
editor.ui.addColor('forecolor', {
  icon: 'forecolor',
  tooltip: 'Barva písma',
  swatches: [{ color: '#1f5f5b', label: 'Firemní' }, /* … */],
  value: (ed) => currentColor(ed, 'forecolor'),
  onPick: (ed, color) => ed.exec('forecolor', color),
});
```

## Rámce jen z vybraných zdrojů

`<iframe>` je jednoznačně nebezpečný a jinak padá. Cílový projekt ale konfiguruje
plugin `media` třicetkrát — po seznamech, odkazech a tabulkách je to
nejpoužívanější věc vůbec — takže plošné zahazování by rozbilo něco, co lidé
používají.

Kompromisem je seznam povolených hostitelů. Uživatel vloží běžnou adresu videa,
plugin z ní udělá vkládací odkaz a jádro pak **při každém načtení** ověří, že
rámec míří tam, kam má:

```js
Nibble.create({
  target: '#obsah',
  allowedEmbedHosts: ['youtube-nocookie.com', 'vimeo.com', 'nas-intranet.cz'],
});
```

Bez uvedení platí výchozí seznam běžných video služeb. Prázdné pole zahodí
všechny rámce. I s výchozím seznamem je to přísnější než dnešní stav
v cílovém projektu, kde `valid_elements: '*[*]'` nekontroluje nic.

## Emotikony vkládají znak, ne obrázek

Plugin `emoji` otevře mřížku s kategoriemi a hledáním. Do obsahu se dostane
obyčejný znak — v uloženém HTML tedy nepřibude nic, co by se muselo hostovat,
sanitizovat nebo stahovat, a serializér prochází text po kódových bodech, takže
složené emoji (vlajky, ZWJ) přežijí uložení v celku.

Hledá se česky a bez ohledu na diakritiku: `zirafa` najde 🦒 stejně jako
`žirafa`. Kromě názvu se prohledávají i klíčová slova, takže `halloween` najde
dýni. Seznam je vědomě ruční výběr osmi set položek, ne úplná tabulka Unicode —
ta má přes tři tisíce znaků, česky pojmenovaných nikde, a nedá se v ní nic najít.
Kdo chce jiný, předá si vlastní:

```js
import { createEmojiPlugin } from '@nibble/plugins';

createEmojiPlugin({
  emoji: [{ char: '🦫', name: 'bobr', category: 'priroda', keywords: ['hlodavec'] }],
  categories: [{ key: 'priroda', label: 'Zvířata' }],
});
```

## Mapa znaků a české uvozovky

Plugin `charmap` je tatáž mřížka, jen s jiným seznamem: interpunkce, mezery,
měny, matematika, zlomky, šipky, písmena s diakritikou, řecká abeceda a symboly.
Políčka se sázejí písmem obsahu, ne barevným písmem emoji — v mapě znaků má být
vidět přesně to, co se vloží do textu.

Uloží se to tak, jak to z projektu lidé znají: při `entityEncoding: 'named'`
serializér sáhne do tabulky HTML4, takže z `©` bude `&copy;` a z `½` `&frac12;`.
Zapisovat entity ručně tedy není kde.

Dvě věci, které mapa znaků řeší a mřížka emotikonů ne:

- **Neviditelné znaky.** Pevná mezera je pro české sazby ta nejužitečnější
  položka celé mapy a přitom není vidět. Prázdné políčko vypadá jako chyba
  vykreslení, takže se místo ní ukáže náhrada `␣` — vloží se pořád ta mezera.
  V uloženém HTML z ní je `&nbsp;` vždycky, bez ohledu na nastavení entit:
  zapsaná doslova je k nerozeznání od obyčejné mezery a nikdo by ji v obsahu
  nenašel.
- **Hledání podle kódu.** `U+00A9` i `00a9` najde `©`. Je to jediná cesta ke
  znaku, jehož český název člověk nezná, a kód se pod mřížkou i ukazuje.

## Editor ukazuje, jak to bude vypadat

Tabulka s vlastním `border` nebo `style` se v editoru vykreslí přesně tak, jak
se vykreslí na webu. Vodicí mřížku — čárkovanou, ať je poznat, že je to pomůcka
— dostanou jen tabulky, které se nestylují samy; bez ní by se do jejich buněk
nedalo trefit.

Kdyby si editor rámečky vynutil na všechno, ukazoval by něco jiného, než co
uživatel dostane. To je horší než neviditelné buňky.

## Bezpečnost odděleně od tvaru

Sanitizace běží vždy a řeší jen bezpečnost: `<script>`, `on*` atributy,
`javascript:` URL. O tom, co je hezký markup, rozhoduje schema — a to má dva
režimy:

- `legacy` propustí skoro všechno, protože stará data obsahují věci, které dnes
  nikdo psát nechce, ale mazat je při načtení by znamenalo tichou ztrátu,
- `strict` je to, co má vznikat nově.

Přechod se dělá vědomě. `editor.audit(html)` řekne, co by přísný režim
ovlivnil, aniž by na obsah sáhl — dá se tím projet celá databáze *předem*.

## Použití

```js
import { Nibble } from '@nibble/core';
import { attachToolbar } from '@nibble/ui';
import { link, createImagePlugin } from '@nibble/plugins';
import '@nibble/ui/nibble.css';

const editor = await Nibble.create({
  target: '#obsah',        // selector, element nebo textarea
  schema: 'legacy',
  height: 400,
  plugins: [
    link,
    createImagePlugin({
      // Bez adaptéru se obrázek vloží jako data: URL — to, co dnes dělá cílová aplikace.
      upload: async (file, onProgress) => {
        const body = new FormData();
        body.append('file', file);
        const res = await fetch('/api/upload', { method: 'POST', body });
        return (await res.json()).url;
      },
    }),
  ],
});
attachToolbar(editor, {
  menubar: true,            // nabídkový pruh nad lištou
  layoutBottom: [['code']], // skupiny do druhého řádku lišty
  prefsKey: 'clanky',       // pod čím se ukládá nastavení uživatele
  prefs: { height: '500px' },  // výchozí hodnoty; uživatel je může přebít
  settings: true,           // ozubené kolo vpravo nahoře; false ho schová
});

editor.on('change', ({ html }) => save(html));
```

Pluginy se předávají jako hodnoty, ne jako řetězec se jmény — bundler pak vidí,
co se opravdu používá, a zbytek vyhodí.

### Bez balíčkovače, rovnou z adresy

Sestavená knihovna je jeden soubor se vším z `core`, `ui` i `plugins`. Nic se
neinstaluje a nic nesestavuje:

```html
<link rel="stylesheet"
      href="https://cdn.jsdelivr.net/gh/svatekr70/nibble@v0.3.0/dist/nibble.css">
<div id="obsah"><p>Ahoj.</p></div>

<script type="module">
  import { Nibble, attachToolbar, link, image, table }
    from 'https://cdn.jsdelivr.net/gh/svatekr70/nibble@v0.3.0/dist/nibble.min.js';

  const editor = await Nibble.create({ target: '#obsah', plugins: [link, image, table] });
  attachToolbar(editor, { menubar: true });
</script>
```

**Verzi v adrese si pište vždycky.** `@v0.3.0` je neměnné — ten soubor už se
nikdy nezmění a jsDelivr ho drží v mezipaměti natrvalo. Bez verze (`@main`) se
tahá poslední stav hlavní větve, což je fajn na zkoušení a nebezpečné v ostrém
provozu.

Proto je `dist/` v repozitáři, i když se sestavuje: jsDelivr servíruje soubory
přímo z tagu a bez commitnutého buildu by ta adresa neexistovala. Že bundle
sedí se zdrojem, hlídá CI — po sestavení musí být pracovní strom čistý.

Totéž leží i na projektovém webu
(`https://svatekr70.github.io/nibble/dist/nibble.min.js`), tam je ale vždy
poslední stav hlavní větve.

Při napojení na `<textarea>` zůstává textarea zdrojem pravdy pro odeslání
formuláře — stačí tedy vyměnit jeden řádek a odesílání funguje dál.

## Vývoj

```bash
npm install
npm test           # 457 jednotkových testů (vitest + linkedom)
npm run e2e        # 287 testů v Chromiu (Playwright)
npm run test:all   # obojí
npm run typecheck
npm run build      # bundly do demo/dist + velikost
npm run demo       # http://localhost:4321
npm run fixtures   # nový vzorek z ostrého provozu (chce lokální MySQL)
```

Playwright nikde neběží trvale — spouští se na vyžádání a jede headless.
Server na portu 4321 si nastartuje sám.

```bash
npm run e2e -- --headed        # s viditelným prohlížečem
npm run e2e:ui                 # interaktivní režim, dá se krokovat
npx playwright show-report     # report z posledního běhu
```

Demo ukazuje round-trip naživo: načte reálný dokument a průběžně hlásí, jestli
by se uložil beze změny.

### Co se čím testuje

Model (schema, parser, serializer, round-trip, práce s bloky) běží ve `vitest`
nad `linkedom`. Výběr, `beforeinput`, historie a lišta jsou v Playwrightu
v `e2e/`.

Dělicí čára není podle vrstev, ale podle toho, co linkedom umí. Ukázalo se, že
se od prohlížeče liší víc, než by člověk čekal:

| | linkedom | prohlížeč |
|---|---|---|
| `\r\n` v textovém uzlu | zachová | převede na `\n` |
| `Range.setStart` | nemá | má |
| pořadí atributů po `setAttribute` | nezachová | zachová |
| serializace stylu | `width:100%` | `width: 100%` |

Každý z těch rozdílů už jednou způsobil, že testy svítily zeleně u chování,
které v Chrome neplatilo. **Cokoli kolem bílých znaků, rozsahů, výběru a
serializace patří ověřit i v prohlížeči.**

### Pozor na živé rozsahy

Přesun uzlu podle specifikace posune i živé rozsahy: jakmile se `<ul>` přendá
jinam, kurzor uvnitř něj vyskočí na rodiče. Operace, které mění strukturu
(seznamy), si proto **před** zásahem uloží odkaz na uzel, ne cestu indexů —
`Bookmark` po přeskládání ukazuje jinam. Viz `captureCaret` v
`packages/core/src/commands/lists.ts`.

## Struktura

```
packages/core     jádro — model, DOM, výběr, historie, příkazy, vstup, registr UI
packages/ui       vykreslení — lišta, plovoucí lišta, dialogy, ikony, CSS
packages/plugins  odkazy, obrázky, tabulky, videa, emotikony, nástroje
e2e               testy v prohlížeči (Playwright)
tools             extrakce vzorku z ostrého provozu, build, dev server
demo              ukázka round-tripu + zkušební stránka pro e2e
```

## Licence

MIT.
