const BLOCKS = new Set([
  'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre',
  'li', 'td', 'th', 'figcaption', 'section', 'article',
  // `dt` a `dd` ano, `dl` ne — stejný důvod jako u `ul`/`ol`: `closestBlock`
  // má vracet prvek, do kterého se píše, ne obal kolem celého seznamu.
  'dt', 'dd',
]);

/** Bloky, do kterých se dá psát a které jde navzájem přepínat. */
export const TEXT_BLOCKS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre'] as const;

/** Bloky, které nemají vlastní obsah — Enter je nesmí dělit. */
const ATOMIC = new Set(['hr', 'img', 'table']);

/**
 * Prvky, které blok v editorovém smyslu nejsou, ale do odstavce nepatří.
 *
 * `<ul>` ani `<ol>` v `BLOCKS` být nesmí — `closestBlock` by pak vracel seznam
 * místo položky a Enter by dělil celý seznam. Obalování holého textu je ale
 * musí brát jako hranici: bez toho `ensureBlock` shrábne i sousední seznam a
 * z `<ol>…</ol>text` vznikne `<p><ol>…</ol>text</p>`.
 */
const FLOW_ONLY = new Set([
  'ul', 'ol', 'dl', 'figure', 'form', 'fieldset',
  'header', 'footer', 'nav', 'aside', 'main', 'details', 'address',
]);

/** Konec souvislého úseku inline obsahu — sem už odstavec nesahá. */
function isFlowBoundary(node: Node | null): boolean {
  if (isBlock(node) || isAtomic(node)) return true;
  return !!node && node.nodeType === NODE_ELEMENT
    && FLOW_ONLY.has((node as Element).tagName.toLowerCase());
}

const NODE_ELEMENT = 1;
const NODE_TEXT = 3;

export function isBlock(node: Node | null): node is Element {
  return !!node && node.nodeType === NODE_ELEMENT
    && BLOCKS.has((node as Element).tagName.toLowerCase());
}

export function isAtomic(node: Node | null): boolean {
  return !!node && node.nodeType === NODE_ELEMENT
    && ATOMIC.has((node as Element).tagName.toLowerCase());
}

export function closestBlock(node: Node | null, root: Element): Element | null {
  let cur: Node | null = node;
  while (cur && cur !== root) {
    if (isBlock(cur)) return cur;
    cur = cur.parentNode;
  }
  return null;
}

/**
 * Obaly, které mají držet bloky, ne holý text.
 *
 * `<blockquote>` má podle specifikace obsahový model „flow content", takže
 * `<blockquote>text</blockquote>` je platné HTML a ve starším obsahu se objevit
 * může. Pro editor je to ale past: `closestBlock` vrátí samotnou citaci, takže
 * Enter ji rozdělí na dvě citace místo na dva odstavce a zrušení citace nemá
 * co vyndat. Srovná se proto při první úpravě — stejně líně jako u seznamů.
 */
const BLOCK_CONTAINERS = new Set(['blockquote', 'li', 'td', 'th', 'dt', 'dd', 'figure']);

/** Obalí holý inline obsah uvnitř kontejneru odstavci. */
export function normalizeContainer(container: Element, doc: Document): void {
  const loose: Node[] = [];

  const flush = (): void => {
    if (loose.length === 0) return;
    const p = doc.createElement('p');
    container.insertBefore(p, loose[0]!);
    for (const node of loose) p.appendChild(node);
    loose.length = 0;
  };

  for (const child of Array.from(container.childNodes)) {
    if (isFlowBoundary(child)) { flush(); continue; }
    if (child.nodeType === 3 && (child.nodeValue ?? '').trim() === '' && loose.length === 0) {
      continue;   // bílé znaky mezi bloky
    }
    loose.push(child);
  }

  flush();
}

/**
 * Blok, do kterého uzel patří. Když žádný není — v obsahu je holý text přímo
 * v kořeni — obalí se souvislý úsek inline obsahu do odstavce.
 *
 * Děje se to až při úpravě, ne při načtení. Kdyby se obalovalo hned po načtení,
 * změnil by se každý dokument, který holý text v kořeni má, aniž by o to
 * kdokoli požádal.
 */
