import { sanitize } from './Sanitizer.js';
import { tidyPastedTables } from './pasteTable.js';

/**
 * Čištění vloženého obsahu.
 *
 * Tady se láme hlavní pravidlo Nibble. Načtený obsah se nikdy nemění, protože
 * ho někdo kdysi napsal a nikdo o změnu nežádal. Vložený obsah je ale nový —
 * vzniká právě teď a nese s sebou nepořádek zdrojové aplikace. Na něj se proto
 * pravidla vztahují v plné síle.
 *
 * Co přichází, je vidět v reálných datech: Google Docs (`dir="ltr"` 12 617×),
 * Quill (`class="ql-*"` 1 119×) a ProseMirror nebo ChatGPT (`data-start`
 * 1 022×). Word v uloženém obsahu není ani jednou, ale řeší se taky — do
 * schránky se dostane dřív nebo později.
 */

export type PasteSource =
  | 'word' | 'excel' | 'google-docs' | 'google-sheets' | 'quill' | 'prosemirror' | 'html';

const NODE_ELEMENT = 1;
const NODE_COMMENT = 8;

/** Značky, které v obsahu nemají co dělat, ať přijdou odkudkoli. */
const JUNK_TAGS = new Set([
  'meta', 'link', 'style', 'title', 'head', 'xml', 'o:p', 'w:sdt', 'script',
]);

/** Obaly, které nesou jen formátování zdrojové aplikace. */
const UNWRAP_TAGS = new Set(['font', 'center', 'big', 'tt', 'basefont', 'marquee', 'blink']);

/** Inline značky, které nemají co obalovat blok. */
const INLINE_TAGS = new Set([
  'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'span', 'small', 'mark',
  'sub', 'sup', 'code', 'font',
]);

const BLOCK_TAGS = new Set([
  'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre',
  'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'dl', 'dt', 'dd', 'hr',
]);

/**
 * Rozbalí inline značku, která obaluje blokový obsah.
 *
 * Google Docs kolem celého zkopírovaného úseku dává
 * `<b style="font-weight:normal" id="docs-internal-guid-…">` — kontejner, ne
 * formátování. `<b>` kolem `<p>` je navíc neplatné HTML a v editoru se pak
 * blok chová divně. Pravidlo je obecné schválně: platí i pro `<span>` kolem
 * tabulky a další podobné obaly, ať přijdou odkudkoli.
 */
function unwrapInlineAroundBlocks(root: Element): void {
  for (const el of Array.from(root.querySelectorAll('*'))) {
    if (!el.parentNode) continue;
    if (!INLINE_TAGS.has(el.tagName.toLowerCase())) continue;

    const hasBlock = Array.from(el.children)
      .some((child) => BLOCK_TAGS.has(child.tagName.toLowerCase()));
    if (!hasBlock) continue;

    const parent = el.parentNode;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  }
}

/** Atributy, které jsou jen stopa po tom, odkud se kopírovalo. */
const JUNK_ATTR_PREFIXES = ['data-pm-', 'data-sheets', 'data-docs-', 'data-ccp-', 'w:', 'o:', 'v:'];
const JUNK_ATTRS = new Set([
  'data-start', 'data-end', 'data-spread', 'data-list', 'data-section-id',
  'data-path-to-node', 'data-is-tooltip-wrapper', 'contenteditable', 'spellcheck',
  'aria-level', 'role', 'lang', 'xmlns',
]);

/**
 * Vlastnosti stylu navíc, které se pouštějí uvnitř tabulek.
 *
 * Plošně by neprošly — `width` a `padding` z odstavce nesou rozvržení cizí
 * stránky. V tabulce je to naopak to jediné, na čem záleží: mřížka, šířky
 * sloupců a výšky řádků jsou celý smysl toho, že se tabulka kopírovala.
 */
const TABLE_TAGS = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col']);
const TABLE_KEEP_STYLES = [
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-collapse', 'border-width', 'border-style', 'border-color',
  'width', 'height', 'padding', 'font-size',
];

const LIST_TAGS = new Set(['ul', 'ol']);

