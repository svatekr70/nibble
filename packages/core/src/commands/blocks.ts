import type { Editor } from '../Editor.js';
import {
  atBlockEnd, atBlockStart, blocksInRange, closestBlock, convertBlock,
  ensureBlock, fillIfEmpty, isEmptyBlock, mergeBlocks, normalizeContainer,
  splitBlock, TEXT_BLOCKS,
} from '../dom/blocks.js';
import { closestListItem } from '../dom/lists.js';
import { captureCaret, restoreCaret, withCaret } from '../selection/caret.js';
import { deleteBackwardInList, insertParagraphInList } from './lists.js';

const ALIGNMENTS = ['left', 'center', 'right', 'justify'] as const;
export type Alignment = (typeof ALIGNMENTS)[number];

const INLINE_FORMATS = 'strong,em,b,i,u,s,strike,font,span,sub,sup,mark,small,code';

function isTextBlock(tag: string): boolean {
  return (TEXT_BLOCKS as readonly string[]).includes(tag);
}

/** Nejbližší citace nad uzlem, v mezích kořene. */
export function closestQuote(node: Node | null, root: Element): Element | null {
  let cur: Node | null = node;
  while (cur && cur !== root) {
    if (cur.nodeType === 1 && (cur as Element).tagName.toLowerCase() === 'blockquote') {
      return cur as Element;
    }
    cur = cur.parentNode;
  }
  return null;
}

/**
 * Zapne nebo zruší citaci.
 *
 * Citace je obal, ne druh bloku. Ve všech čtrnácti citacích z produkce je to
 * `<blockquote><p>…</p></blockquote>` — a je to i sémanticky správně: uvnitř
 * citace pořád jsou odstavce, jen jsou citované. Záměna značky, jak to dělal
 * dřív `formatBlock`, by z odstavce udělala citaci a text by přišel o blok,
 * do kterého patří.
 */
function toggleBlockquote(editor: Editor): boolean {
  const range = editor.selection.getRange();
  if (!range) return false;

  const doc = editor.document;

  // Citaci s holým textem srovnat dřív, než se s ní začne pracovat: jinak by
  // `blocksInRange` vrátil samotnou citaci a nebylo by co vyndat. Přesun uzlů
  // ale zneplatní živý rozsah, takže se kurzor musí zachytit a obnovit.
  const quote = closestQuote(range.startContainer, editor.root);
  const live = quote
    ? withCaret(editor, () => normalizeContainer(quote, doc))
    : range;
  if (!live) return false;

  const blocks = blocksInRange(live, editor.root)
    .filter((block) => block.tagName.toLowerCase() !== 'blockquote');

  if (blocks.length === 0) {
    const created = ensureBlock(live.startContainer, editor.root, doc);
    if (!created) return false;
    blocks.push(created);
  }

  const quoted = blocks.every((block) => closestQuote(block, editor.root) !== null);

  withCaret(editor, () => {
    if (quoted) {
      unwrapFromQuote(blocks, editor.root, doc);
      return;
    }
    const first = blocks[0]!;
    const wrapper = doc.createElement('blockquote');
    first.parentNode?.insertBefore(wrapper, first);
    for (const block of blocks) wrapper.appendChild(block);
  });

  editor.commit('blockquote');
  return true;
}

/**
 * Vyndá bloky z citace ven.
 *
 * Když je vybraný jen prostředek delší citace, citace se rozdělí — zbytek nad
 * i pod zůstane citovaný. Vyndat rovnou celou citaci by uživateli zrušilo
 * i to, čeho se nedotkl.
 */
function unwrapFromQuote(blocks: readonly Element[], root: Element, doc: Document): void {
  const byQuote = new Map<Element, Element[]>();

  for (const block of blocks) {
    const quote = closestQuote(block, root);
    if (!quote) continue;
    const list = byQuote.get(quote) ?? [];
    list.push(block);
    byQuote.set(quote, list);
  }

  for (const [quote, members] of byQuote) {
    const children = Array.from(quote.children);
    const firstIndex = children.indexOf(members[0]!);
    const lastIndex = children.indexOf(members[members.length - 1]!);

    const after = children.slice(lastIndex + 1);
    if (after.length > 0) {
      const tail = doc.createElement('blockquote');
      for (const attr of Array.from(quote.attributes)) tail.setAttribute(attr.name, attr.value);
      for (const node of after) tail.appendChild(node);
      quote.parentNode?.insertBefore(tail, quote.nextSibling);
    }

    // Vybrané bloky jdou za citaci; co bylo nad nimi, v ní zůstane.
    let anchor: Node | null = quote.nextSibling;
    for (const block of members) quote.parentNode?.insertBefore(block, anchor);

    if (firstIndex === 0) quote.remove();
  }
}

