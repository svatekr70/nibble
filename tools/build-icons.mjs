import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';

/**
 * Vygeneruje `packages/ui/src/icons.ts` z vybrané sady ikon.
 *
 * Ikony se do repozitáře zapisují, nečtou se za běhu — Nibble tak nemá žádnou
 * runtime závislost a `@iconify-json/*` zůstává jen vývojovým nástrojem.
 * Do balíčku jde 54 ikon, ne celá sada.
 *
 *     node tools/build-icons.mjs            aktivní sada (ACTIVE)
 *     node tools/build-icons.mjs tabler     jiná sada
 *     node tools/build-icons.mjs --preview  srovnávací stránka demo/icons.html
 *     node tools/build-icons.mjs --live     kontrolní stránka demo/icons-live.html
 *
 * Kdyby přibylo tlačítko, dopíše se řádek do `LABELS` a do mapy každé sady.
 */

const require = createRequire(import.meta.url);

/** Která sada se právě používá. Změna = spustit skript a přeložit. */
const ACTIVE = 'tabler';

/**
 * Popisky tlačítek. Drží pořadí ikon a slouží i jako seznam toho, co každá
 * sada musí pokrýt — chybějící klíč skript ohlásí a skončí.
 */
const LABELS = {
  undo: 'Zpět',
  redo: 'Znovu',
  bold: 'Tučně',
  italic: 'Kurzíva',
  underline: 'Podtržení',
  strike: 'Přeškrtnutí',
  alignleft: 'Zarovnat vlevo',
  aligncenter: 'Na střed',
  alignright: 'Zarovnat vpravo',
  alignjustify: 'Do bloku',
  hr: 'Vodorovná čára',
  removeformat: 'Zrušit formátování',
  bullist: 'Odrážkový seznam',
  numlist: 'Číslovaný seznam',
  deflist: 'Seznam definic',
  listprops: 'Vlastnosti seznamu',
  indent: 'Zanořit',
  outdent: 'Vysunout',
  link: 'Odkaz',
  anchor: 'Kotva',
  unlink: 'Zrušit odkaz',
  openlink: 'Otevřít odkaz',
  image: 'Obrázek',
  trash: 'Odebrat',
  table: 'Tabulka',
  tableprops: 'Vlastnosti tabulky',
  rowprops: 'Vlastnosti řádku',
  rowplus: 'Přidat řádek pod',
  rowminus: 'Smazat řádek',
  colplus: 'Přidat sloupec vpravo',
  colminus: 'Smazat sloupec',
  merge: 'Sloučit s buňkou vpravo',
  split: 'Rozdělit buňku',
  header: 'Přepnout záhlaví',
  media: 'Video nebo zvuk',
  code: 'Zdrojový kód',
  inlinecode: 'Kód v textu',
  emoji: 'Emotikony',
  charmap: 'Speciální znaky',
  search: 'Najít a nahradit',
  fullscreen: 'Celá obrazovka',
  forecolor: 'Barva písma',
  backcolor: 'Barva pozadí',
  blockquote: 'Citace',
  superscript: 'Horní index',
  subscript: 'Dolní index',
  cut: 'Vyjmout',
  copy: 'Kopírovat',
  paste: 'Vložit',
  pastetext: 'Vložit jako text',
  selectall: 'Vybrat vše',
  lineheight: 'Řádkování',
  settings: 'Nastavení',
  more: 'Další',
};

/**
 * Sady ikon. `map` je Nibble → jméno v sadě, `tune` upraví nitro `<svg>`.
 *
 * Kreslicí sady se liší: Lucide a Tabler jsou tahy na mřížce 24 px, Phosphor
 * jsou výplně na mřížce 256 px. Proto se ztenčuje čára jen tam, kde nějaká je.
 */
