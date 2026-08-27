import { fillIfEmpty, isEmptyBlock, pruneEmptyInline } from './blocks.js';

/**
 * Seznamy.
 *
 * Nejhorší část každého editoru, a data z ostrého provozu ukazují proč: ze 72 dokumentů
 * se seznamem má jich 11 neplatnou sourozeneckou formu `</li><ul>` (export
 * z Google Docs) a skutečné zanoření jen 6. Hloubka bývá schovaná v `aria-level`
 * na plochém seznamu, ne ve struktuře.
 *
 * Nibble proto do struktury nesahá při načtení — to by přepsalo obsah, kterého
 * se nikdo nedotkl. Srovná se vždycky jen ten seznam, se kterým uživatel právě
 * pracuje, a `aria-level` se přitom udržuje v souladu s novou hloubkou.
 */

const NODE_ELEMENT = 1;
const NODE_TEXT = 3;
const LISTS = new Set(['ul', 'ol']);

// Konkrétní typy, ne jen `Element`: predikát `node is Element` by při negaci
// zúžil ostatní prvky na `never` a `!isList(x)` by přestalo jít použít.
export function isList(node: Node | null): node is HTMLUListElement | HTMLOListElement {
  return !!node && node.nodeType === NODE_ELEMENT
    && LISTS.has((node as Element).tagName.toLowerCase());
}

export function isListItem(node: Node | null): node is HTMLLIElement {
  return !!node && node.nodeType === NODE_ELEMENT
    && (node as Element).tagName.toLowerCase() === 'li';
}

/** Nejbližší <li> obsahující uzel, v mezích kořene. */
export function closestListItem(node: Node | null, root: Element): Element | null {
  let cur: Node | null = node;
  while (cur && cur !== root) {
    if (isListItem(cur)) return cur;
    cur = cur.parentNode;
  }
  return null;
}

/** Seznam, do kterého položka patří. */
export function listOf(li: Element): Element | null {
  const parent = li.parentElement;
  return isList(parent) ? parent : null;
}

/** Kolik seznamů je nad položkou. Nejvyšší úroveň je 1. */
export function itemDepth(li: Element, root: Element): number {
  let depth = 0;
  let cur: Node | null = li.parentNode;
  while (cur && cur !== root) {
    if (isList(cur)) depth++;
    cur = cur.parentNode;
  }
  return depth;
}

/** Zanořený seznam na konci položky, pokud tam je. */
export function sublistOf(li: Element): Element | null {
  const last = li.lastElementChild;
  return isList(last) ? last : null;
}

/**
 * Srovná strukturu jednoho seznamu.
 *
 * Řeší dvě věci: seznam, který visí jako sourozenec `<li>` místo uvnitř něj,
 * a obsah, který leží v seznamu mimo jakoukoli položku.
 */
export function normalizeList(list: Element, doc: Document): void {
  for (const child of Array.from(list.childNodes)) {
    if (isListItem(child)) {
      for (const nested of Array.from(child.children)) {
        if (isList(nested)) normalizeList(nested, doc);
      }
      continue;
    }

    if (isList(child)) {
      const prev = child.previousElementSibling;
      if (isListItem(prev)) {
        prev.appendChild(child);
      } else {
        const li = doc.createElement('li');
        list.insertBefore(li, child);
        li.appendChild(child);
      }
      normalizeList(child, doc);
      continue;
    }

    // Bílé znaky mezi položkami jsou v pořádku, zbytek patří do položky.
    if (child.nodeType === NODE_TEXT && (child.nodeValue ?? '').trim() === '') continue;

    const li = doc.createElement('li');
    list.insertBefore(li, child);
    li.appendChild(child);
  }
}

/**
 * Srovná `aria-level` podle skutečné hloubky.
 *
 * Nastavuje se jen tam, kde už atribut je. Doplňovat ho do seznamů, které ho
 * nikdy neměly, by znamenalo psát do obsahu značky, o které nikdo nežádal.
 */
export function syncAriaLevel(list: Element, root: Element): void {
  for (const li of Array.from(list.querySelectorAll('li'))) {
    if (!li.hasAttribute('aria-level')) continue;
    li.setAttribute('aria-level', String(itemDepth(li, root)));
  }
}

/** Slije sousední seznamy stejného druhu. Vrátí ten, který zbyl. */
export function mergeAdjacentLists(list: Element, root: Element): Element {
  let current = list;

  const prev = current.previousElementSibling;
  if (isList(prev) && prev.tagName === current.tagName) {
    while (current.firstChild) prev.appendChild(current.firstChild);
    current.parentNode?.removeChild(current);
    current = prev;
  }

  let next = current.nextElementSibling;
  while (isList(next) && next.tagName === current.tagName) {
    const after = next.nextElementSibling;
    while (next.firstChild) current.appendChild(next.firstChild);
    next.parentNode?.removeChild(next);
    next = after;
  }

  syncAriaLevel(current, root);
  return current;
}

/** Blok uvnitř položky, do kterého se píše — nebo položka sama. */
export function itemContent(li: Element): Element {
  const first = li.firstElementChild;
  if (first && !isList(first) && first.tagName.toLowerCase() !== 'br') return first;
  return li;
}

