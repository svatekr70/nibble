import { fillIfEmpty, isEmptyBlock, pruneEmptyInline } from './blocks.js';

/**
 * Seznam definic.
 *
 * Liší se od `<ul>`/`<ol>` v jedné podstatné věci: nemá jeden druh položky, ale
 * dva, které se střídají. `<dt>` je termín, `<dd>` jeho vysvětlení — a psaní
 * v něm proto vypadá jinak. Enter nepokračuje týmž, čím uživatel právě psal;
 * přepne na ten druhý, protože po termínu se čeká vysvětlení a po vysvětlení
 * další termín.
 *
 * Zanořování tady schválně není. `<dl>` uvnitř `<dd>` je platné HTML, ale
 * ovládat ho Tabem jako u seznamu by znamenalo rozhodnout, jestli se zanořuje
 * termín, vysvětlení, nebo obojí — a žádná z odpovědí není zjevná. Tab proto
 * v seznamu definic zůstává na fokusu.
 */

const NODE_ELEMENT = 1;
const ITEMS = new Set(['dt', 'dd']);

export function isDefList(node: Node | null): node is HTMLDListElement {
  return !!node && node.nodeType === NODE_ELEMENT
    && (node as Element).tagName.toLowerCase() === 'dl';
}

export function isDefItem(node: Node | null): node is HTMLElement {
  return !!node && node.nodeType === NODE_ELEMENT
    && ITEMS.has((node as Element).tagName.toLowerCase());
}

/** Nejbližší `<dt>` nebo `<dd>` nad uzlem, v mezích kořene. */
export function closestDefItem(node: Node | null, root: Element): Element | null {
  let cur: Node | null = node;
  while (cur && cur !== root) {
    if (isDefItem(cur)) return cur as Element;
    cur = cur.parentNode;
  }
  return null;
}

/** Seznam, do kterého prvek patří. */
export function defListOf(item: Element): Element | null {
  const parent = item.parentElement;
  return isDefList(parent) ? parent : null;
}

/** Ten druhý druh — po termínu vysvětlení, po vysvětlení termín. */
export function otherKind(item: Element): 'dt' | 'dd' {
  return item.tagName.toLowerCase() === 'dt' ? 'dd' : 'dt';
}

/**
 * Srovná strukturu seznamu definic.
 *
 * Řeší jedinou věc, která v cizím obsahu opravdu bývá: obsah ležící v `<dl>`
 * mimo `<dt>` i `<dd>`. Stejně jako u seznamů se to dělá až při první úpravě,
 * ne při načtení — obsah, kterého se nikdo nedotkl, se nepřepisuje.
 */
export function normalizeDefList(list: Element, doc: Document): void {
  for (const child of Array.from(list.childNodes)) {
    if (isDefItem(child)) continue;

    // Bílé znaky mezi prvky jsou v pořádku, zbytek do nich patří.
    if (child.nodeType === 3 && (child.nodeValue ?? '').trim() === '') continue;

    // Bez předchozího prvku je to termín, za termínem vysvětlení — tak, jak by
    // to dopadlo, kdyby to někdo psal v editoru.
    // Textový uzel `previousElementSibling` nemá — hledá se ručně zpátky.
    let prev: Node | null = child.previousSibling;
    while (prev && prev.nodeType !== NODE_ELEMENT) prev = prev.previousSibling;
    const tag = isDefItem(prev) && (prev as Element).tagName.toLowerCase() === 'dt'
      ? 'dd' : 'dt';

    const item = doc.createElement(tag);
    list.insertBefore(item, child);
    item.appendChild(child);
  }
}

/** Prázdný prvek: bez textu i bez samostatných značek. */
export function isEmptyDefItem(item: Element): boolean {
  return isEmptyBlock(item) || (item.textContent ?? '').trim() === '';
}

/**
 * Rozdělí prvek v místě kurzoru a druhou půlku dá do toho druhého druhu.
 *
 * Vrátí nově vzniklý prvek.
 */
export function splitDefItem(item: Element, range: Range, doc: Document): Element {
  const tail = doc.createRange();
  tail.setStart(range.endContainer, range.endOffset);
  tail.setEnd(item, item.childNodes.length);

  const next = doc.createElement(otherKind(item));
  next.appendChild(tail.extractContents());

  pruneEmptyInline(next);
  pruneEmptyInline(item);
  fillIfEmpty(next, doc);
  fillIfEmpty(item, doc);

  item.parentNode?.insertBefore(next, item.nextSibling);
  return next;
}

/**
 * Vysune prvek ze seznamu ven a udělá z něj odstavec.
 *
 * Vrací prvek, ve kterém obsah skončil — `<dt>`/`<dd>` v té chvíli zaniká
 * a volající by neměl kam posadit kurzor. Stejný důvod jako u `outdentItem`
 * v `dom/lists.ts`.
 */
export function liftDefItem(item: Element, doc: Document): Element | null {
  const list = defListOf(item);
  if (!list) return null;

  const target = list.parentNode;
  if (!target) return null;

  // Co v seznamu následuje, zůstane seznamem — ten se rozdělí.
  const tailItems = Array.from(list.children).filter(
    (child) => child !== item && (item.compareDocumentPosition(child) & 4) !== 0,
  );
  let tailList: Element | null = null;
  if (tailItems.length > 0) {
    tailList = doc.createElement('dl');
    for (const child of tailItems) tailList.appendChild(child);
  }

  const p = doc.createElement('p');
  while (item.firstChild) p.appendChild(item.firstChild);

  // Prvek mohl obsahovat vlastní blok — pak odstavec navíc nechceme.
  const inner = p.firstElementChild;
  const replacement = (p.children.length === 1 && inner
    && inner.tagName.toLowerCase() !== 'br'
    && (p.textContent ?? '') === (inner.textContent ?? ''))
    ? inner
    : p;

  list.removeChild(item);

  target.insertBefore(replacement, list.nextSibling);
  if (tailList) target.insertBefore(tailList, replacement.nextSibling);
  if (!list.firstElementChild) target.removeChild(list);

  pruneEmptyInline(replacement);
  fillIfEmpty(replacement, doc);
  return replacement;
}
