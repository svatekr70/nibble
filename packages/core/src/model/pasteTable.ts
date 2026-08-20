import type { PasteSource } from './clean.js';

/**
 * Úklid tabulek ze schránky.
 *
 * Tabulkové procesory posílají formátování ke každé buňce zvlášť, protože
 * neumějí do schránky dát pravidlo platné pro celou tabulku. V reálném vzorku
 * z Google Sheets (46 řádků × 41 sloupců) to dělá 119 kB ze 328 kB jen na
 * rámečcích — a přitom je ten rámeček v celém sešitu jediný: `1px solid
 * #000000`. Sloupec buněk se liší jen v tom, které strany zrovna kreslí, což
 * je detail vykreslování mřížky, ne záměr autora.
 *
 * Tenhle soubor proto hledá to, co je v tabulce společné, a zapisuje to
 * jednou. Výsledek má vypadat stejně — jde o kratší zápis téhož, ne o jiné
 * formátování.
 */

const SIDES = ['border-top', 'border-right', 'border-bottom', 'border-left'] as const;

/**
 * Základní velikost písma sešitu. Sheets posílá 10pt, Excel 11pt — a je to
 * jeho výchozí nastavení, ne rozhodnutí autora. Slouží jen jako měřítko:
 * velikosti buněk se proti ní přepočtou na `em`, takže si tabulka vzájemné
 * poměry ponese s sebou a přizpůsobí se písmu cílové stránky.
 */
const DEFAULT_BASE_PT = 11;

function readStyle(el: Element): Map<string, string> {
  const map = new Map<string, string>();
  for (const rule of (el.getAttribute('style') ?? '').split(';')) {
    const colon = rule.indexOf(':');
    if (colon < 0) continue;
    const name = rule.slice(0, colon).trim().toLowerCase();
    const value = rule.slice(colon + 1).trim();
    if (name && value) map.set(name, value);
  }
  return map;
}

function writeStyle(el: Element, style: Map<string, string>): void {
  if (style.size === 0) { el.removeAttribute('style'); return; }
  el.setAttribute(
    'style',
    Array.from(style, ([name, value]) => name + ': ' + value).join('; ') + ';',
  );
}