const SETS = {
  lucide: {
    pkg: '@iconify-json/lucide',
    // Lucide kreslí se sílou čáry 2. V liště se ikona zmenšuje na 18 px, kde
    // je taková čára zbytečně tučná — proto se ztenčuje. Geometrie zůstává.
    tune: (body) => body.replaceAll('stroke-width="2"', 'stroke-width="1.75"'),
    map: {
      undo: 'undo-2', redo: 'redo-2',
      bold: 'bold', italic: 'italic', underline: 'underline', strike: 'strikethrough',
      alignleft: 'align-left', aligncenter: 'align-center',
      alignright: 'align-right', alignjustify: 'align-justify',
      hr: 'minus', removeformat: 'remove-formatting',
      bullist: 'list', numlist: 'list-ordered',
      deflist: 'list-collapse', listprops: 'list-filter',
      indent: 'indent-increase', outdent: 'indent-decrease',
      link: 'link', anchor: 'anchor', unlink: 'unlink', openlink: 'external-link',
      image: 'image', trash: 'trash-2',
      table: 'table', tableprops: 'table-properties', rowprops: 'rows-2',
      // Lucide nemá mazání řádku ani sloupce; „between" ikony kreslí vkládání,
      // takže rowminus/colminus tu neodpovídají popisku. Viz licenses/ a README.
      rowplus: 'between-vertical-start', rowminus: 'between-vertical-end',
      colplus: 'between-horizontal-start', colminus: 'between-horizontal-end',
      merge: 'table-cells-merge', split: 'table-cells-split',
      header: 'heading', media: 'video',
      code: 'code-xml', inlinecode: 'code',
      emoji: 'smile', charmap: 'omega', search: 'search', fullscreen: 'maximize',
      // Barva písma je účaří pod písmenem, ne štětec — tak to zná každý editor.
      forecolor: 'baseline', backcolor: 'paint-bucket',
      blockquote: 'quote', superscript: 'superscript', subscript: 'subscript',
      cut: 'scissors', copy: 'copy', paste: 'clipboard', pastetext: 'clipboard-type',
      selectall: 'square-dashed', lineheight: 'align-vertical-space-around',
      settings: 'settings-2',
      // Svislá trojtečka: co se do lišty nevešlo.
      more: 'ellipsis-vertical',
    },
  },

  tabler: {
    pkg: '@iconify-json/tabler',
    tune: (body) => body.replaceAll('stroke-width="2"', 'stroke-width="1.75"'),
    map: {
      undo: 'arrow-back-up', redo: 'arrow-forward-up',
      bold: 'bold', italic: 'italic', underline: 'underline', strike: 'strikethrough',
      alignleft: 'align-left', aligncenter: 'align-center',
      alignright: 'align-right', alignjustify: 'align-justified',
      hr: 'minus', removeformat: 'clear-formatting',
      bullist: 'list', numlist: 'list-numbers',
      deflist: 'list-details', listprops: 'adjustments-horizontal',
      indent: 'indent-increase', outdent: 'indent-decrease',
      link: 'link', anchor: 'anchor', unlink: 'link-off', openlink: 'external-link',
      image: 'photo', trash: 'trash',
      table: 'table', tableprops: 'table-options', rowprops: 'table-row',
      // Tabler kreslí vkládání i mazání zvlášť, takže ikona sedí na popisek.
      rowplus: 'row-insert-bottom', rowminus: 'row-remove',
      colplus: 'column-insert-right', colminus: 'column-remove',
      merge: 'arrows-join-2', split: 'arrows-split-2',
      header: 'heading', media: 'movie',
      // `source-code` je v 18 px nečitelný chumel; `</>` pozná každý.
      code: 'code', inlinecode: 'code-dots',
      emoji: 'mood-smile', charmap: 'math-symbols',
      search: 'search', fullscreen: 'arrows-maximize',
      forecolor: 'text-color', backcolor: 'highlight',
      blockquote: 'blockquote', superscript: 'superscript', subscript: 'subscript',
      cut: 'cut', copy: 'copy', paste: 'clipboard', pastetext: 'clipboard-text',
      selectall: 'select-all', lineheight: 'line-height', settings: 'settings',
      more: 'dots-vertical',
    },
  },

  ph: {
    pkg: '@iconify-json/ph',
    // Phosphor jsou výplně, ne tahy — ztenčovat není co.
    tune: (body) => body,
    map: {
      undo: 'arrow-counter-clockwise', redo: 'arrow-clockwise',
      bold: 'text-b', italic: 'text-italic',
      underline: 'text-underline', strike: 'text-strikethrough',
      alignleft: 'text-align-left', aligncenter: 'text-align-center',
      alignright: 'text-align-right', alignjustify: 'text-align-justify',
      hr: 'minus', removeformat: 'text-t-slash',
      bullist: 'list-bullets', numlist: 'list-numbers',
      deflist: 'list-dashes', listprops: 'sliders-horizontal',
      indent: 'text-indent', outdent: 'text-outdent',
      link: 'link', anchor: 'anchor', unlink: 'link-break', openlink: 'arrow-square-out',
      image: 'image', trash: 'trash',
      table: 'table',
      // Phosphor nemá vlastnosti tabulky ani mazání řádku a sloupce. Náhrady
      // jsou obecné a na popisek nesedí — to je hlavní slabina téhle sady.
      tableprops: 'faders-horizontal', rowprops: 'rows',
      rowplus: 'rows-plus-bottom', rowminus: 'minus-square',
      colplus: 'columns-plus-right', colminus: 'minus-circle',
      merge: 'arrows-merge', split: 'square-split-horizontal',
      header: 'text-h', media: 'video',
      code: 'code-block', inlinecode: 'code',
      emoji: 'smiley',
      // Phosphor nemá omegu; sigma je nejbližší matematický znak.
      charmap: 'sigma',
      search: 'magnifying-glass', fullscreen: 'corners-out',
      forecolor: 'text-aa', backcolor: 'highlighter',
      blockquote: 'quotes', superscript: 'text-superscript', subscript: 'text-subscript',
      cut: 'scissors', copy: 'copy', paste: 'clipboard', pastetext: 'clipboard-text',
      selectall: 'selection-all', lineheight: 'arrows-in-line-vertical',
      settings: 'gear-six', more: 'dots-three-vertical',
    },
  },
};