export function ensureBlock(node: Node | null, root: Element, doc: Document): Element | null {
  const existing = closestBlock(node, root);

  if (existing) {
    // Citace s holým textem uvnitř — srovnat a vrátit odstavec, ne citaci.
    if (BLOCK_CONTAINERS.has(existing.tagName.toLowerCase()) && !hasBlockChild(existing)) {
      normalizeContainer(existing, doc);
      return closestBlock(node, root) ?? existing.firstElementChild ?? existing;
    }
    return existing;
  }

  if (!node) return null;

  // Najít krajní uzel úseku na nejvyšší úrovni, ve kterém `node` leží.
  let top: Node = node;
  while (top.parentNode && top.parentNode !== root) top = top.parentNode;
  if (top.parentNode !== root) return null;

  let first: Node = top;
  while (first.previousSibling && !isFlowBoundary(first.previousSibling)) {
    first = first.previousSibling;
  }
  let last: Node = top;
  while (last.nextSibling && !isFlowBoundary(last.nextSibling)) {
    last = last.nextSibling;
  }

  const p = doc.createElement('p');
  root.insertBefore(p, first);
  let cur: Node | null = first;
  while (cur) {
    const next: Node | null = cur === last ? null : cur.nextSibling;
    p.appendChild(cur);
    cur = next;
  }

  fillIfEmpty(p, doc);
  return p;
}

/**
 * Prázdný blok potřebuje <br>, jinak ho prohlížeč nedá kam kliknout.
 *
 * Nestačí se ptát na `firstChild`: po rozdělení bloku v něm zbývá prázdný
 * textový uzel, takže blok vypadá obsazeně, ale vyjde z něj `<p></p>` —
 * neviditelný a nedostupný kurzorem.
 */
export function fillIfEmpty(block: Element, doc: Document): void {
  if (!isEmptyBlock(block)) return;
  if (hasBr(block)) return;

  while (block.firstChild) block.removeChild(block.firstChild);
  block.appendChild(doc.createElement('br'));
}

function hasBlockChild(el: Element): boolean {
  return Array.from(el.children).some(isBlock);
}

function hasBr(block: Element): boolean {
  return Array.from(block.childNodes).some(
    (n) => n.nodeType === NODE_ELEMENT && (n as Element).tagName === 'BR',
  );
}

/** Odstraní výplňové <br> z bloku, do kterého se právě něco vkládá. */
export function clearFiller(block: Element): void {
  if (!isEmptyBlock(block)) return;
  while (block.firstChild) block.removeChild(block.firstChild);
}

/** Obsahuje blok jen zalomení nebo prázdný text? */
export function isEmptyBlock(block: Element): boolean {
  for (const child of Array.from(block.childNodes)) {
    if (child.nodeType === NODE_TEXT) {
      if ((child.nodeValue ?? '') !== '') return false;
      continue;
    }
    if (child.nodeType === NODE_ELEMENT && (child as Element).tagName === 'BR') continue;
    return false;
  }
  return true;
}

/** Je kurzor na samém začátku bloku? */
export function atBlockStart(range: Range, block: Element): boolean {
  const probe = block.ownerDocument.createRange();
  probe.selectNodeContents(block);
  probe.setEnd(range.startContainer, range.startOffset);
  return probe.toString() === '';
}

/** Je kurzor na samém konci bloku? */
export function atBlockEnd(range: Range, block: Element): boolean {
  const probe = block.ownerDocument.createRange();
  probe.selectNodeContents(block);
  probe.setStart(range.endContainer, range.endOffset);
  return probe.toString() === '';
}

/** Vymění značku bloku a nechá obsah i atributy být. */
export function convertBlock(block: Element, tag: string, doc: Document): Element {
  if (block.tagName.toLowerCase() === tag) return block;

  const next = doc.createElement(tag);
  for (const attr of Array.from(block.attributes)) {
    next.setAttribute(attr.name, attr.value);
  }
  while (block.firstChild) next.appendChild(block.firstChild);

  block.parentNode?.replaceChild(next, block);
  return next;
}

/**
 * Listové bloky, kterých se rozsah dotýká.
 *
 * Listové schválně: u `<blockquote><p>…</p></blockquote>` chce uživatel přepnout
 * odstavec, ne citaci kolem něj. Bloky, které jiný vybraný blok obsahují, proto
 * z výsledku vypadnou.
 */
