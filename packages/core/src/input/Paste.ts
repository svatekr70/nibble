import type { Editor } from '../Editor.js';
import {
  cleanPastedContent, detectSource, extractFragment, type PasteSource,
} from '../model/clean.js';
import { closestBlock, fillIfEmpty, pruneEmptyInline } from '../dom/blocks.js';
import { collectStyleRules, inlineStyleRules } from '../model/pasteCss.js';
import { looksLikeMarkdown, markdownToHtml, plainTextToHtml } from '../model/markdown.js';

/**
 * Vkládání ze schránky.
 *
 * Vložený obsah je jediné místo, kde Nibble sahá na cizí HTML naplno. Načtený
 * dokument se nechává být, protože ho někdo napsal a o změnu nežádal — ale to,
 * co právě teď přišlo ze schránky, vzniká v tuhle chvíli a nese s sebou
 * nepořádek zdrojové aplikace. Kdyby prošlo, usadí se v databázi natrvalo.
 */

export interface PasteOptions {
  /** Které vlastnosti stylu si z vloženého obsahu nechat. */
  keepStyles?: readonly string[];
  /** Povolené značky. Co v seznamu není, se rozbalí a text zůstane. */
  allowedTags?: ReadonlySet<string>;
  /** Převádět Markdown, když přijde čistý text? Výchozí: ano. */
  markdown?: boolean;
}

/** Značky, které se z vloženého obsahu pouštějí dál. */
export const PASTE_ALLOWED_TAGS: ReadonlySet<string> = new Set([
  'p', 'br', 'strong', 'em', 'b', 'i', 'u', 's', 'sub', 'sup', 'code', 'pre',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'hr', 'a', 'img',
  'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'colgroup', 'col', 'span', 'div', 'figure', 'figcaption',
]);

export interface PasteResult {
  source: PasteSource;
  removed: string[];
  html: string;
}

/** Vyčistí HTML ze schránky. Vrací i to, co se zahodilo — kvůli ladění. */
export function cleanPastedHtml(
  html: string,
  doc: Document,
  options: PasteOptions = {},
): PasteResult {
  // Obojí se čte z celého HTML, ne z výřezu: `<style>` blok i hlavička, podle
  // které se pozná zdroj, jsou nad značkou fragmentu.
  const source = detectSource(html);

  // Google Sheets posílá formátování ke každé buňce a `<style>` blok má jen
  // jako náhradu pro aplikace, které inline styly neumějí — je v něm světle
  // šedý rámeček na všechno. Kdyby se vlil dovnitř, dostal by mřížku i sešit,
  // který žádnou nemá. U Sheets se proto blok přeskakuje celý.
  const rules = source === 'google-sheets' ? [] : collectStyleRules(html);

  const box = doc.createElement('div');
  box.innerHTML = extractFragment(html);
  inlineStyleRules(box, rules);

  const { removed } = cleanPastedContent(box, doc, {
    ...(options.keepStyles ? { keepStyles: options.keepStyles } : {}),
    allowedTags: options.allowedTags ?? PASTE_ALLOWED_TAGS,
    source,
  });

  return { source, removed, html: box.innerHTML };
}

/** Převede čistý text na HTML — případně přes Markdown. */
export function textToHtml(text: string, options: PasteOptions = {}): string {
  const useMarkdown = options.markdown ?? true;
  return useMarkdown && looksLikeMarkdown(text)
    ? markdownToHtml(text)
    : plainTextToHtml(text);
}

/** Nese HTML ze schránky tabulku? Rozhoduje o přednosti před obrázkem. */
function hasTable(html: string): boolean {
  return /<table[\s>]/i.test(html);
}