/** Načte sadu a vrátí hotová těla ikon v pořadí podle `LABELS`. */
function load(key) {
  const def = SETS[key];
  if (!def) throw new Error(`Neznámá sada: ${key}. Mám ${Object.keys(SETS).join(', ')}.`);
  const set = require(`${def.pkg}/icons.json`);
  const info = require(`${def.pkg}/info.json`);

  const unmapped = Object.keys(LABELS).filter((n) => !def.map[n]);
  if (unmapped.length > 0) {
    console.error(`${key}: chybí mapa pro ${unmapped.join(', ')}`);
    process.exit(1);
  }
  const missing = Object.entries(def.map).filter(([, n]) => !set.icons[n]);
  if (missing.length > 0) {
    console.error(`${key}: v sadě nejsou ${missing.map(([k, v]) => `${k} → ${v}`).join(', ')}`);
    process.exit(1);
  }

  const icons = Object.keys(LABELS).map((name) => {
    const source = def.map[name];
    const body = def.tune(set.icons[source].body);
    if (body.includes("'")) throw new Error(`Apostrof v ${source} — řetězec by se rozpadl.`);
    return { name, source, body, label: LABELS[name] };
  });
  return { key, info, icons, viewBox: `0 0 ${set.width} ${set.height}` };
}

/** Zapíše `packages/ui/src/icons.ts`. */
async function writeIcons(key) {
  const { info, icons, viewBox } = load(key);
  const rows = icons.map((i) => `  ${i.name}: '${i.body}',`);

  const out = `/**
 * Ikony lišty.
 *
 * SOUBOR SE NEUPRAVUJE RUČNĚ — generuje ho \`node tools/build-icons.mjs\`
 * z map, které jsou v tom skriptu. Nové tlačítko znamená přidat řádek tam
 * a skript spustit.
 *
 * Zdroj: ${info.name} (${info.author.name}), ${info.license.title}.
 * ${info.author.url}
 *
 * Ikony jsou tady zapsané, ne načítané za běhu: do balíčku jde ${rows.length} ikon
 * místo celé sady a Nibble nemá žádnou runtime závislost. Uloženo je celé nitro
 * značky \`<svg>\`, ne jen data cesty — část ikon má víc tvarů než jeden \`<path>\`.
 */
export const ICONS: Record<string, string> = {
${rows.join('\n')}
};

/** Velikost mřížky, na které jsou ikony nakreslené. */
const VIEWBOX = '${viewBox}';

export function iconSvg(name: string): string {
  const body = ICONS[name] ?? '';
  return (
    '<svg viewBox="' + VIEWBOX + '" width="18" height="18" aria-hidden="true" ' +
    'focusable="false">' + body + '</svg>'
  );
}
`;
  await writeFile('packages/ui/src/icons.ts', out, 'utf8');
  console.log(`icons.ts: ${rows.length} ikon z ${info.name} (${info.license.title})`);
}