export function blocksInRange(range: Range, root: Element): Element[] {
  const start = closestBlock(range.startContainer, root);
  const end = closestBlock(range.endContainer, root);
  if (!start) return [];
  if (!end || start === end) return [start];

  const all: Element[] = [];
  const collect = (node: Element): void => {
    for (const child of Array.from(node.children)) {
      if (isBlock(child)) all.push(child);
      collect(child);
    }
  };
  collect(root);

  const from = all.indexOf(start);
  const to = all.indexOf(end);
  if (from < 0 || to < 0) return [start];

  const span = all.slice(Math.min(from, to), Math.max(from, to) + 1);
  return span.filter((block) => !span.some((other) => other !== block && block.contains(other)));
}

/** Inline obaly, které se dají zahodit, když v nich po úpravě nic nezbude. */
const INLINE_WRAPPERS = new Set([
  'strong', 'em', 'b', 'i', 'u', 's', 'strike', 'span', 'a', 'code',
  'sub', 'sup', 'small', 'mark', 'font',
]);

/**
 * Zahodí prázdné inline obaly.
 *
 * Dělení bloku na hranici mezi `<strong>` a `<em>` nechá v první půlce prázdné
 * `<em></em>`. Neškodí to, ale hromadí se to při každém Enteru a v uloženém
 * HTML je pak nepořádek, který nikdo nenapsal.
 *
 * Nestačí se ptát na `firstChild`: po `extractContents()` v obalu zůstává
 * textový uzel nulové délky, takže obal vypadá obsazeně. Rozhoduje proto, jestli
 * je v něm vidět text nebo nějaký samostatný prvek.
 */
const STANDALONE = 'br,img,hr,input,video,audio,iframe,svg,canvas,object';

function isVisuallyEmpty(el: Element): boolean {
  if ((el.textContent ?? '') !== '') return false;
  return el.querySelector(STANDALONE) === null;
}

export function pruneEmptyInline(block: Element): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const el of Array.from(block.querySelectorAll('*'))) {
      if (!INLINE_WRAPPERS.has(el.tagName.toLowerCase())) continue;
      if (!isVisuallyEmpty(el)) continue;
      el.parentNode?.removeChild(el);
      changed = true;
    }
  }
}

/**
 * Rozdělí blok v místě kurzoru. Vrátí nový blok, který vznikl za původním.
 *
 * Nadpis se dělí na odstavec — pokračování nadpisu dalším nadpisem nikdo nechce.
 */
export function splitBlock(block: Element, range: Range, doc: Document): Element {
  const tail = doc.createRange();
  tail.setStart(range.endContainer, range.endOffset);
  tail.setEnd(block, block.childNodes.length);

  const contents = tail.extractContents();
  const tag = block.tagName.toLowerCase();
  const nextTag = /^h[1-6]$/.test(tag) ? 'p' : tag;

  const next = doc.createElement(nextTag);
  if (nextTag === tag) {
    for (const attr of Array.from(block.attributes)) next.setAttribute(attr.name, attr.value);
    // `id` je jediné svého druhu — dvě stejná jsou neplatné HTML a odkaz by
    // skočil jen na to první. Kotva zůstává u bloku, na kterém byla.
    next.removeAttribute('id');
  }
  next.appendChild(contents);

  pruneEmptyInline(next);
  pruneEmptyInline(block);
  fillIfEmpty(next, doc);
  fillIfEmpty(block, doc);

  block.parentNode?.insertBefore(next, block.nextSibling);
  return next;
}

/** Přesune obsah `from` na konec `into` a `from` zruší. Vrátí místo spoje. */
export function mergeBlocks(into: Element, from: Element, doc: Document): Node | null {
  if (isEmptyBlock(into)) {
    while (into.firstChild) into.removeChild(into.firstChild);
  } else {
    const last = into.lastChild;
    if (last && last.nodeType === NODE_ELEMENT && (last as Element).tagName === 'BR') {
      into.removeChild(last);
    }
  }

  const boundary = into.lastChild;
  while (from.firstChild) into.appendChild(from.firstChild);
  from.parentNode?.removeChild(from);
  fillIfEmpty(into, doc);

  return boundary;
}