function normalizeValue(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function ptOf(value: string | undefined): number | null {
  const match = /^([\d.]+)pt$/.exec(normalizeValue(value ?? ''));
  if (!match) return null;
  const size = Number(match[1]);
  return Number.isFinite(size) && size > 0 ? size : null;
}

/**
 * Velikost písma na poměr k základu sešitu.
 *
 * `24pt` v sešitu s desetibodovým základem není „24 bodů", ale „dvaapůlkrát
 * větší než okolí". Na stránce s jiným písmem má platit to druhé.
 */
function toEm(value: string, basePt: number): string | null {
  const pt = ptOf(value);
  if (pt === null) return null;

  const ratio = Math.round((pt / basePt) * 100) / 100;
  if (ratio === 1) return null;
  return ratio + 'em';
}

/**
 * Nejčastější velikost písma mezi buňkami.
 *
 * Sheets napíše základ sešitu na tabulku, Excel nikam — vypíše ho ke každé
 * buňce zvlášť. Co má většina, je základ; zbytek se proti němu poměřuje.
 */
function commonSizePt(cells: readonly Element[]): number | null {
  const counts = new Map<number, number>();
  for (const cell of cells) {
    const pt = ptOf(readStyle(cell).get('font-size'));
    if (pt !== null) counts.set(pt, (counts.get(pt) ?? 0) + 1);
  }

  let best: number | null = null;
  let bestCount = 0;
  for (const [pt, count] of counts) {
    if (count > bestCount) { best = pt; bestCount = count; }
  }
  return best;
}

/** Zkrátí `0px 3px 0px 3px` na `0 3px`. Stejné odsazení, poloviční zápis. */
function shortenPadding(value: string): string {
  const parts = normalizeValue(value).split(' ').map((p) => (/^0[a-z%]*$/.test(p) ? '0' : p));
  if (parts.length === 4 && parts[0] === parts[2] && parts[1] === parts[3]) parts.length = 2;
  if (parts.length === 2 && parts[0] === parts[1]) parts.length = 1;
  if (parts.length === 3 && parts[0] === parts[2]) parts.length = 2;
  return parts.join(' ');
}

/**
 * Kreslí celá tabulka jeden a tentýž rámeček?
 *
 * Sheets vypisuje vnitřním buňkám jen pravou a spodní stranu a krajním navíc
 * levou a horní — protože se sousedními se stejně slijí. Když se všechny ty
 * zápisy shodují v hodnotě, je to jedna mřížka a dá se napsat jednou.
 */
function uniformBorder(cells: readonly Element[]): string | null {
  let found: string | null = null;
  let withBorder = 0;

  for (const cell of cells) {
    const style = readStyle(cell);
    let has = false;

    for (const name of [...SIDES, 'border']) {
      const value = style.get(name);
      if (value === undefined) continue;

      const normalized = normalizeValue(value);
      if (normalized === 'none' || normalized.startsWith('0')) return null;
      if (found === null) found = normalized;
      else if (found !== normalized) return null;
      has = true;
    }

    if (has) withBorder++;
  }

  // Musí ho mít úplně každá buňka. Excel kreslí rámeček jen kolem některých
  // oblastí — kdyby stačila shoda mezi těmi, co ho mají, dostal by mřížku
  // i zbytek listu a v obsahu by přibyly čáry, které v sešitu nejsou.
  return withBorder === cells.length ? found : null;
}

/**
 * Uklidí tabulky ve vloženém obsahu. Mění `root` na místě.
 */
export function tidyPastedTables(root: Element, source: PasteSource): void {
  const fromSheet = source === 'google-sheets' || source === 'excel';

  for (const table of Array.from(root.querySelectorAll('table'))) {
    const cells = Array.from(table.querySelectorAll('td, th'));
    if (cells.length === 0) continue;

    const tableStyle = readStyle(table);

    // Sheets posílá na tabulce `width:0px`. Je to jeho vnitřní značka, ne
    // šířka — kdyby prošla, tabulka se na stránce srazí do nuly.
    if (/^0[a-z%]*$/.test(normalizeValue(tableStyle.get('width') ?? 'x'))) {
      tableStyle.delete('width');
    }

    const basePt = ptOf(tableStyle.get('font-size')) ?? commonSizePt(cells) ?? DEFAULT_BASE_PT;
    tableStyle.delete('font-size');
    tableStyle.delete('font-family');

    const border = uniformBorder(cells);
    if (border !== null) {
      tableStyle.set('border-collapse', 'collapse');
      // Rámeček teď kreslí buňky samy, včetně vnějšího okraje tabulky.
      tableStyle.delete('border');
      table.removeAttribute('border');
    }

    // `vertical-align: bottom` je výchozí stav sešitu, ne rozhodnutí autora —
    // pozná se to podle toho, že ho mají úplně všechny buňky. Jakmile se
    // některá liší, nese zarovnání informaci a zůstává všude.
    const defaultVAlign = fromSheet
      && cells.every((cell) => readStyle(cell).get('vertical-align') === 'bottom');

    for (const cell of cells) {
      const style = readStyle(cell);

      if (border !== null) {
        for (const side of SIDES) style.delete(side);
        style.set('border', border);
      }
      if (defaultVAlign) style.delete('vertical-align');

      const padding = style.get('padding');
      if (padding !== undefined) style.set('padding', shortenPadding(padding));

      style.delete('font-family');
      const size = style.get('font-size');
      if (size !== undefined) {
        const em = toEm(size, basePt);
        if (em === null) style.delete('font-size');
        else style.set('font-size', em);
      }

      writeStyle(cell, style);
    }

    for (const row of Array.from(table.querySelectorAll('tr'))) {
      const style = readStyle(row);
      style.delete('font-family');
      writeStyle(row, style);
    }

    writeStyle(table, tableStyle);
  }
}