/** Vygeneruje `demo/icons.html` — všechny sady vedle sebe ve velikosti lišty. */
async function writePreview() {
  const sets = Object.keys(SETS).map(load);
  const head = sets.map((s) => `<th>${s.info.name}<small>${s.info.license.title}</small></th>`).join('');
  const rows = Object.keys(LABELS).map((name, i) => {
    const cells = sets.map((s) => {
      const ic = s.icons[i];
      return `<td><svg viewBox="${s.viewBox}">${ic.body}</svg><small>${ic.source}</small></td>`;
    }).join('');
    return `<tr><th scope="row">${LABELS[name]}<small>${name}</small></th>${cells}</tr>`;
  }).join('\n');

  await writeFile('demo/icons.html', `<!doctype html>
<html lang="cs"><meta charset="utf-8">
<title>Nibble — srovnání sad ikon</title>
<style>
  body { font: 14px/1.5 system-ui, sans-serif; margin: 2rem auto; max-width: 60rem;
         color: #1c1c1e; background: #fff; }
  h1 { font-size: 1.4rem; }
  p { color: #555; max-width: 42rem; }
  table { border-collapse: collapse; width: 100%; margin-top: 1.5rem; }
  th, td { border-bottom: 1px solid #e5e5e7; padding: .5rem; text-align: center; }
  thead th { position: sticky; top: 0; background: #fff; }
  th[scope=row] { text-align: left; font-weight: 500; width: 14rem; }
  small { display: block; color: #8a8a8e; font-size: 11px; font-weight: 400; }
  /* Přesně velikost v liště: 18 px. Kdo chce detail, přiblíží si prohlížečem. */
  svg { width: 18px; height: 18px; fill: none; stroke: currentColor; }
  /* Phosphor kreslí výplní, ne tahem — vlastní pravidlo. */
  tbody td:nth-child(4) svg { fill: currentColor; stroke: none; }
</style>
<h1>Srovnání sad ikon</h1>
<p>Všech ${Object.keys(LABELS).length} ikon lišty ve skutečné velikosti 18&nbsp;px.
Pod každou je její jméno ve zdrojové sadě. Generuje
<code>node tools/build-icons.mjs --preview</code>.</p>
<table>
<thead><tr><th scope="row">Tlačítko</th>${head}</tr></thead>
<tbody>
${rows}
</tbody></table>
`, 'utf8');
  console.log(`demo/icons.html: ${Object.keys(LABELS).length} ikon × ${sets.length} sady`);
}

/**
 * Vygeneruje `demo/icons-live.html` — kontrola, že prohlížeč kreslí to, co je
 * přeložené.
 *
 * Vzniklo z toho, že po výměně sady demo vypadalo pořád stejně. Modul si
 * prohlížeč drží v cache a tvrdé načtení se na `type="module"` nemusí projevit,
 * takže se dá dlouho hledat chyba tam, kde žádná není. Tahle stránka si modul
 * natáhne dynamickým importem s časovým razítkem, takže cache obejde vždycky,
 * a vedle živé ikony ukáže obě sady zapečené při generování. Když se živý
 * sloupec shoduje s Tablerem, běží nový překlad; když s Lucide, běží starý.
 */