/**
 * Vlastnosti stylu, které se pouštějí na seznamech.
 *
 * Druh značky je informace, ne vzhled zdrojového dokumentu: kdo psal seznam
 * římskými číslicemi, chtěl římské číslice. Google Docs je posílá právě takhle,
 * ve stylu — bez tohohle by se ze všeho staly obyčejné arabské.
 */
const LIST_KEEP_STYLES = ['list-style-type', 'list-style-position'];

/** Vlastnosti stylu, které nesou úmysl autora, ne vzhled zdrojového dokumentu. */
const KEEP_STYLES = new Set([
  'color', 'background-color', 'text-align', 'font-weight',
  'font-style', 'text-decoration', 'text-decoration-line', 'vertical-align',
]);

export interface CleanOptions {
  /** Zdroj rozpoznaný z celého HTML. Bez něj se hádá z fragmentu. */
  source?: PasteSource;
  /** Které vlastnosti stylu si nechat. Prázdné pole zahodí styly úplně. */
  keepStyles?: readonly string[];
  /** Povolené značky. Co v seznamu není, se rozbalí a obsah zůstane. */
  allowedTags?: ReadonlySet<string>;
  /** Povolené atributy nad rámec `data-` a `aria-`. */
  allowedAttrs?: ReadonlySet<string>;
}

export function detectSource(html: string): PasteSource {
  // Tabulkové procesory se poznávají první. Sheets posílá ve svém bloku stylů
  // `br {mso-data-placement:same-cell;}`, takže by jinak prošel jako Word —
  // a spustila by se na něj přestavba wordovských seznamů.
  if (/google-sheets-html-origin|data-sheets-root/i.test(html)) return 'google-sheets';
  if (/urn:schemas-microsoft-com:office:excel|content="?Excel\.Sheet|<x:ExcelWorkbook/i.test(html)) {
    return 'excel';
  }
  if (/mso-|<o:p|MsoNormal|urn:schemas-microsoft-com/i.test(html)) return 'word';
  if (/docs-internal-guid|data-sheets/i.test(html)) return 'google-docs';
  if (/class="ql-|data-list=/i.test(html)) return 'quill';
  if (/data-pm-|data-start=/i.test(html)) return 'prosemirror';
  return 'html';
}

/**
 * Word a Google Docs posílají celý dokument s hlavičkou. Užitečná je jen část
 * mezi značkami fragmentu, případně obsah <body>.
 */
export function extractFragment(html: string): string {
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);

  const start = html.indexOf('<!--StartFragment-->');
  const end = html.indexOf('<!--EndFragment-->');
  if (start >= 0 && end > start) {
    const fragment = html.slice(start + '<!--StartFragment-->'.length, end);

    // Excel klade značku fragmentu dovnitř tabulky, hned za `<table>`. Takový
    // výřez je bez obalu k ničemu — prohlížeč `<tr>` mimo tabulku zahodí a ze
    // schránky nezbude nic než text. V tom případě je celé tělo dokumentu
    // bližší tomu, co uživatel zkopíroval, než přesné dodržení značky.
    if (!/^\s*<(col|colgroup|tr|tbody|thead|tfoot|td|th|caption)\b/i.test(fragment)) {
      return fragment;
    }
    return body ? body[1]! : html;
  }

  return body ? body[1]! : html;
}

function dropNode(node: Node): void {
  node.parentNode?.removeChild(node);
}

