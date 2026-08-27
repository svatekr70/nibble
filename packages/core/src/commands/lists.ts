import type { Editor } from '../Editor.js';
import {
  blocksInRange, closestBlock, ensureBlock, fillIfEmpty, isEmptyBlock, pruneEmptyInline,
} from '../dom/blocks.js';
import {
  closestListItem, fillDeep, indentItem, isEmptyItem, isList, itemContent,
  listOf, mergeAdjacentLists, normalizeList, outdentItem, splitListItem, syncAriaLevel,
} from '../dom/lists.js';
import { applyListProps, listChain, type ListProps } from '../dom/listProps.js';
import { captureCaret, restoreCaret, type CaretRef } from '../selection/caret.js';

type ListTag = 'ul' | 'ol';

/** Seznam nejvyšší úrovně, do kterého uzel patří — kvůli srovnání struktury. */
function outermostList(node: Node | null, root: Element): Element | null {
  let found: Element | null = null;
  let cur: Node | null = node;
  while (cur && cur !== root) {
    if (isList(cur)) found = cur;
    cur = cur.parentNode;
  }
  return found;
}

/**
 * Srovná seznam, se kterým se právě pracuje.
 *
 * Volá se až tady, ne při načtení: struktura z Google Docs je sice neplatná,
 * ale dokud se jí nikdo nedotkne, nemá Nibble důvod ji přepisovat.
 */
function prepare(editor: Editor, node: Node | null): Element | null {
  const list = outermostList(node, editor.root);
  if (list) normalizeList(list, editor.document);
  return list;
}


function makeItem(block: Element, doc: Document, caret: CaretRef | null): HTMLLIElement {
  const li = doc.createElement('li');

  if (block.tagName.toLowerCase() === 'p' && !block.attributes.length) {
    // Obyčejný odstavec se do položky rozbalí, aby nevznikalo <li><p>…</p></li>.
    // Vyprázdněná slupka musí pryč, jinak za seznamem zůstane <p></p>.
    while (block.firstChild) li.appendChild(block.firstChild);
    block.parentNode?.removeChild(block);

    // V prázdném odstavci míří kurzor na odstavec samotný, ne na text v něm —
    // a ten odstavec právě zmizel. Bez přesměrování na položku ho `restoreCaret`
    // v kořeni nenajde, kurzor zůstane mezi bloky a první napsané písmeno
    // skončí za seznamem. Položka přebírá obsah v pořadí, offset proto sedí.
    if (caret && caret.node === block) caret.node = li;
  } else {
    li.appendChild(block);
  }

  return li;
}

/**
 * Zapne, vypne nebo přepne druh seznamu nad vybranými bloky.
 */
function toggleList(editor: Editor, tag: ListTag): boolean {
  const range = editor.selection.getRange();
  if (!range) return false;

  const doc = editor.document;

  // Položky i kurzor se zjišťují před srovnáním struktury — potom už by rozsah
  // ukazoval jinam.
  const caret = captureCaret(editor);
  const items = collectItems(editor, range);
  prepare(editor, range.commonAncestorContainer);

  if (items.length > 0) {
    const sameKind = items.every((li) => listOf(li)?.tagName.toLowerCase() === tag);

    if (sameKind) {
      // Už je to tenhle druh seznamu → ven z něj.
      for (const li of items.reverse()) outdentItemToTop(li, editor, caret);
    } else {
      const lists = new Set(items.map((li) => listOf(li)).filter(Boolean) as Element[]);
      for (const list of lists) retagList(list, tag, doc);
    }

    restoreCaret(editor, caret);
    editor.commit('list');
    return true;
  }

  // Z odstavců udělat seznam.
  const blocks = blocksInRange(range, editor.root);
  if (blocks.length === 0) {
    const created = ensureBlock(range.startContainer, editor.root, doc);
    if (!created) return false;
    blocks.push(created);
  }

  const list = doc.createElement(tag);
  blocks[0]!.parentNode?.insertBefore(list, blocks[0]!);
  for (const block of blocks) list.appendChild(makeItem(block, doc, caret));

  mergeAdjacentLists(list, editor.root);
  restoreCaret(editor, caret);
  editor.commit('list');
  return true;
}