/** Výška řádku bloku pod kurzorem, nebo null. */
export function currentLineHeight(editor: Editor): string | null {
  const range = editor.selection.getRange();
  if (!range) return null;

  const block = closestBlock(range.startContainer, editor.root);
  return (block as HTMLElement | null)?.style?.lineHeight || null;
}

export function registerBlockCommands(editor: Editor): void {
  const { commands } = editor;

  /**
   * Přepne značku bloku. V `<pre>` se pak Enter chová jinak — viz insertParagraph.
   */
  commands.add('blockquote', (ed) => toggleBlockquote(ed));

  commands.add('formatBlock', (ed, args) => {
    const tag = typeof args === 'string' ? args.toLowerCase() : '';
    if (!isTextBlock(tag)) return false;

    // Citace je obal, ne druh bloku — ať se přes výběr v liště dostane
    // ke stejnému výsledku jako přes tlačítko.
    if (tag === 'blockquote') return toggleBlockquote(ed);

    const range = ed.selection.getRange();
    if (!range) return false;

    const mark = ed.selection.save();
    const blocks = blocksInRange(range, ed.root);
    if (blocks.length === 0) {
      const created = ensureBlock(range.startContainer, ed.root, ed.document);
      if (!created) return false;
      blocks.push(created);
    }

    for (const block of blocks) convertBlock(block, tag, ed.document);

    ed.selection.restore(mark);
    ed.commit('block');
    return true;
  });

  commands.add('align', (ed, args) => {
    const value = String(args) as Alignment;
    if (!ALIGNMENTS.includes(value)) return false;

    const range = ed.selection.getRange();
    if (!range) return false;

    const mark = ed.selection.save();
    for (const block of blocksInRange(range, ed.root)) {
      const el = block as HTMLElement;
      // Zarovnání vlevo je výchozí — nemá smysl ho zapisovat.
      if (value === 'left') el.style.removeProperty('text-align');
      else el.style.textAlign = value;
      if (el.getAttribute('style') === '') el.removeAttribute('style');
    }

    ed.selection.restore(mark);
    ed.commit('align');
    return true;
  });

  /**
   * Výška řádku.
   *
   * Patří bloku, ne inline obalu: `line-height` na `<span>` uvnitř odstavce
   * mění výšku jen těch řádků, na kterých span leží, což vypadá jako chyba
   * sazby. Zapisuje se proto na stejné místo jako zarovnání.
   */
  commands.add('lineheight', (ed, args) => {
    const value = typeof args === 'string' ? args.trim() : '';

    const range = ed.selection.getRange();
    if (!range) return false;

    const mark = ed.selection.save();
    const blocks = blocksInRange(range, ed.root);
    if (blocks.length === 0) {
      const created = ensureBlock(range.startContainer, ed.root, ed.document);
      if (!created) return false;
      blocks.push(created);
    }

    for (const block of blocks) {
      const el = block as HTMLElement;
      if (value === '') el.style.removeProperty('line-height');
      else el.style.lineHeight = value;
      if (el.getAttribute('style') === '') el.removeAttribute('style');
    }

    ed.selection.restore(mark);
    ed.commit('lineheight');
    return true;
  });

  commands.add('hr', (ed) => {
    const range = ed.selection.getRange();
    if (!range) return false;

    range.deleteContents();
    const block = ensureBlock(range.startContainer, ed.root, ed.document);
    if (!block) return false;

    const rule = ed.document.createElement('hr');
    const after = atBlockEnd(range, block) || isEmptyBlock(block)
      ? block
      : splitBlock(block, range, ed.document).previousElementSibling ?? block;

    after.parentNode?.insertBefore(rule, after.nextSibling);

    // Za oddělovačem musí být kam psát.
    let next = rule.nextElementSibling;
    if (!next) {
      next = ed.document.createElement('p');
      fillIfEmpty(next, ed.document);
      rule.parentNode?.insertBefore(next, rule.nextSibling);
    }

    ed.selection.collapseTo(next, 0);
    ed.commit('hr');
    return true;
  });

  /** Sundá inline formátování z výběru. Bloky nechává být. */
  commands.add('removeFormat', (ed) => {
    const range = ed.selection.getRange();
    if (!range || range.collapsed) return false;

    const frag = range.extractContents();
    for (const el of Array.from(frag.querySelectorAll(INLINE_FORMATS))) {
      const parent = el.parentNode;
      if (!parent) continue;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    }

    const first = frag.firstChild;
    const last = frag.lastChild;
    range.insertNode(frag);

    if (first && last) {
      const out = ed.document.createRange();
      out.setStartBefore(first);
      out.setEndAfter(last);
      ed.selection.setRange(out);
    }

    ed.commit('removeformat');
    return true;
  });
}