function unwrapNode(el: Element): void {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

function cleanStyle(el: Element, keep: ReadonlySet<string>): void {
  const style = el.getAttribute('style');
  if (style === null) return;

  if (keep.size === 0) {
    el.removeAttribute('style');
    return;
  }

  const kept: string[] = [];
  for (const rule of style.split(';')) {
    const colon = rule.indexOf(':');
    if (colon < 0) continue;

    let name = rule.slice(0, colon).trim().toLowerCase();
    const value = rule.slice(colon + 1).trim();

    // Excel píše `background: #8FC356`, ne `background-color`. Je to zkratka
    // pro totéž, dokud je hodnota jen barva — s obrázkem na pozadí by se
    // vkládal odkaz do cizí aplikace, a to nechceme.
    if (name === 'background' && !/url\(|gradient/i.test(value)) name = 'background-color';

    if (!value || !keep.has(name)) continue;

    // Výchozí hodnoty zdrojového dokumentu nejsou záměr autora. Word posílá
    // "windowtext", Google Docs razítkuje color:#000000 úplně na všechno —
    // a natvrdo černý text pak rozbije každý tmavý motiv na cílové stránce.
    const normalized = value.toLowerCase().replace(/\s+/g, '');
    if (['windowtext', 'initial', 'inherit', 'unset'].includes(normalized)) continue;
    if (name === 'color' && ['#000', '#000000', 'rgb(0,0,0)', 'black'].includes(normalized)) continue;
    if (name === 'background-color'
        && ['transparent', 'rgba(0,0,0,0)', '#fff', '#ffffff', 'white'].includes(normalized)) continue;
    if (name === 'font-weight' && (normalized === 'normal' || normalized === '400')) continue;
    if (name === 'font-style' && normalized === 'normal') continue;
    // `text-align: general` je hodnota z Excelu, kterou CSS nezná.
    if (name === 'text-align' && ['general', 'auto'].includes(normalized)) continue;
    if (name.startsWith('text-decoration') && normalized === 'none') continue;
    // `border: none` je výchozí stav sešitu — Excel ho vypisuje ke každé buňce.
    if (name.startsWith('border') && ['none', '0', 'mediumnone', '0none'].includes(normalized)) continue;

    kept.push(name + ': ' + value);
  }

  if (kept.length === 0) el.removeAttribute('style');
  else el.setAttribute('style', kept.join('; ') + ';');
}

function isJunkAttr(name: string): boolean {
  const n = name.toLowerCase();
  if (JUNK_ATTRS.has(n)) return true;
  return JUNK_ATTR_PREFIXES.some((prefix) => n.startsWith(prefix));
}

/** Značka na začátku odstavce: „1.", „iv)", „a.", „·". */
const MARKER = /^\s*([·•●▪‣⁃o]|\d+|[ivxlcdm]+|[IVXLCDM]+|[a-zA-Z])([.)])?(?:\s|\u00a0)+/;

const BULLETS = /^[·•●▪‣⁃o]$/;
const ROMAN_VALUES: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };

/** Hodnota římské číslice, nebo 0, když to římská číslice není. */
function romanValue(text: string): number {
  const chars = text.toLowerCase().split('');
  if (chars.some((ch) => !(ch in ROMAN_VALUES))) return 0;

  let total = 0;
  for (let i = 0; i < chars.length; i += 1) {
    const value = ROMAN_VALUES[chars[i]!]!;
    const next = i + 1 < chars.length ? ROMAN_VALUES[chars[i + 1]!]! : 0;
    total += value < next ? -value : value;
  }
  return total;
}

/**
 * Druh číslování odvozený z celé řady značek.
 *
 * Z jedné značky se poznat nedá: „i." je římská jednička i písmeno „i".
 * Rozhodne až posloupnost — po „i." přijde u římských „ii.", u písmen „j.".
 */
function listKind(markers: readonly string[]): { tag: 'ul' | 'ol'; type: string } | null {
  if (markers.length === 0) return null;
  if (markers.every((m) => BULLETS.test(m))) return { tag: 'ul', type: '' };

  const follows = (values: readonly number[]): boolean =>
    values.every((v, i) => v > 0 && (i === 0 || v === values[i - 1]! + 1));

  if (markers.every((m) => /^\d+$/.test(m))) {
    return follows(markers.map(Number)) ? { tag: 'ol', type: '1' } : null;
  }

  // Římské číslice napřed: „i, ii, iii" je řada, „i, j, k" už ne.
  const roman = markers.map(romanValue);
  if (follows(roman)) {
    return { tag: 'ol', type: markers[0]! === markers[0]!.toLowerCase() ? 'i' : 'I' };
  }

  if (markers.every((m) => /^[a-zA-Z]$/.test(m))) {
    const letters = markers.map((m) => m.toLowerCase().charCodeAt(0) - 96);
    if (follows(letters)) {
      return { tag: 'ol', type: markers[0]! === markers[0]!.toLowerCase() ? 'a' : 'A' };
    }
  }

  return null;
}

