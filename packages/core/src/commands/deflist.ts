import type { Editor } from '../Editor.js';
import { blocksInRange, convertBlock, ensureBlock, isEmptyBlock } from '../dom/blocks.js';
import {
  closestDefItem, defListOf, isDefList, isEmptyDefItem, liftDefItem,
  normalizeDefList, otherKind, splitDefItem,
} from '../dom/deflist.js';
import { captureCaret, restoreCaret, type CaretRef } from '../selection/caret.js';

/**
 * Seznam definic.
 *
 * Zapíná se z odstavců a střídá je: první termín, druhý vysvětlení, třetí zase
 * termín. Vypadá to jako svévole, ale je to ten jediný převod, po kterém
 * uživatel nemusí nic překlikávat — kdo píše seznam definic jako odstavce,
 * píše je právě takhle střídavě.
 */

/** Seznam definic nad uzlem — kvůli srovnání struktury před úpravou. */
function outermostDefList(node: Node | null, root: Element): Element | null {
  let found: Element | null = null;
  let cur: Node | null = node;
  while (cur && cur !== root) {
    if (isDefList(cur)) found = cur as Element;
    cur = cur.parentNode;
  }
  return found;
}

/** Srovná ten seznam, se kterým se právě pracuje. Ne dřív — viz `dom/deflist.ts`. */
function prepare(editor: Editor, node: Node | null): void {
  const list = outermostDefList(node, editor.root);
  if (list) normalizeDefList(list, editor.document);
}

/**
 * Z bloku prvek seznamu definic.
 *
 * Obyčejný odstavec se rozbalí, aby nevznikalo `<dt><p>…</p></dt>`. Kurzor,
 * který mířil na ten odstavec, se přesměruje na nový prvek — jinak by po
 * zrušení odstavce zůstal v kořeni mezi bloky. Stejná past jako u `<li>`.
 */
function makeDefItem(
  block: Element, tag: 'dt' | 'dd', doc: Document, caret: CaretRef | null,
): Element {
  if (block.tagName.toLowerCase() === 'p' && !block.attributes.length) {
    const item = doc.createElement(tag);
    while (block.firstChild) item.appendChild(block.firstChild);
    block.parentNode?.removeChild(block);
    if (caret && caret.node === block) caret.node = item;
    return item;
  }

  const item = doc.createElement(tag);
  item.appendChild(block);
  return item;
}

/** Sousední seznam definic se s novým slije — dva `<dl>` za sebou nikdo nechce. */
function mergeAdjacent(list: Element): Element {
  let current = list;

  const prev = current.previousElementSibling;
  if (isDefList(prev)) {
    while (current.firstChild) prev.appendChild(current.firstChild);
    current.parentNode?.removeChild(current);
    current = prev as Element;
  }

  let next = current.nextElementSibling;
  while (isDefList(next)) {
    const after = next.nextElementSibling;
    while (next.firstChild) current.appendChild(next.firstChild);
    next.parentNode?.removeChild(next);
    next = after;
  }

  return current;
}

/** Rozpustí seznam definic zpátky na odstavce. */
function dissolve(list: Element, doc: Document, caret: CaretRef | null): void {
  const target = list.parentNode;
  if (!target) return;

  for (const item of Array.from(list.children)) {
    const p = convertBlock(item, 'p', doc);
    if (caret && caret.node === item) caret.node = p;
    target.insertBefore(p, list);
  }

  target.removeChild(list);
}

function toggleDefList(editor: Editor): boolean {
  const range = editor.selection.getRange();
  if (!range) return false;

  const doc = editor.document;
  const caret = captureCaret(editor);

  const item = closestDefItem(range.startContainer, editor.root);
  if (item) {
    prepare(editor, range.commonAncestorContainer);
    const list = defListOf(item);
    if (!list) return false;

    dissolve(list, doc, caret);
    restoreCaret(editor, caret);
    editor.commit('deflist');
    return true;
  }

  const blocks = blocksInRange(range, editor.root);
  if (blocks.length === 0) {
    const created = ensureBlock(range.startContainer, editor.root, doc);
    if (!created) return false;
    blocks.push(created);
  }

  const list = doc.createElement('dl');
  blocks[0]!.parentNode?.insertBefore(list, blocks[0]!);
  for (const [i, block] of blocks.entries()) {
    list.appendChild(makeDefItem(block, i % 2 === 0 ? 'dt' : 'dd', doc, caret));
  }

  mergeAdjacent(list);
  restoreCaret(editor, caret);
  editor.commit('deflist');
  return true;
}

export function registerDefListCommands(editor: Editor): void {
  editor.commands.add('deflist', (ed) => toggleDefList(ed));
}

/**
 * Enter v seznamu definic.
 *
 * V prázdném prvku se ze seznamu vystoupí — jinak by se v něm nedalo skončit
 * jinak než myší. Jinde se prvek rozdělí a druhá půlka přejde na ten druhý
 * druh: po termínu vysvětlení, po vysvětlení další termín. Kdo chce mít
 * v jednom vysvětlení dva odstavce, má na to Shift+Enter.
 */
export function insertParagraphInDefList(editor: Editor, item: Element): boolean {
  const range = editor.selection.getRange();
  if (!range) return false;

  if (isEmptyDefItem(item)) {
    const landing = liftDefItem(item, editor.document);
    if (!landing) return false;
    editor.selection.collapseTo(landing, 0);
    editor.commit('deflist');
    return true;
  }

  range.deleteContents();
  const next = splitDefItem(item, range, editor.document);
  editor.selection.collapseTo(next, 0);
  editor.commit('split');
  return true;
}

/**
 * Backspace na začátku prvku seznamu definic.
 *
 * První prvek ze seznamu vystoupí, ostatní se spojí s předchozím. Spojený
 * prvek si nechá druh toho předchozího — text se stěhuje do něj, ne naopak.
 */
export function deleteBackwardInDefList(editor: Editor, item: Element): boolean {
  const doc = editor.document;
  const list = defListOf(item);
  if (!list) return false;

  const prev = item.previousElementSibling;

  if (!prev) {
    const landing = liftDefItem(item, doc);
    if (!landing) return false;
    editor.selection.collapseTo(landing, 0);
    editor.commit('deflist');
    return true;
  }

  const target = prev;
  if (isEmptyBlock(target)) {
    while (target.firstChild) target.removeChild(target.firstChild);
  }
  const boundary = target.lastChild;

  while (item.firstChild) target.appendChild(item.firstChild);
  list.removeChild(item);

  if (boundary) editor.selection.collapseTo(boundary, (boundary.nodeValue ?? '').length);
  else editor.selection.collapseTo(target, 0);

  editor.commit('delete');
  return true;
}

export { closestDefItem, otherKind };