async function writeLive() {
  const sets = ['lucide', 'tabler'].map(load);
  const rows = Object.keys(LABELS).map((name, i) => {
    const baked = sets.map((s) =>
      `<td class="baked"><svg viewBox="${s.viewBox}">${s.icons[i].body}</svg></td>`).join('');
    return `<tr data-icon="${name}"><th scope="row">${LABELS[name]}<small>${name}</small></th>`
      + `<td class="live"></td>${baked}<td class="verdict"></td></tr>`;
  }).join('\n');

  await writeFile('demo/icons-live.html', `<!doctype html>
<html lang="cs"><meta charset="utf-8">
<title>Nibble — co prohlížeč opravdu kreslí</title>
<style>
  body { font: 14px/1.5 system-ui, sans-serif; margin: 2rem auto; max-width: 52rem;
         color: #1c1c1e; background: #fff; }
  h1 { font-size: 1.4rem; }
  p { color: #555; max-width: 40rem; }
  #stav { padding: .75rem 1rem; border-radius: 8px; font-weight: 500; margin: 1rem 0; }
  .ok { background: #e8f5e9; color: #1b5e20; }
  .zle { background: #ffebee; color: #b71c1c; }
  table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
  th, td { border-bottom: 1px solid #e5e5e7; padding: .45rem; text-align: center; }
  thead th { position: sticky; top: 0; background: #fff; }
  th[scope=row] { text-align: left; font-weight: 500; width: 13rem; }
  small { display: block; color: #8a8a8e; font-size: 11px; font-weight: 400; }
  svg { width: 18px; height: 18px; }
  .live svg { outline: 1px dashed #c7c7cc; outline-offset: 3px; }
  .verdict { font-size: 12px; width: 7rem; }
</style>
<h1>Co prohlížeč opravdu kreslí</h1>
<p>Sloupec <b>živě</b> se natahuje dynamickým importem s časovým razítkem, takže
cache obejde i tehdy, když tvrdé načtení nepomůže. Je to tentýž modul
a tatáž funkce <code>iconSvg()</code>, kterou používá lišta editoru. Vedle jsou
obě sady zapečené při generování stránky.</p>
<div id="stav">Načítám modul…</div>
<table>
<thead><tr><th scope="row">Tlačítko</th><th>živě<small>z /dist</small></th>
<th>Lucide<small>staré</small></th><th>Tabler<small>nové</small></th>
<th>shoda</th></tr></thead>
<tbody>
${rows}
</tbody></table>
<script type="module">
const stav = document.getElementById('stav');
try {
  // Razítko v adrese je to jediné, co spolehlivě obejde cache modulů.
  const ui = await import('/dist/ui/src/index.js?v=' + Date.now());
  let tabler = 0, lucide = 0;
  for (const tr of document.querySelectorAll('tbody tr')) {
    const live = ui.iconSvg(tr.dataset.icon);
    tr.querySelector('.live').innerHTML = live;
    // Porovnává se vykreslený tvar, ne řetězec: prohlížeč atributy přerovná.
    const shape = (el) => el?.querySelector('svg')?.innerHTML.replace(/\s+/g, '') ?? '';
    const [cLucide, cTabler] = tr.querySelectorAll('.baked');
    const now = shape(tr.querySelector('.live'));
    const je = now === shape(cTabler) ? 'Tabler' : now === shape(cLucide) ? 'Lucide' : '—';
    if (je === 'Tabler') tabler++; else if (je === 'Lucide') lucide++;
    tr.querySelector('.verdict').textContent = je;
  }
  const total = document.querySelectorAll('tbody tr').length;
  const ok = tabler > lucide;
  stav.className = ok ? 'ok' : 'zle';
  stav.textContent = ok
    ? \`Běží NOVÝ překlad: \${tabler} z \${total} ikon je Tabler.\`
    : \`Běží STARÝ překlad: \${lucide} z \${total} ikon je pořád Lucide. Spusť npm run build.\`;
} catch (e) {
  stav.className = 'zle';
  stav.textContent = 'Modul se nenačetl: ' + e.message + ' — je spuštěné npm run demo?';
}
</script>
`, 'utf8');
  console.log(`demo/icons-live.html: ${Object.keys(LABELS).length} ikon, živě z /dist`);
}

const arg = process.argv[2];
if (arg === '--preview') await writePreview();
else if (arg === '--live') await writeLive();
else await writeIcons(arg ?? ACTIVE);