/** Odstavce, které Word poslal jako jeden seznam, i se značkami z jejich textu. */
function wordListRuns(root: Element): Array<{ items: Element[]; markers: string[] }> {
  const runs: Array<{ items: Element[]; markers: string[] }> = [];
  let current: { items: Element[]; markers: string[] } | null = null;

  for (const p of Array.from(root.querySelectorAll('p'))) {
    const style = p.getAttribute('style') ?? '';
    const marked = /mso-list/i.test(style) || p.classList.contains('MsoListParagraph');
    const found = MARKER.exec(p.textContent ?? '');
    const marker = found?.[1] ?? '';

    // Odrážku a číslici pozná i neoznačený odstavec — Word je někdy pošle bez
    // `mso-list`. Písmeno a římská číslice se ale běžně vyskytují i ve větě
    // („I. světová válka"), takže u nich musí Word sám říct, že jde o seznam.
    const safe = BULLETS.test(marker) || /^\d+$/.test(marker);
    if (!found || (!marked && !safe)) { current = null; continue; }

    if (!current) { current = { items: [], markers: [] }; runs.push(current); }
    current.items.push(p);
    current.markers.push(marker);
  }

  return runs;
}

/**
 * Rozpozná seznam, který Word poslal jako odstavce se značkou v textu.
 *
 * Bez tohohle kroku zůstane v obsahu „·<span> </span>text" jako obyčejný
 * odstavec a uživatel s tím pak nic nezmůže.
 *
 * Druh číslování se odvozuje z celé řady značek, ne z jedné: „i." je římská
 * jednička i písmeno „i", a rozhodne až to, co přijde po ní. Zapíše se pak
 * `type` i `list-style-type` — stejně, jako když ho uživatel nastaví sám.
 */
function rebuildWordLists(root: Element, doc: Document): void {
  for (const run of wordListRuns(root)) {
    const kind = listKind(run.markers);
    if (!kind) continue;

    const list = doc.createElement(kind.tag);
    if (kind.type !== '' && kind.type !== '1') {
      list.setAttribute('type', kind.type);
      list.setAttribute('style', 'list-style-type: ' + LIST_STYLE_FOR[kind.type] + ';');
    }
    run.items[0]!.parentNode?.insertBefore(list, run.items[0]!);

    for (const p of run.items) {
      const li = doc.createElement('li');
      while (p.firstChild) li.appendChild(p.firstChild);

      stripMarker(li);
      list.appendChild(li);
      dropNode(p);
    }
  }
}

/** Atribut `type` na hodnotu `list-style-type`. */
const LIST_STYLE_FOR: Record<string, string> = {
  a: 'lower-alpha', A: 'upper-alpha', i: 'lower-roman', I: 'upper-roman',
};

/**
 * Sundá značku z textu položky.
 *
 * Ubírá se napříč textovými uzly, ne z toho prvního: Word značku roztrhá —
 * „i." dá do jednoho uzlu a mezery za ní do vnořeného `<span>`. Ořez podle
 * jednoho uzlu by tak nechal v textu půlku značky nebo nesundal nic.
 */
function stripMarker(li: Element): void {
  const found = MARKER.exec(li.textContent ?? '');
  if (!found) return;

  let left = found[0].length;
  for (const text of textNodesOf(li)) {
    if (left <= 0) break;
    const take = Math.min(left, text.data.length);
    text.deleteData(0, take);
    left -= take;
  }
}

function textNodesOf(node: Node): Text[] {
  if (node.nodeType === 3) return [node as Text];
  return Array.from(node.childNodes).flatMap(textNodesOf);
}

/** Zahodí obaly, ve kterých po vyčištění nic nezbylo. */
function collapseEmpty(root: Element): void {
  // Nosníky tabulky se nesmějí rozbalit ani prázdné. `<col>` nemá text nikdy
  // a nese šířku sloupce; prázdný `<tr>` je v sešitu běžný oddělovač a bez
  // něj by jeho buňky zůstaly viset přímo v `<tbody>`.
  const EMPTY_OK = new Set([
    'br', 'img', 'hr', 'td', 'th', 'input', 'iframe', 'video', 'source',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'colgroup', 'col', 'caption',
  ]);

  let changed = true;
  while (changed) {
    changed = false;
    for (const el of Array.from(root.querySelectorAll('*'))) {
      const tag = el.tagName.toLowerCase();
      if (EMPTY_OK.has(tag)) continue;
      if ((el.textContent ?? '').trim() !== '') continue;
      if (el.querySelector('img, br, hr, iframe, video')) continue;

      // Prázdný <span> nebo <a> jsou zbytek; prázdný <p> drží odsazení.
      if (tag === 'p' || tag === 'li') continue;
      unwrapNode(el);
      changed = true;
    }
  }
}