export function bindPaste(editor: Editor, options: PasteOptions = {}): () => void {
  const onPaste = (event: Event): void => {
    const e = event as ClipboardEvent;
    if (editor.mode !== 'design') return;

    const data = e.clipboardData;
    if (!data) return;

    const html = data.getData('text/html');
    const text = data.getData('text/plain');
    if (!html && !text) return;

    // Obrázek ve schránce si jinak bere plugin obrázků; ten si událost zruší
    // sám. Kontroluje se typ, ne jen počet souborů: Word posílá zároveň
    // obrázek i HTML a bez toho by se vložilo obojí.
    //
    // Excel a Sheets ale posílají obrázek vždycky — je to náhled zkopírované
    // oblasti. Kdyby platila jen ta první úvaha, skončila by každá tabulka
    // z Excelu v obsahu jako obrázek, se kterým už nikdo nic neudělá. Když
    // v HTML tabulka je, má přednost ona a plugin obrázků se ke slovu nedostane.
    if (Array.from(data.files).some((f) => f.type.startsWith('image/'))) {
      if (!hasTable(html)) return;
      e.stopImmediatePropagation();
    }

    e.preventDefault();

    const plainOnly = editor.pastePlainNext;
    editor.pastePlainNext = false;

    if (plainOnly || !html) {
      editor.insertHTML(textToHtml(text, options));
      return;
    }

    const result = cleanPastedHtml(html, editor.document, options);
    if (result.removed.length > 0) {
      editor.dispatch('pasteclean', { source: result.source, removed: result.removed });
    }
    editor.insertHTML(result.html);
  };

  const onKeyDown = (event: Event): void => {
    const e = event as KeyboardEvent;
    // Ctrl+Shift+V vloží jako čistý text. Vlajka se přečte v obsluze vkládání,
    // protože samotné stisknutí zkratky ještě žádná data ze schránky nedá.
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'v') {
      editor.pastePlainNext = true;
    }
  };

  /** Úsek, který uživatel právě táhne. Null, když tažení začalo jinde. */
  let dragged: Range | null = null;

  const onDragStart = (event: Event): void => {
    const e = event as DragEvent;
    const range = editor.selection.getRange();
    dragged = range && !range.collapsed ? range.cloneRange() : null;

    // Vlastní serializace ze stejného důvodu jako u kopírování: prohlížeč by
    // do `text/html` přibalil spočítané styly a přetažení odstavce o kus níž
    // by ho obarvilo.
    if (dragged && e.dataTransfer) {
      e.dataTransfer.setData('text/html', selectionHtml(editor, dragged));
      e.dataTransfer.setData('text/plain', dragged.toString());
    }
  };

  const onDragEnd = (): void => { dragged = null; };

  /**
   * Kurzor jde za myší.
   *
   * Bez `preventDefault` prohlížeč drop vůbec nepovolí. A kurzor se posouvá
   * průběžně, ne až při puštění: uživatel tak vidí, kam obsah přistane —
   * a hlavně to platí i pro obrázky, které si vkládá plugin sám.
   */
  const onDragOver = (event: Event): void => {
    const e = event as DragEvent;
    if (editor.mode !== 'design') return;
    e.preventDefault();

    const caret = caretAtPoint(editor.document, e.clientX, e.clientY);
    if (caret && editor.root.contains(caret.startContainer)) editor.selection.setRange(caret);
  };

  const onDrop = (event: Event): void => {
    const e = event as DragEvent;
    const source = dragged;
    dragged = null;

    if (editor.mode !== 'design') return;

    const data = e.dataTransfer;
    if (!data) return;

    // Puštění doprostřed vlastního výběru je „nikam" — obsah by se posunul
    // sám do sebe.
    const target = editor.selection.getRange();
    if (source && target && withinRange(source, target)) {
      e.preventDefault();
      return;
    }

    const html = data.getData('text/html');
    const text = data.getData('text/plain');
    if (!html && !text) return;

    if (Array.from(data.files).some((f) => f.type.startsWith('image/'))) {
      if (!hasTable(html)) return;
      e.stopImmediatePropagation();
    }

    e.preventDefault();

    // Tažení uvnitř editoru je přesun, ne kopie: originál musí zmizet. Živé
    // rozsahy se mazáním samy posunou, takže cíl zůstane, kde byl.
    if (source && !copyRequested(e)) {
      const home = closestBlock(source.startContainer, editor.root);
      source.deleteContents();

      // Po vyjmutí zbývá slupka obalu a případně blok bez obsahu, do kterého
      // by nešlo kliknout.
      if (home && editor.root.contains(home)) {
        pruneEmptyInline(home);
        fillIfEmpty(home, editor.document);
      }
    }

    const result = html
      ? cleanPastedHtml(html, editor.document, options).html
      : textToHtml(text, options);
    editor.insertHTML(result);
  };

  const onCopy = (event: Event): void => {
    const e = event as ClipboardEvent;
    const range = editor.selection.getRange();
    if (!range || range.collapsed || !e.clipboardData) return;

    e.clipboardData.setData('text/html', selectionHtml(editor, range));
    e.clipboardData.setData('text/plain', range.toString());
    e.preventDefault();
  };

  const onCut = (event: Event): void => {
    onCopy(event);
    // `preventDefault` v `onCopy` zrušil i vyjmutí, takže se maže vlastní
    // cestou. Je to tak i lepší: prohlížeč po sobě nechával `&nbsp;` tam,
    // kde byla obyčejná mezera.
    if (event.defaultPrevented) editor.exec('deleteBackward');
  };

  editor.root.addEventListener('paste', onPaste);
  editor.root.addEventListener('keydown', onKeyDown);
  editor.root.addEventListener('drop', onDrop);
  editor.root.addEventListener('copy', onCopy);
  editor.root.addEventListener('cut', onCut);
  editor.root.addEventListener('dragstart', onDragStart);
  editor.root.addEventListener('dragend', onDragEnd);
  editor.root.addEventListener('dragover', onDragOver);

  return () => {
    editor.root.removeEventListener('paste', onPaste);
    editor.root.removeEventListener('keydown', onKeyDown);
    editor.root.removeEventListener('drop', onDrop);
    editor.root.removeEventListener('copy', onCopy);
    editor.root.removeEventListener('cut', onCut);
    editor.root.removeEventListener('dragstart', onDragStart);
    editor.root.removeEventListener('dragend', onDragEnd);
    editor.root.removeEventListener('dragover', onDragOver);
  };
}