/** Položky seznamu, kterých se rozsah dotýká. */
function collectItems(editor: Editor, range: Range): Element[] {
  const blocks = blocksInRange(range, editor.root);
  const out: Element[] = [];

  const add = (node: Node | null): void => {
    const li = closestListItem(node, editor.root);
    if (li && !out.includes(li)) out.push(li);
  };

  if (blocks.length === 0) add(range.startContainer);
  for (const block of blocks) add(block);

  return out;
}

/** Vymění <ul> za <ol> a naopak, i u zanořených seznamů. */
function retagList(list: Element, tag: ListTag, doc: Document): Element {
  if (list.tagName.toLowerCase() === tag) return list;

  const next = doc.createElement(tag);
  for (const attr of Array.from(list.attributes)) next.setAttribute(attr.name, attr.value);
  while (list.firstChild) next.appendChild(list.firstChild);
  list.parentNode?.replaceChild(next, list);
  return next;
}

/**
 * Vysouvá položku tak dlouho, dokud není ze seznamu venku.
 *
 * Po posledním vysunutí je z položky odstavec mimo seznam, takže `listOf` vrátí
 * null a cyklus skončí sám. Pojistka je tu pro případ poškozené struktury.
 *
 * Poslední vysunutí `<li>` zruší. Kurzor, který mířil na položku samotnou —
 * v prázdné položce vždycky — proto musí přejít na odstavec, který po ní zbyl.
 */
function outdentItemToTop(li: Element, editor: Editor, caret: CaretRef | null): void {
  let guard = 0;
  let landing: Element | null = null;

  while (li.tagName.toLowerCase() === 'li' && listOf(li) && guard++ < 24) {
    const next = outdentItem(li, editor.root, editor.document);
    if (!next) break;
    landing = next;
  }

  if (caret && caret.node === li && landing && !editor.root.contains(li)) {
    caret.node = landing;
  }
}

export function registerListCommands(editor: Editor): void {
  const { commands } = editor;

  commands.add('bullist', (ed) => toggleList(ed, 'ul'));
  commands.add('numlist', (ed) => toggleList(ed, 'ol'));

  commands.add('indent', (ed) => {
    const range = ed.selection.getRange();
    if (!range) return false;

    const caret = captureCaret(ed);
    const items = collectItems(ed, range);
    if (items.length === 0) return false;
    prepare(ed, range.commonAncestorContainer);

    let changed = false;
    for (const li of items) {
      if (indentItem(li, ed.root, ed.document)) changed = true;
    }
    if (!changed) return false;

    restoreCaret(ed, caret);
    ed.commit('indent');
    return true;
  }, (ed) => {
    // Nestačí být v seznamu — první položka se zanořit nedá, není ji pod co
    // pověsit. Kdyby to guard neřekl, tlačítko by vypadalo dostupně a nic
    // by neudělalo.
    const li = closestListItem(ed.selection.getRange()?.startContainer ?? null, ed.root);
    return li !== null && li.previousElementSibling?.tagName.toLowerCase() === 'li';
  });

  /**
   * Vlastnosti seznamu — druh značky, odsazení a počáteční číslo.
   *
   * Argument je pole po úrovních, ne jedna sada hodnot: každá úroveň je vlastní
   * `<ul>`/`<ol>`, takže se nastavuje samostatně. Index odpovídá `listChain`,
   * tedy odshora dolů — stejné pořadí, v jakém jsou pole v dialogu.
   */
  commands.add('listprops', (ed, args) => {
    const range = ed.selection.getRange();
    if (!range) return false;

    const caret = captureCaret(ed);
    prepare(ed, range.commonAncestorContainer);

    // Řetěz se čte až po srovnání struktury: seznam visící jako sourozenec
    // položky se tím teprve dostane na svou úroveň, a do té doby by index
    // ukazoval na jiný seznam, než jaký uživatel v dialogu viděl.
    const chain = listChain(caret?.node ?? range.startContainer, ed.root);
    if (chain.length === 0) return false;

    const levels = ((args ?? {}) as { levels?: Array<Partial<ListProps>> }).levels ?? [];
    let changed = false;
    for (const [i, list] of chain.entries()) {
      const props = levels[i];
      if (!props) continue;
      applyListProps(list, props);
      changed = true;
    }
    if (!changed) return false;

    restoreCaret(ed, caret);
    ed.commit('list');
    return true;
  }, (ed) => closestListItem(ed.selection.getRange()?.startContainer ?? null, ed.root) !== null);

  commands.add('outdent', (ed) => {
    const range = ed.selection.getRange();
    if (!range) return false;

    const caret = captureCaret(ed);
    const items = collectItems(ed, range);
    if (items.length === 0) return false;
    prepare(ed, range.commonAncestorContainer);

    let changed = false;
    for (const li of items.reverse()) {
      if (outdentItem(li, ed.root, ed.document)) changed = true;
    }
    if (!changed) return false;

    restoreCaret(ed, caret);
    ed.commit('outdent');
    return true;
  }, (ed) => closestListItem(ed.selection.getRange()?.startContainer ?? null, ed.root) !== null);
}