/** Doplní <br> tam, kde se v položce píše. */
export function fillDeep(li: Element, doc: Document): void {
  fillIfEmpty(itemContent(li), doc);
}

/** Prázdná položka: bez textu i bez samostatných prvků, zanořený seznam nepočítá. */
export function isEmptyItem(li: Element): boolean {
  const probe = li.ownerDocument.createElement('li');
  for (const child of Array.from(li.childNodes)) {
    if (isList(child)) continue;
    probe.appendChild(child.cloneNode(true));
  }
  return isEmptyBlock(probe) || (probe.textContent ?? '').trim() === '';
}

/**
 * Zanoří položku o úroveň hloub. Vrátí false, když nemá do čeho — první položka
 * seznamu se zanořit nedá, nebylo by ji pod co pověsit.
 */
export function indentItem(li: Element, root: Element, doc: Document): boolean {
  const list = listOf(li);
  const prev = li.previousElementSibling;
  if (!list || !isListItem(prev)) return false;

  let sub = sublistOf(prev);
  if (!sub) {
    sub = doc.createElement(list.tagName.toLowerCase());
    prev.appendChild(sub);
  }
  sub.appendChild(li);

  const sublists = Array.from(prev.children).filter(isList);
  if (sublists.length > 1) mergeAdjacentLists(sublists[0]!, root);

  syncAriaLevel(list, root);
  return true;
}

/**
 * Vysune položku o úroveň výš. Na nejvyšší úrovni z ní udělá odstavec.
 *
 * Co v seznamu následovalo za položkou, se musí přesunout dovnitř ní — jinak by
 * se ze zbytku staly položky o úroveň výš, než kde původně byly.
 *
 * Vrací prvek, ve kterém obsah položky skončil, ne jen `true`. Na nejvyšší
 * úrovni `<li>` zaniká a volající by neměl kam posadit kurzor: `closestListItem`
 * na odpojené položce vrátí ji samotnou, takže by se kurzor posadil mimo
 * dokument a psaní by skončilo kdesi na jeho začátku.
 */
export function outdentItem(li: Element, root: Element, doc: Document): Element | null {
  const list = listOf(li);
  if (!list) return null;

  const following: Element[] = [];
  let sibling = li.nextElementSibling;
  while (sibling) {
    following.push(sibling);
    sibling = sibling.nextElementSibling;
  }

  if (following.length > 0) {
    let sub = sublistOf(li);
    if (!sub) {
      sub = doc.createElement(list.tagName.toLowerCase());
      li.appendChild(sub);
    }
    for (const item of following) sub.appendChild(item);
  }

  const parentLi = list.parentElement;

  if (isListItem(parentLi)) {
    parentLi.parentNode?.insertBefore(li, parentLi.nextSibling);
    if (!list.firstElementChild) list.parentNode?.removeChild(list);
    fillDeep(li, doc);
    const outer = listOf(li);
    if (outer) syncAriaLevel(outer, root);
    return itemContent(li);
  }

  // Nejvyšší úroveň — ze seznamu ven.
  const target = list.parentNode;
  if (!target) return null;

  const sub = sublistOf(li);
  if (sub) li.removeChild(sub);

  // Položky za touhle zůstávají v seznamu, který se rozdělí.
  const tailItems = Array.from(list.children).filter(
    (child) => child !== li && li.compareDocumentPosition(child) & 4,
  );
  let tailList: Element | null = null;
  if (tailItems.length > 0) {
    tailList = doc.createElement(list.tagName.toLowerCase());
    for (const item of tailItems) tailList.appendChild(item);
  }

  const p = doc.createElement('p');
  while (li.firstChild) p.appendChild(li.firstChild);

  // Položka mohla obsahovat vlastní blok (<li><p>…</p></li>) — pak odstavec navíc nechceme.
  const inner = p.firstElementChild;
  const replacement = (p.children.length === 1 && inner && !isList(inner)
    && inner.tagName.toLowerCase() !== 'br'
    && (p.textContent ?? '') === (inner.textContent ?? ''))
    ? inner
    : p;

  list.removeChild(li);

  const after = list.nextSibling;
  target.insertBefore(replacement, after);
  if (sub) target.insertBefore(sub, replacement.nextSibling);
  if (tailList) target.insertBefore(tailList, sub ? sub.nextSibling : replacement.nextSibling);
  if (!list.firstElementChild) target.removeChild(list);

  pruneEmptyInline(replacement);
  fillIfEmpty(replacement, doc);
  return replacement;
}

/** Rozdělí položku v místě kurzoru. Zanořený seznam zůstane u původní položky. */
export function splitListItem(li: Element, range: Range, doc: Document): Element {
  const sub = sublistOf(li);
  const end = sub
    ? Array.prototype.indexOf.call(li.childNodes, sub)
    : li.childNodes.length;

  const tail = doc.createRange();
  tail.setStart(range.endContainer, range.endOffset);
  tail.setEnd(li, end);

  const next = doc.createElement('li');
  for (const attr of Array.from(li.attributes)) next.setAttribute(attr.name, attr.value);
  next.appendChild(tail.extractContents());

  pruneEmptyInline(next);
  pruneEmptyInline(li);
  fillDeep(next, doc);
  fillDeep(li, doc);

  li.parentNode?.insertBefore(next, li.nextSibling);
  return next;
}
