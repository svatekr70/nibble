import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';

/**
 * Vygeneruje `packages/ui/src/icons.ts` z Lucide.
 *
 * Ikony se do repozitáře zapisují, nečtou se za běhu — Nibble tak nemá žádnou
 * runtime závislost a `@iconify-json/lucide` zůstává jen vývojovým nástrojem.
 * Do balíčku jde 52 ikon, ne celá sada.
 *
 * Kdyby přibylo tlačítko, dopíše se sem řádek do `MAP` a skript se spustí
 * znovu: `node tools/build-icons.mjs`.
 */

const require = createRequire(import.meta.url);
const SET = require('@iconify-json/lucide/icons.json');
const INFO = require('@iconify-json/lucide/info.json');

/** Nibble → Lucide. Vlevo jméno tlačítka, vpravo ikona v sadě. */
const MAP = {
  undo: 'undo-2',
  redo: 'redo-2',
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strike: 'strikethrough',
  alignleft: 'align-left',
  aligncenter: 'align-center',
  alignright: 'align-right',
  alignjustify: 'align-justify',
  hr: 'minus',
  removeformat: 'remove-formatting',
  bullist: 'list',
  numlist: 'list-ordered',
  deflist: 'list-collapse',
  listprops: 'list-filter',
  indent: 'indent-increase',
  outdent: 'indent-decrease',
  link: 'link',
  anchor: 'anchor',
  unlink: 'unlink',
  openlink: 'external-link',
  image: 'image',
  trash: 'trash-2',
  table: 'table',
  tableprops: 'table-properties',
  rowprops: 'rows-2',
  // Vložení řádku a sloupce: „between" ikony ukazují, kam nový přibude.
  rowplus: 'between-vertical-start',
  rowminus: 'between-vertical-end',
  colplus: 'between-horizontal-start',
  colminus: 'between-horizontal-end',
  merge: 'table-cells-merge',
  split: 'table-cells-split',
  header: 'heading',
  media: 'video',
  code: 'code-xml',
  inlinecode: 'code',
  emoji: 'smile',
  charmap: 'omega',
  search: 'search',
  fullscreen: 'maximize',
  // Barva písma je účaří pod písmenem, ne štětec — tak to zná každý editor.
  forecolor: 'baseline',
  backcolor: 'paint-bucket',
  blockquote: 'quote',
  superscript: 'superscript',
  subscript: 'subscript',
  cut: 'scissors',
  copy: 'copy',
  paste: 'clipboard',
  pastetext: 'clipboard-type',
  selectall: 'square-dashed',
  lineheight: 'align-vertical-space-around',
  settings: 'settings-2',
};

/**
 * Lucide kreslí na 24 px se sílou čáry 2. V liště se ikona zmenšuje na 18 px,
 * kde je taková čára zbytečně tučná — proto se ztenčuje. Je to jediný zásah
 * do tvaru; geometrie zůstává, jak ji autoři nakreslili.
 */
const STROKE = '1.75';

const missing = Object.entries(MAP).filter(([, name]) => !SET.icons[name]);
if (missing.length > 0) {
  console.error('V sadě chybí: ' + missing.map(([k, v]) => `${k} → ${v}`).join(', '));
  process.exit(1);
}

const rows = Object.entries(MAP).map(([name, source]) => {
  const body = SET.icons[source].body.replaceAll('stroke-width="2"', `stroke-width="${STROKE}"`);
  if (body.includes("'")) throw new Error(`Apostrof v ${source} — řetězec by se rozpadl.`);
  return `  ${name}: '${body}',`;
});

const out = `/**
 * Ikony lišty.
 *
 * SOUBOR SE NEUPRAVUJE RUČNĚ — generuje ho \`node tools/build-icons.mjs\`
 * z mapy jmen, která je v tom skriptu. Nové tlačítko znamená přidat řádek tam
 * a skript spustit.
 *
 * Zdroj: ${INFO.name} (${INFO.author.name}), ${INFO.license.title}.
 * ${INFO.author.url}
 *
 * Ikony jsou tady zapsané, ne načítané za běhu: do balíčku jde ${rows.length} ikon
 * místo celé sady a Nibble nemá žádnou runtime závislost. Uloženo je celé nitro
 * značky \`<svg>\`, ne jen data cesty — část ikon má víc tvarů než jeden \`<path>\`.
 */
export const ICONS: Record<string, string> = {
${rows.join('\n')}
};

/** Velikost mřížky, na které jsou ikony nakreslené. */
const VIEWBOX = '0 0 ${SET.width} ${SET.height}';

export function iconSvg(name: string): string {
  const body = ICONS[name] ?? '';
  return (
    '<svg viewBox="' + VIEWBOX + '" width="18" height="18" aria-hidden="true" ' +
    'focusable="false">' + body + '</svg>'
  );
}
`;

await writeFile('packages/ui/src/icons.ts', out, 'utf8');
console.log(`icons.ts: ${rows.length} ikon z ${INFO.name} (${INFO.license.title})`);