/**
 * Vyčistí vložený obsah. Mění `root` na místě.
 */
export function cleanPastedContent(
  root: Element,
  doc: Document,
  options: CleanOptions = {},
): { source: PasteSource; removed: string[] } {
  const html = root.innerHTML;
  const source = options.source ?? detectSource(html);
  const keep = new Set(options.keepStyles ?? KEEP_STYLES);
  // Prázdný seznam znamená „styly pryč" a platí i na tabulky.
  const tableKeep = keep.size === 0 ? keep : new Set([...keep, ...TABLE_KEEP_STYLES]);
  const listKeep = keep.size === 0 ? keep : new Set([...keep, ...LIST_KEEP_STYLES]);
  const removed: string[] = [];

  // Bezpečnost první — na cizí obsah se nesmí spoléhat vůbec.
  removed.push(...sanitize(root).removed);

  // Komentáře nesou značky fragmentů a podmíněné bloky Wordu.
  const walker = doc.createTreeWalker(root, 128 /* SHOW_COMMENT */);
  const comments: Node[] = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  for (const comment of comments) dropNode(comment);

  for (const el of Array.from(root.querySelectorAll('*'))) {
    if (!el.isConnected && el.parentNode === null) continue;
    const tag = el.tagName.toLowerCase();

    if (JUNK_TAGS.has(tag)) { removed.push('<' + tag + '>'); dropNode(el); continue; }
    if (tag.includes(':')) { removed.push('<' + tag + '>'); unwrapNode(el); continue; }
  }

  if (source === 'word') rebuildWordLists(root, doc);

  for (const el of Array.from(root.querySelectorAll('*'))) {
    const tag = el.tagName.toLowerCase();

    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();

      if (name === 'style') {
        let allowed = keep;
        if (TABLE_TAGS.has(tag)) allowed = tableKeep;
        else if (LIST_TAGS.has(tag)) allowed = listKeep;
        cleanStyle(el, allowed);
        continue;
      }

      // dir="ltr" je výchozí hodnota — Google Docs ji jen sype všude.
      // dir="rtl" naopak nese informaci a zůstává.
      if (name === 'dir' && attr.value.toLowerCase() === 'ltr') {
        el.removeAttribute(attr.name);
        continue;
      }

      if (name === 'id' && /^docs-internal-guid/i.test(attr.value)) {
        el.removeAttribute(attr.name);
        continue;
      }

      if (name === 'class') {
        const kept = attr.value.split(/\s+/).filter(
          (cls) => cls && !/^(ql-|Mso|docs-|ProseMirror)/i.test(cls),
        );
        if (kept.length) el.setAttribute('class', kept.join(' '));
        else el.removeAttribute('class');
        continue;
      }

      if (isJunkAttr(name)) { el.removeAttribute(attr.name); continue; }

      if (options.allowedAttrs && !options.allowedAttrs.has(name)
          && !name.startsWith('data-') && !name.startsWith('aria-')) {
        el.removeAttribute(attr.name);
      }
    }

    if (UNWRAP_TAGS.has(tag)) { unwrapNode(el); continue; }
    if (options.allowedTags && !options.allowedTags.has(tag)) {
      removed.push('<' + tag + '>');
      unwrapNode(el);
    }
  }

  tidyPastedTables(root, source);

  // <span> bez jediného atributu už nic nenese — jen zbytečně zanořuje.
  for (const span of Array.from(root.querySelectorAll('span'))) {
    if (span.attributes.length === 0) unwrapNode(span);
  }

  // Až po úklidu atributů: teprve teď je vidět, že obal nic nenese.
  unwrapInlineAroundBlocks(root);

  collapseEmpty(root);
  return { source, removed };
}
