import type { Editor, GlyphCategory, GlyphEntry, Plugin } from '@nibble/core';
import { glyphFor, parseGlyphTable } from './glyphTable.js';

/**
 * Mapa speciálních znaků.
 *
 * Poslední plugin ze seznamu, který cílový projekt konfiguruje a Nibble neuměl.
 * Vkládá se jím znak, který na klávesnici není — a v uloženém HTML z něj bude
 * to, co odtamtud lidé znají: při `entityEncoding: 'named'` se `©` uloží jako
 * `&copy;`, protože serializér sáhne do tabulky HTML4. Zapisovat entity ručně
 * se tedy nikde nemusí.
 *
 * Výběr je proti emotikonům užší a jinak vážený: seznam nemá být úplný, ale
 * má obsahovat všechno, co při psaní českého textu chybí — typografické
 * uvozovky, pomlčky, pevnou mezeru, měny, zlomky a řecká písmena.
 */

export const CHARMAP_CATEGORIES: readonly GlyphCategory[] = [
  { key: 'interpunkce', label: 'Interpunkce' },
  { key: 'mezery', label: 'Mezery a spojovníky' },
  { key: 'mena', label: 'Měna' },
  { key: 'matematika', label: 'Matematika' },
  { key: 'cisla', label: 'Čísla a zlomky' },
  { key: 'sipky', label: 'Šipky' },
  { key: 'pismena', label: 'Písmena s diakritikou' },
  { key: 'recka', label: 'Řecká abeceda' },
  { key: 'symboly', label: 'Symboly' },
];

