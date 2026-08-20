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

/**
 * Rozpozná seznam, který Word poslal jako odstavce s odrážkou v textu.
 *
 * Bez tohohle kroku zůstane v obsahu „·<span> </span>text" jako obyčejný
 * odstavec a uživatel s tím pak nic nezmůže.
 */
function rebuildWordLists(root: Element, doc: Document): void {
  const paragraphs = Array.from(root.querySelectorAll('p'));
  let current: Element | null = null;

  for (const p of paragraphs) {
    const style = p.getAttribute('style') ?? '';
    const text = p.textContent ?? '';
    const bullet = /^\s*[·•●▪‣⁃o]\s+/.test(text);
    const numbered = /^\s*\d+[.)]\s+/.test(text);
    const marked = /mso-list/i.test(style) || p.classList.contains('MsoListParagraph');

    if (!bullet && !numbered && !marked) { current = null; continue; }

    const tag = numbered && !bullet ? 'ol' : 'ul';
    if (!current || current.tagName.toLowerCase() !== tag) {
      current = doc.createElement(tag);
      p.parentNode?.insertBefore(current, p);
    }

    const li = doc.createElement('li');
    while (p.firstChild) li.appendChild(p.firstChild);

    // Odrážka je znak v textu, ne struktura — musí pryč.
    const first = li.firstChild;
    if (first && first.nodeType === 3) {
      first.nodeValue = (first.nodeValue ?? '').replace(/^\s*([·•●▪‣⁃o]|\d+[.)])\s+/, '');
    }

    current.appendChild(li);
    dropNode(p);
  }
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

      if (name === 'style') { cleanStyle(el, TABLE_TAGS.has(tag) ? tableKeep : keep); continue; }

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

  collapseEmpty(root);
  return { source, removed };
}