/**
 * Enter uvnitř seznamu.
 *
 * V prázdné položce se místo další prázdné položky vysune o úroveň výš. Je to
 * jediný způsob, jak se ze zanořeného seznamu dostat ven bez sáhnutí po myši,
 * a uživatelé to od každého editoru čekají.
 */
export function insertParagraphInList(editor: Editor, li: Element): boolean {
  const range = editor.selection.getRange();
  if (!range) return false;

  if (isEmptyItem(li)) {
    const landing = outdentItem(li, editor.root, editor.document);
    if (!landing) return false;
    editor.selection.collapseTo(landing, 0);
    editor.commit('outdent');
    return true;
  }

  range.deleteContents();
  const next = splitListItem(li, range, editor.document);
  editor.selection.collapseTo(itemContent(next), 0);
  editor.commit('split');
  return true;
}

/**
 * Backspace na začátku položky.
 *
 * Zanořená položka se vysune, položka na nejvyšší úrovni se spojí s předchozí,
 * a první položka seznamu ze seznamu vystoupí.
 */
export function deleteBackwardInList(editor: Editor, li: Element): boolean {
  const doc = editor.document;
  const list = listOf(li);
  if (!list) return false;

  const prev = li.previousElementSibling;

  if (!prev) {
    // Kurzor byl na začátku položky; ta zaniká, takže musí na začátek toho,
    // co po ní zbylo. V prázdné položce nemá živý výběr čeho jiného se držet.
    const landing = outdentItem(li, editor.root, doc);
    if (!landing) return false;
    editor.selection.collapseTo(landing, 0);
    editor.commit('outdent');
    return true;
  }

  if (prev.tagName.toLowerCase() !== 'li') return false;

  // Spojit s předchozí položkou. Její zanořený seznam musí zůstat na konci.
  const sub = prev.lastElementChild && isList(prev.lastElementChild)
    ? prev.lastElementChild
    : null;
  if (sub) prev.removeChild(sub);

  const target = itemContent(prev);
  if (isEmptyBlock(target)) {
    while (target.firstChild) target.removeChild(target.firstChild);
  }
  const boundary = target.lastChild;

  const source = itemContent(li);
  while (source.firstChild) target.appendChild(source.firstChild);

  const ownSub = li.lastElementChild && isList(li.lastElementChild) ? li.lastElementChild : null;
  if (ownSub) prev.appendChild(ownSub);
  if (sub) {
    prev.appendChild(sub);
    if (ownSub) mergeAdjacentLists(ownSub, editor.root);
  }

  list.removeChild(li);
  pruneEmptyInline(prev);
  fillDeep(prev, doc);
  syncAriaLevel(list, editor.root);

  if (boundary) editor.selection.collapseTo(boundary, (boundary.nodeValue ?? '').length);
  else editor.selection.collapseTo(target, 0);

  editor.commit('delete');
  return true;
}

/** Tab a Shift+Tab uvnitř seznamu. Mimo seznam Tab needitujeme — patří fokusu. */
export function handleTab(editor: Editor, shift: boolean): boolean {
  const range = editor.selection.getRange();
  if (!range) return false;
  if (!closestListItem(range.startContainer, editor.root)) return false;
  return editor.exec(shift ? 'outdent' : 'indent');
}

export { closestBlock, fillIfEmpty };
