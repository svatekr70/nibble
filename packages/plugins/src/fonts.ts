import type { Editor, MenuItem, Plugin } from '@nibble/core';

/**
 * Výběr písma a jeho velikosti.
 *
 * Nabídka má tři patra a každé má svůj důvod:
 *
 *  - **Obecné rodiny** (`sans-serif`, `serif`, …) — text se vysází tím, co má
 *    čtenář po ruce. Přežije to jakýkoli systém a nic se nestahuje.
 *  - **Klasiky** (Arial, Times, …) — jsou na Windows i macOS a v uloženém
 *    reálném obsahu jsou taky (`arial, helvetica, sans-serif`).
 *  - **Google Fonts** — vypadají všude stejně, ale musí se stáhnout. Roboto
 *    v reálném obsahu už je, takže bez nich by se stará stránka vykreslila
 *    jinak, než jak ji autor viděl.
 *
 * Písmo se zapisuje jako `<span style="font-family: …">`, tedy tvarem, který
 * v obsahu už je.
 */

export interface FontOptions {
  /** Nabízená Google písma. Prázdné pole je vypne úplně. */
  googleFonts?: readonly string[];
  /** Stahovat Google písma? Vypnuto znamená žádný požadavek ven. */
  loadGoogleFonts?: boolean;
  /** Nabízené velikosti v pixelech. */
  sizes?: readonly number[];
}

interface FontEntry {
  label: string;
  stack: string;
  google?: boolean;
  separator?: boolean;
}

const GENERIC: FontEntry[] = [
  { label: 'Bezpatkové', stack: 'sans-serif' },
  { label: 'Patkové', stack: 'serif' },
  { label: 'Neproporcionální', stack: 'monospace' },
  { label: 'Psací', stack: 'cursive' },
];

const CLASSIC: FontEntry[] = [
  { label: 'Arial', stack: 'Arial, Helvetica, sans-serif', separator: true },
  { label: 'Arial Black', stack: '"Arial Black", Gadget, sans-serif' },
  { label: 'Helvetica', stack: 'Helvetica, Arial, sans-serif' },
  { label: 'Verdana', stack: 'Verdana, Geneva, sans-serif' },
  { label: 'Tahoma', stack: 'Tahoma, Geneva, sans-serif' },
  { label: 'Trebuchet MS', stack: '"Trebuchet MS", Helvetica, sans-serif' },
  { label: 'Times New Roman', stack: '"Times New Roman", Times, serif' },
  { label: 'Georgia', stack: 'Georgia, "Times New Roman", serif' },
  { label: 'Courier New', stack: '"Courier New", Courier, monospace' },
];

export const DEFAULT_GOOGLE_FONTS: readonly string[] = [
  'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Inter',
  'Merriweather', 'Playfair Display', 'Source Sans 3', 'JetBrains Mono',
];

const DEFAULT_SIZES: readonly number[] = [
  8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72,
];

/** Zásobník písma pro Google rodinu — vždy s obecnou rodinou jako záchranou. */
function googleStack(family: string): string {
  const fallback = /mono/i.test(family) ? 'monospace'
    : /playfair|merriweather|serif/i.test(family) ? 'serif'
    : 'sans-serif';
  return '"' + family + '", ' + fallback;
}