/** Seznam jako tabulka; tvar řádku popisuje `parseGlyphTable`. */
const DATA: Readonly<Record<string, string>> = {
  interpunkce: `
„ uvozovka dolní dvojitá | ceska zacatek
“ uvozovka horní dvojitá | ceska konec anglicka zacatek
” uvozovka pravá dvojitá | anglicka konec
‚ uvozovka dolní jednoduchá | ceska zacatek
‘ uvozovka horní jednoduchá | ceska konec
’ apostrof | uvozovka prava jednoducha
« uvozovka francouzská levá | guillemet spicata
» uvozovka francouzská pravá | guillemet spicata
‹ uvozovka francouzská levá jednoduchá | guillemet
› uvozovka francouzská pravá jednoduchá | guillemet
– pomlčka | en dash rozsah od do
— dlouhá pomlčka | em dash
… výpustka | tri tecky elipsa
• odrážka | bullet punkt
‣ trojúhelníková odrážka | bullet
◦ prázdná odrážka | bullet krouzek
· prostřední tečka | interpunkt
† křížek | dagger poznamka zemrel
‡ dvojitý křížek | dagger poznamka
§ paragraf | sekce zakon
¶ odstavcová značka | pilcrow
¦ přerušená svislice | roura
‰ promile | tisicina
¿ obrácený otazník | spanelsky
¡ obrácený vykřičník | spanelsky
⁄ zlomková lomítka | solidus
`,

  mezery: `
U+00A0 pevná mezera | nedelitelna nbsp predlozka | ␣
U+202F úzká pevná mezera | nedelitelna narrow | ␣
U+2009 úzká mezera | thin | ␣
U+00AD měkký rozdělovník | shy delitelnik podminene deleni | -
U+2011 pevný spojovník | nedelitelny divis
`,

  mena: `
€ euro | mena
£ libra | mena
¥ jen | yen mena
¢ cent | mena
₽ rubl | mena
₴ hřivna | mena ukrajina
₹ rupie | mena indie
₩ won | mena korea
₺ lira | mena turecko
₪ šekel | mena izrael
¤ obecná měna | znak meny
ƒ zlatý | florin mena
`,

  matematika: `
× krát | nasobeni
÷ děleno | deleni
± plus minus | tolerance
∓ minus plus | tolerance
≈ přibližně rovno | zhruba
≠ nerovná se | ruzne
≡ identicky rovno | kongruence
≤ menší nebo rovno | nejvyse
≥ větší nebo rovno | nejmene
¬ negace | not
∞ nekonečno
√ odmocnina
∑ suma | soucet sigma
∏ součin | produkt
∫ integrál
∂ parciální derivace
∇ nabla | gradient
∈ náleží | prvek mnoziny
∉ nenáleží | prvek mnoziny
⊂ podmnožina
⊃ nadmnožina
∪ sjednocení | mnoziny
∩ průnik | mnoziny
∅ prázdná množina
∀ pro každé | kvantifikator
∃ existuje | kvantifikator
∴ tedy | proto
∵ protože
∝ úměrné | proporcionalni
∠ úhel
⊥ kolmý | kolmice
∥ rovnoběžný | rovnobezka
° stupeň | uhel teplota
′ minuta | uhlova prima stopa
″ vteřina | uhlova dvojprima palec
µ mikro | predpona jednotky
`,

  cisla: `
½ jedna polovina | zlomek
⅓ jedna třetina | zlomek
⅔ dvě třetiny | zlomek
¼ jedna čtvrtina | zlomek
¾ tři čtvrtiny | zlomek
⅛ jedna osmina | zlomek
⅜ tři osminy | zlomek
⅝ pět osmin | zlomek
⅞ sedm osmin | zlomek
⁰ horní index nula | exponent
¹ horní index jedna | exponent
² horní index dva | exponent druha mocnina
³ horní index tři | exponent treti mocnina
⁴ horní index čtyři | exponent
⁵ horní index pět | exponent
⁶ horní index šest | exponent
⁷ horní index sedm | exponent
⁸ horní index osm | exponent
⁹ horní index devět | exponent
₀ dolní index nula
₁ dolní index jedna
₂ dolní index dva
₃ dolní index tři
₄ dolní index čtyři
₅ dolní index pět
№ číslo | numero
`,

  sipky: `
← šipka doleva | zpet
→ šipka doprava | vpred
↑ šipka nahoru
↓ šipka dolů
↔ šipka obousměrná vodorovná
↕ šipka obousměrná svislá
↖ šipka vlevo nahoru
↗ šipka vpravo nahoru
↘ šipka vpravo dolů
↙ šipka vlevo dolů
⇐ dvojitá šipka doleva
⇒ dvojitá šipka doprava | implikace
⇑ dvojitá šipka nahoru
⇓ dvojitá šipka dolů
⇔ dvojitá šipka obousměrná | ekvivalence
⟵ dlouhá šipka doleva
⟶ dlouhá šipka doprava
↵ zalomení řádku | enter novy radek
`,

  pismena: `
à a s gravisem | prizvuk
á a s čárkou | akut dlouhe
â a s vokáněm | cirkumflex strieska
ä a s přehláskou | umlaut dve tecky
ã a s vlnovkou | tilda
å a s kroužkem | svedsky
ā a s pruhem | dlouhe macron
ą a s ogonkem | polsky
æ ligatura ae | spreze
ç c s cedillou | francouzsky
è e s gravisem | prizvuk
é e s čárkou | akut dlouhe
ê e s vokáněm | cirkumflex
ë e s přehláskou | umlaut
ę e s ogonkem | polsky
ì i s gravisem
í i s čárkou | akut dlouhe
î i s vokáněm | cirkumflex
ï i s přehláskou | umlaut
ı i bez tečky | turecky
ñ n s vlnovkou | tilda spanelsky
ò o s gravisem
ó o s čárkou | akut dlouhe
ô o s vokáněm | cirkumflex
ö o s přehláskou | umlaut
õ o s vlnovkou | tilda
ø o s přeškrtnutím | dansky norsky
ő o s dvojitým akutem | madarsky
œ ligatura oe | spreze
ù u s gravisem
ú u s čárkou | akut dlouhe
û u s vokáněm | cirkumflex
ü u s přehláskou | umlaut
ű u s dvojitým akutem | madarsky
ý y s čárkou | akut dlouhe
ÿ y s přehláskou | umlaut
ß ostré s | eszett nemecky
þ thorn | islandsky
ð eth | islandsky
ł l s přeškrtnutím | polsky
ğ g s obloučkem | turecky
À velké A s gravisem
Á velké A s čárkou | akut
Â velké A s vokáněm
Ä velké A s přehláskou
Å velké A s kroužkem
Æ velká ligatura AE
Ç velké C s cedillou
È velké E s gravisem
É velké E s čárkou | akut
Ê velké E s vokáněm
Ë velké E s přehláskou
Í velké I s čárkou | akut
Î velké I s vokáněm
Ï velké I s přehláskou
Ñ velké N s vlnovkou
Ó velké O s čárkou | akut
Ô velké O s vokáněm
Ö velké O s přehláskou
Õ velké O s vlnovkou
Ø velké O s přeškrtnutím
Œ velká ligatura OE
Ú velké U s čárkou | akut
Û velké U s vokáněm
Ü velké U s přehláskou
Ý velké Y s čárkou | akut
Þ velký thorn | islandsky
Ð velké eth | islandsky
Ł velké L s přeškrtnutím | polsky
`,

  recka: `
α alfa
β beta
γ gama
δ delta
ε epsilon
ζ zéta
η éta
θ théta
ι ióta
κ kappa
λ lambda
μ mí
ν ný
ξ ksí
ο omikron
π pí | ludolfovo cislo
ρ ró
σ sigma
ς koncové sigma
τ tau
υ ypsilon
φ fí
χ chí
ψ psí
ω omega
Γ velké gama
Δ velká delta | rozdil zmena
Θ velká théta
Λ velká lambda
Ξ velké ksí
Π velké pí | soucin
Σ velká sigma | suma
Φ velké fí
Ψ velké psí
Ω velká omega | ohm odpor
`,

  symboly: `
© copyright | autorska prava
® registrovaná známka | ochranna
™ ochranná známka | trademark
℗ zvukový záznam | phonogram
★ plná hvězda | hodnoceni
☆ prázdná hvězda | hodnoceni
✓ zaškrtnutí | fajfka hotovo ano
✗ křížek | ne chyba
☐ prázdné políčko | checkbox
☑ zaškrtnuté políčko | checkbox hotovo
♠ piky | karty
♥ srdce | karty
♦ káry | karty
♣ kříže | karty
♪ nota | hudba
♫ dvě noty | hudba
♯ křížek | hudba zvyseni
♭ béčko | hudba snizeni
☺ smajlík | usmev
☻ plný smajlík | usmev
♂ mužské pohlaví | mars
♀ ženské pohlaví | venuse
⌘ příkaz | cmd klavesa mac
⌥ alt | option klavesa mac
⇧ shift | klavesa
⇥ tabulátor | tab klavesa
⌫ mazání zpět | backspace klavesa
⎋ únik | escape klavesa
■ plný čtverec | tvar
□ prázdný čtverec | tvar
● plné kolečko | tvar
○ prázdné kolečko | tvar
▲ plný trojúhelník | tvar
▼ plný trojúhelník dolů | tvar
◆ plný kosočtverec | tvar
◇ prázdný kosočtverec | tvar
`,
};