/**
 * Enter.
 *
 * Tři případy, které se liší: v `<pre>` se dělá nový řádek místo nového bloku,
 * na začátku bloku vzniká prázdný blok před ním (kurzor zůstane u textu) a
 * v prázdném bloku uvnitř citace se z citace vystoupí.
 */
export function insertParagraph(ed: Editor): boolean {
  let range = ed.selection.getRange();
  if (!range) return false;

  // Uvnitř seznamu platí jiná pravidla — dělí se položka, ne blok v ní.
  const item = closestListItem(range.startContainer, ed.root);
  if (item) return insertParagraphInList(ed, item);

  range.deleteContents();

  // `ensureBlock` může srovnat citaci s holým textem, a tím přeskládat uzly —
  // kurzor i rozsah se proto po zásahu přebírají znovu.
  const caret = captureCaret(ed);
  const block = ensureBlock(range.startContainer, ed.root, ed.document);
  if (!block) return false;

  restoreCaret(ed, caret);
  const live = ed.selection.getRange();
  if (!live) return false;
  range = live;

  if (block.tagName.toLowerCase() === 'pre') {
    const nl = ed.document.createTextNode('\n');
    range.insertNode(nl);
    ed.selection.collapseTo(nl, 1);
    ed.commit('split');
    return true;
  }

  // Prázdný odstavec v citaci → vystoupit z ní ven.
  const quote = block.parentElement;
  if (quote && quote !== ed.root && quote.tagName.toLowerCase() === 'blockquote'
      && isEmptyBlock(block) && !block.nextElementSibling) {
    quote.removeChild(block);
    quote.parentNode?.insertBefore(block, quote.nextSibling);
    if (!quote.firstChild) quote.parentNode?.removeChild(quote);
    ed.selection.collapseTo(block, 0);
    ed.commit('split');
    return true;
  }

  if (atBlockStart(range, block) && !isEmptyBlock(block)) {
    const before = ed.document.createElement('p');
    fillIfEmpty(before, ed.document);
    block.parentNode?.insertBefore(before, block);
    ed.selection.collapseTo(range.startContainer, range.startOffset);
    ed.commit('split');
    return true;
  }

  const next = splitBlock(block, range, ed.document);
  ed.selection.collapseTo(next, 0);
  ed.commit('split');
  return true;
}

/**
 * Backspace a Delete.
 *
 * Na hranici bloku se bloky slučují. Výjimka je začátek dokumentu: tam není
 * s čím sloučit, tak se aspoň zruší formát bloku — jinak by klávesa nedělala nic
 * a uživatel by nevěděl proč.
 */
export function deleteInDirection(ed: Editor, direction: -1 | 1): boolean {
  const range = ed.selection.getRange();
  if (!range) return false;

  if (!range.collapsed) {
    range.deleteContents();
    const block = closestBlock(range.startContainer, ed.root);
    if (block && !block.firstChild) fillIfEmpty(block, ed.document);
    ed.commit('delete');
    return true;
  }

  const node = range.startContainer;
  const offset = range.startOffset;

  if (node.nodeType === 3) {
    const text = node as Text;
    if (direction === -1 && offset > 0) {
      text.deleteData(offset - 1, 1);
      ed.selection.collapseTo(text, offset - 1);
      ed.commit('delete');
      return true;
    }
    if (direction === 1 && offset < text.data.length) {
      text.deleteData(offset, 1);
      ed.selection.collapseTo(text, offset);
      ed.commit('delete');
      return true;
    }
  }

  const block = closestBlock(node, ed.root);
  if (!block) return false;

  const onEdge = direction === -1 ? atBlockStart(range, block) : atBlockEnd(range, block);
  if (!onEdge) return false;

  const item = closestListItem(node, ed.root);
  if (item && direction === -1 && atBlockStart(range, item)) {
    return deleteBackwardInList(ed, item);
  }

  const other = direction === -1 ? block.previousElementSibling : block.nextElementSibling;

  if (!other) {
    if (direction === -1 && block.tagName.toLowerCase() !== 'p') {
      const mark = ed.selection.save();
      convertBlock(block, 'p', ed.document);
      ed.selection.restore(mark);
      ed.commit('block');
      return true;
    }
    return false;
  }

  // Oddělovač a podobné bloky bez obsahu se mažou celé.
  if (other.tagName.toLowerCase() === 'hr') {
    other.parentNode?.removeChild(other);
    ed.commit('delete');
    return true;
  }

  const target = direction === -1 ? other : block;
  const source = direction === -1 ? block : other;
  const boundary = mergeBlocks(target, source, ed.document);

  if (boundary) ed.selection.collapseTo(boundary, (boundary.nodeValue ?? '').length);
  else ed.selection.collapseTo(target, 0);

  ed.commit('delete');
  return true;
}