/**
 * Zahodí prázdné bloky na krajích klonu.
 *
 * Výběr tažený myší běžně začíná na konci předchozího bloku a končí na začátku
 * následujícího, takže `cloneContents` vrátí prázdné slupky navíc. Vložením by
 * z nich vznikly prázdné odstavce, které nikdo nekopíroval.
 */
function trimEmptyEdges(holder: Element): void {
  const blank = (el: Element | null): boolean => !!el
    && (el.textContent ?? '') === ''
    && el.querySelector('br,img,hr,table,iframe,video,audio') === null;

  while (blank(holder.firstElementChild)) holder.removeChild(holder.firstElementChild!);
  while (blank(holder.lastElementChild)) holder.removeChild(holder.lastElementChild!);
}

/**
 * Kurzor v místě, kam ukazuje myš.
 *
 * Dvě cesty: `caretRangeFromPoint` má Chrome a Safari, `caretPositionFromPoint`
 * je ve standardu a má ho Firefox. Bez jedné z nich by obsah přistál tam, kde
 * kurzor náhodou stál — ne tam, kam ho uživatel pustil.
 */
function caretAtPoint(doc: Document, x: number, y: number): Range | null {
  const view = doc as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number)
      => { offsetNode: Node; offset: number } | null;
  };

  if (typeof view.caretRangeFromPoint === 'function') return view.caretRangeFromPoint(x, y);

  const pos = view.caretPositionFromPoint?.(x, y);
  if (!pos) return null;

  const range = doc.createRange();
  range.setStart(pos.offsetNode, pos.offset);
  range.collapse(true);
  return range;
}

/** Leží bod uvnitř úseku, který se táhne? */
function withinRange(source: Range, point: Range): boolean {
  try {
    return source.comparePoint(point.startContainer, point.startOffset) === 0;
  } catch {
    return false;   // jiný strom — s taženým úsekem nesouvisí
  }
}

/**
 * Chce uživatel kopii místo přesunu?
 *
 * Na Macu se drží Alt, jinde Ctrl — tak to má systém i ostatní editory.
 */
function copyRequested(event: DragEvent): boolean {
  return event.altKey || event.ctrlKey;
}

/** Inline obaly, které se při kopírování musí přenést i zvenčí výběru. */
const COPY_WRAPPERS: ReadonlySet<string> = new Set([
  'strong', 'em', 'b', 'i', 'u', 's', 'strike', 'a', 'span',
  'code', 'sub', 'sup', 'mark', 'small', 'font',
]);

/**
 * Co dát do schránky při kopírování.
 *
 * Vlastní serializace, ne ta prohlížečova. Chrome do `text/html` přibalí
 * spočítané styly — `color`, `background-color`, `text-align: start` — a při
 * vložení zpátky do editoru je obsah dostane, přestože je nikdo nenastavil.
 * Zkopírovat slovo a vložit ho o kus dál tak pokaždé přidalo kus balastu.
 */
function selectionHtml(editor: Editor, range: Range): string {
  const holder = editor.document.createElement('div');
  holder.appendChild(range.cloneContents());
  trimEmptyEdges(holder);

  // `cloneContents` nezahrne obaly nad výběrem. Bez nich by se z vybraného
  // kusu tučného textu stal při vložení text obyčejný.
  let cur: Node | null = range.commonAncestorContainer;
  if (cur.nodeType === 3) cur = cur.parentNode;

  while (cur && cur !== editor.root) {
    const el = cur as Element;
    if (cur.nodeType === 1 && COPY_WRAPPERS.has(el.tagName.toLowerCase())) {
      const wrap = el.cloneNode(false) as Element;
      while (holder.firstChild) wrap.appendChild(holder.firstChild);
      holder.appendChild(wrap);
    }
    cur = cur.parentNode;
  }

  return holder.innerHTML;
}