/**
 * Kód znaku patří mezi klíčová slova.
 *
 * Kdo si `U+00A9` opíše z dokumentace, má ho v mapě najít — a je to i jediný
 * způsob, jak se dostat ke znaku, jehož český název člověk nezná.
 */
function withCodes(list: readonly GlyphEntry[]): readonly GlyphEntry[] {
  return list.map((entry) => {
    const points = Array.from(entry.char);
    if (points.length !== 1) return entry;

    const code = points[0]!.codePointAt(0)!.toString(16).padStart(4, '0');
    return { ...entry, keywords: [...(entry.keywords ?? []), code, 'u+' + code] };
  });
}

/** Nabízené znaky. */
export const CHARMAP: readonly GlyphEntry[] =
  withCodes(parseGlyphTable(DATA, CHARMAP_CATEGORIES));

export interface CharmapOptions {
  /** Vlastní seznam místo výchozího. */
  chars?: readonly GlyphEntry[];
  categories?: readonly GlyphCategory[];
}

async function openCharmapDialog(editor: Editor, options: CharmapOptions): Promise<void> {
  const data = await editor.ui.dialog({
    title: 'Speciální znaky',
    fields: [{
      type: 'chars',
      name: 'char',
      glyphs: options.chars ?? CHARMAP,
      categories: options.categories ?? CHARMAP_CATEGORIES,
    }],
    submitLabel: 'Vložit',
    cancelLabel: 'Zavřít',
  });

  if (data) editor.exec('charmap', data);
}

export function createCharmapPlugin(options: CharmapOptions = {}): Plugin {
  const list = options.chars ?? CHARMAP;

  return {
    name: 'charmap',

    setup(editor) {
      editor.commands.add('charmap', (ed, args) => {
        const char = glyphFor(args, list);
        if (!char) return false;
        return ed.exec('insertText', char);
      });

      editor.ui.addButton('charmap', {
        icon: 'charmap', tooltip: 'Speciální znaky',
        onAction: (ed) => { void openCharmapDialog(ed, options); },
      });
    },
  };
}

export const charmap: Plugin = createCharmapPlugin();