/** Porovnání zásobníků: na uvozovkách, mezerách ani velikosti písmen nezáleží. */
export function sameStack(a: string, b: string): boolean {
  const norm = (s: string): string =>
    s.toLowerCase().replace(/["']/g, '').replace(/\s*,\s*/g, ',').trim();
  return norm(a) === norm(b);
}

/**
 * První rodina ze zásobníku — podle ní se poznává, jaké písmo je nastavené.
 *
 * Celý zásobník porovnávat nejde: TinyMCE zapisuje `Georgia, serif`, nabídka
 * nabízí `Georgia, "Times New Roman", serif` a je to totéž písmo. Rozhoduje
 * to, co se má vysázet jako první; zbytek je jen záchrana.
 */
export function firstFamily(stack: string): string {
  return (stack.split(',')[0] ?? '')
    .toLowerCase().replace(/["']/g, '').trim();
}

export function sameFamily(a: string, b: string): boolean {
  return firstFamily(a) === firstFamily(b);
}

/**
 * Stahování Google písem.
 *
 * Jeden `<link>` na celou sadu, ne na každou rodinu zvlášť — je to jeden
 * požadavek místo deseti. `display=swap` znamená, že se text ukáže hned
 * v náhradním písmu a přeteče, až rodina dorazí; čekat na písmo s prázdnou
 * stránkou je horší než chvilkový přeskok.
 */
const loaded = new Set<string>();

function loadGoogleFamilies(families: readonly string[], doc: Document): void {
  const missing = families.filter((f) => !loaded.has(f));
  if (missing.length === 0) return;

  for (const family of missing) loaded.add(family);

  const query = missing
    .map((f) => 'family=' + encodeURIComponent(f).replace(/%20/g, '+') + ':wght@400;700')
    .join('&');

  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?' + query + '&display=swap';
  link.dataset.nibbleFonts = 'true';
  doc.head.appendChild(link);
}

/** Rodiny, které obsah opravdu používá — kvůli otevření staré stránky. */
export function familiesInContent(html: string, known: readonly string[]): string[] {
  const lower = html.toLowerCase();
  return known.filter((family) => lower.includes(family.toLowerCase()));
}

function currentValue(editor: Editor, property: string): string | null {
  const range = editor.selection.getRange();
  return range ? editor.formatter.queryStyle(range, property) : null;
}

function applyStyleCommand(editor: Editor, property: string, value: string | null): boolean {
  const range = editor.selection.getRange();
  if (!range || range.collapsed) return false;

  const next = value === null || value === ''
    ? editor.formatter.removeStyle(range, property)
    : editor.formatter.applyStyle(range, property, value);

  editor.selection.setRange(next);
  editor.commit('font');
  return true;
}

export function createFontPlugin(options: FontOptions = {}): Plugin {
  const googleFonts = options.googleFonts ?? DEFAULT_GOOGLE_FONTS;
  const useGoogle = (options.loadGoogleFonts ?? true) && googleFonts.length > 0;
  const sizes = options.sizes ?? DEFAULT_SIZES;

  const entries: FontEntry[] = [
    ...GENERIC,
    ...CLASSIC,
    ...googleFonts.map((family, i) => ({
      label: family,
      stack: googleStack(family),
      google: true,
      separator: i === 0,
    })),
  ];

  return {
    name: 'fonts',

    setup(editor) {
      const doc = editor.document;

      const ensureFonts = (): void => {
        if (useGoogle) loadGoogleFamilies(googleFonts, doc);
      };

      // Stará stránka s Robotem se musí vykreslit tak, jak ji autor viděl —
      // ne náhradním písmem jen proto, že si ho čtenář nenainstaloval.
      const ensureFontsForContent = (): void => {
        if (!useGoogle) return;
        const used = familiesInContent(editor.getHTML(), googleFonts);
        if (used.length > 0) loadGoogleFamilies(used, doc);
      };

      ensureFontsForContent();
      const offSet = editor.on('setcontent', ensureFontsForContent);

      editor.commands.add(
        'fontfamily',
        (ed, args) => applyStyleCommand(ed, 'font-family', typeof args === 'string' ? args : null),
        (ed) => { const r = ed.selection.getRange(); return !!r && !r.collapsed; },
      );

      editor.commands.add(
        'fontsize',
        (ed, args) => applyStyleCommand(ed, 'font-size', typeof args === 'string' ? args : null),
        (ed) => { const r = ed.selection.getRange(); return !!r && !r.collapsed; },
      );

      editor.ui.addMenu('fontfamily', {
        tooltip: 'Písmo',
        width: 150,
        placeholder: 'Písmo',
        items: () => {
          // `items` se volá při otevření nabídky — právě tehdy mají být písma
          // stažená, jinak by se všechny řádky vysázely stejně a výběr okem by
          // ztratil smysl. Zvláštní háček na otevření tím odpadá.
          ensureFonts();
          return entries.map((entry): MenuItem => ({
            value: entry.stack,
            label: entry.label,
            style: { 'font-family': entry.stack },
            ...(entry.separator ? { separator: true } : {}),
          }));
        },
        value: (ed) => currentValue(ed, 'font-family'),
        matches: sameFamily,
        enabled: (ed) => ed.can('fontfamily'),
        onPick: (ed, value) => { ed.focus(); ed.exec('fontfamily', value); },
      });

      editor.ui.addMenu('fontsize', {
        tooltip: 'Velikost písma',
        width: 74,
        placeholder: 'Velikost',
        items: (ed) => {
          const list = sizes.map((size): MenuItem => ({
            value: size + 'px',
            label: size + 'px',
            style: { 'font-size': Math.min(size, 22) + 'px' },
          }));

          // Obsah může nést velikost mimo řadu — `small`, `11pt` a podobně.
          // Nechat ji v nabídce je poctivější než tvrdit, že nastavená není.
          const current = currentValue(ed, 'font-size');
          if (current && !list.some((item) => sameStack(item.value, current))) {
            list.unshift({ value: current, label: current, separator: false });
          }
          return list;
        },
        value: (ed) => currentValue(ed, 'font-size'),
        enabled: (ed) => ed.can('fontsize'),
        onPick: (ed, value) => { ed.focus(); ed.exec('fontsize', value); },
      });

      return () => { offSet(); };
    },
  };
}

export const fonts: Plugin = createFontPlugin();
export { googleStack, loadGoogleFamilies };
