/**
 * Inline formátování nad výběrem.
 *
 * Zapnutí a vypnutí formátu jsou dvě různé operace a schválně se dělají jinak.
 *
 * Zapnutí: rozsah se vyjme přes `extractContents()`, obalí po textových uzlech
 * a vloží zpět. Prohlížeč tím sám vyřeší dělení uzlů na hranicích výběru.
 * Obaluje se po textových uzlech, takže `<strong>` nikdy neskončí kolem `<p>`.
 *
 * Vypnutí to takhle udělat nejde. Když výběr leží uvnitř `<strong>`, vyjmutím
 * obsahu se obal nezruší — zůstane prázdný a vložený text spadne zpátky dovnitř.
 * Formát se proto odstraňuje v živém DOMu: krajní textové uzly se rozdělí a
 * každý zasažený uzel se z obalu vyzuje rozdělením předků.
 */

const NODE_ELEMENT = 1;
const NODE_TEXT = 3;

function collectTextNodes(root: Node): Text[] {
  const out: Text[] = [];
  const walk = (n: Node): void => {
    if (n.nodeType === NODE_TEXT) { out.push(n as Text); return; }
    for (const child of Array.from(n.childNodes)) walk(child);
  };
  walk(root);
  return out;
}

function hasAncestorTag(node: Node, tag: string, stopAt: Node): boolean {
  let cur: Node | null = node.parentNode;
  while (cur && cur !== stopAt) {
    if (cur.nodeType === NODE_ELEMENT && (cur as Element).tagName.toLowerCase() === tag) {
      return true;
    }
    cur = cur.parentNode;
  }
  return false;
}

function nearestAncestor(node: Node, tag: string, stopAt: Node): Element | null {
  let cur: Node | null = node.parentNode;
  while (cur && cur !== stopAt) {
    if (cur.nodeType === NODE_ELEMENT && (cur as Element).tagName.toLowerCase() === tag) {
      return cur as Element;
    }
    cur = cur.parentNode;
  }
  return null;
}

/**
 * Rozdělí `container` v místě `node`: uzel a vše za ním, na všech úrovních mezi,
 * skončí v novém klonu vloženém hned za container. Vrátí ten klon.
 */
function splitAt(container: Element, node: Node): Element {
  let child: Node = node;
  let parent: Node = node.parentNode!;

  for (;;) {
    const clone = (parent as Element).cloneNode(false) as Element;
    let n: Node | null = child;
    while (n) {
      const next: Node | null = n.nextSibling;
      clone.appendChild(n);
      n = next;
    }
    parent.parentNode!.insertBefore(clone, parent.nextSibling);

    if (parent === container) return clone;
    child = clone;
    parent = clone.parentNode!;
  }
}

/** Následující uzel v dokumentovém pořadí za podstromem `node`, uvnitř `within`. */
function nextAfter(node: Node, within: Node): Node | null {
  let cur: Node | null = node;
  while (cur && cur !== within) {
    if (cur.nextSibling) return cur.nextSibling;
    cur = cur.parentNode;
  }
  return null;
}

function unwrap(el: Element): void {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

function removeIfEmpty(el: Element | null): void {
  if (el && !el.firstChild) el.parentNode?.removeChild(el);
}

/** Slije sousední <span> se stejnou hodnotou dané vlastnosti. */
function mergeStyled(root: Element, property: string): void {
  for (const el of Array.from(root.querySelectorAll?.('span[style]') ?? [])) {
    if (!el.parentNode) continue;

    const value = (el as HTMLElement).style.getPropertyValue(property);
    if (!value) continue;

    let next = el.nextSibling;
    while (
      next && next.nodeType === NODE_ELEMENT
      && (next as Element).tagName.toLowerCase() === 'span'
      && (next as HTMLElement).style.getPropertyValue(property) === value
      && (next as Element).getAttribute('style') === el.getAttribute('style')
    ) {
      while (next.firstChild) el.appendChild(next.firstChild);
      const after = next.nextSibling;
      next.parentNode!.removeChild(next);
      next = after;
    }
  }
  (root as Element).normalize?.();
}

/** Slije sousední identické obaly, ať nevzniká <strong>a</strong><strong>b</strong>. */
function mergeAdjacent(root: Node, tag: string): void {
  const matches = Array.from((root as Element).querySelectorAll?.(tag) ?? []);
  for (const el of matches) {
    if (!el.parentNode) continue;
    let next = el.nextSibling;
    while (
      next &&
      next.nodeType === NODE_ELEMENT &&
      (next as Element).tagName.toLowerCase() === tag
    ) {
      while (next.firstChild) el.appendChild(next.firstChild);
      const after = next.nextSibling;
      next.parentNode!.removeChild(next);
      next = after;
    }
  }
  (root as Element).normalize?.();
}

export class Formatter {
  constructor(
    private readonly root: HTMLElement,
    private readonly doc: Document,
  ) {}

  /**
   * Je celý rozsah už takhle naformátovaný?
   *
   * `cloneContents()` obal nad hranicí výběru neponechá: u výběru, který přesně
   * kopíruje obsah `<strong>`, přijdou jen holé textové uzly. Proto se vedle
   * fragmentu ptáme i původního dokumentu — a to včetně uzlu samotného, ne jen
   * jeho předků, protože společný předek výběru může být přímo ten obal.
   */
  matches(range: Range, tag: string): boolean {
    if (range.collapsed) return this.withinTag(range.startContainer, tag);

    const frag = range.cloneContents();
    const texts = collectTextNodes(frag).filter((t) => t.data.trim() !== '');
    if (texts.length === 0) return this.withinTag(range.startContainer, tag);

    return texts.every((t) => hasAncestorTag(t, tag, frag))
      || this.withinTag(range.commonAncestorContainer, tag);
  }

  toggle(range: Range, tag: string): Range {
    return this.matches(range, tag) ? this.remove(range, tag) : this.apply(range, tag);
  }

  private withinTag(node: Node | null, tag: string): boolean {
    let cur: Node | null = node;
    while (cur && cur !== this.root) {
      if (cur.nodeType === NODE_ELEMENT && (cur as Element).tagName.toLowerCase() === tag) {
        return true;
      }
      cur = cur.parentNode;
    }
    return false;
  }

  private apply(range: Range, tag: string): Range {
    const frag = range.extractContents();

    // Ať se obaly nevnořují do sebe.
    for (const el of Array.from((frag as unknown as Element).querySelectorAll?.(tag) ?? [])) {
      unwrap(el);
    }

    for (const text of collectTextNodes(frag)) {
      if (text.data === '') continue;
      const wrapper = this.doc.createElement(tag);
      text.parentNode?.insertBefore(wrapper, text);
      wrapper.appendChild(text);
    }

    const first = frag.firstChild;
    const last = frag.lastChild;
    range.insertNode(frag);

    const out = this.doc.createRange();
    if (first && last) {
      out.setStartBefore(first);
      out.setEndAfter(last);
    } else {
      out.setStart(range.startContainer, range.startOffset);
      out.collapse(true);
    }

    mergeAdjacent((first?.parentNode ?? this.root) as Element, tag);
    return out;
  }

  // ------------------------------------------------------------ barvy a styly

  /**
   * Hodnota vlastnosti stylu pod kurzorem — jen z inline zápisu, ne z motivu.
   *
   * `getComputedStyle` by u textu bez vlastní barvy vrátil barvu stránky
   * a tlačítko by pak tvrdilo, že barva nastavená je. Zajímá nás jen to,
   * co je opravdu v obsahu.
   *
   * Hledá se od **obsahu** rozsahu, ne od jeho `startContainer`. Po obarvení
   * vrací příkaz rozsah kolem nově vzniklého `<span>`, takže `startContainer`
   * je rodičovský odstavec — a ten o barvě nic neví. Bez sestupu dovnitř by
   * lišta po nastavení písma tvrdila, že žádné nastavené není.
   */
  queryStyle(range: Range, property: string): string | null {
    let cur: Node | null = this.innermostAt(range);

    while (cur && cur !== this.root) {
      if (cur.nodeType === NODE_ELEMENT) {
        const value = (cur as HTMLElement).style?.getPropertyValue(property);
        if (value) return value;
      }
      cur = cur.parentNode;
    }

    return null;
  }

  /** Nejhlubší uzel na začátku rozsahu — tam, kde text opravdu je. */
  private innermostAt(range: Range): Node {
    let node: Node = range.startContainer;

    if (node.nodeType === NODE_ELEMENT) {
      const at = node.childNodes[range.startOffset] ?? node.firstChild;
      if (at) node = at;
    }

    // Sestup k prvnímu skutečnému obsahu, ne k prvnímu prázdnému obalu.
    let guard = 0;
    while (node.nodeType === NODE_ELEMENT && node.firstChild && guard++ < 32) {
      node = node.firstChild;
    }

    return node;
  }

  /**
   * Obarví výběr. Stávající hodnotu téže vlastnosti přepíše.
   *
   * Nejdřív se vlastnost sundá, teprve pak nastaví. Bez toho by výběr ležící
   * uvnitř obarveného `<span>` skončil ve druhém `<span>` uvnitř prvního:
   * `extractContents()` obal nezruší a vložený obsah spadne zpátky dovnitř.
   */
  applyStyle(range: Range, property: string, value: string): Range {
    const cleared = this.queryStyle(range, property) !== null
      ? this.removeStyle(range, property)
      : range;

    const frag = cleared.extractContents();
    range = cleared;

    // Uvnitř výběru se stará hodnota ruší — jinak by vnitřní <span> vyhrál.
    for (const el of Array.from((frag as unknown as Element).querySelectorAll?.('[style]') ?? [])) {
      (el as HTMLElement).style.removeProperty(property);
      if ((el as HTMLElement).getAttribute('style') === '') el.removeAttribute('style');
      if (el.tagName.toLowerCase() === 'span' && el.attributes.length === 0) unwrap(el);
    }

    for (const text of collectTextNodes(frag)) {
      if (text.data === '') continue;
      const span = this.doc.createElement('span');
      span.style.setProperty(property, value);
      text.parentNode?.insertBefore(span, text);
      span.appendChild(text);
    }

    const first = frag.firstChild;
    const last = frag.lastChild;
    range.insertNode(frag);

    const out = this.doc.createRange();
    if (first && last) {
      out.setStartBefore(first);
      out.setEndAfter(last);
    } else {
      out.setStart(range.startContainer, range.startOffset);
      out.collapse(true);
    }

    mergeStyled((first?.parentNode ?? this.root) as Element, property);
    return out;
  }

  /**
   * Sundá vlastnost z výběru.
   *
   * Stejně jako u značek to nejde přes `extractContents()`: když výběr leží
   * uvnitř obarveného `<span>`, vyjmutím obsahu se obal nezruší a text spadne
   * zpátky dovnitř. Pracuje se proto v živém DOMu.
   */
  removeStyle(range: Range, property: string): Range {
    this.splitBoundaries(range);

    const targets = collectTextNodes(this.root).filter(
      (t) => t.data !== '' && range.intersectsNode(t),
    );

    for (const text of targets) {
      let guard = 0;
      while (this.nearestStyled(text, property) && guard++ < 16) {
        const el = this.nearestStyled(text, property)!;

        const middle = splitAt(el, text);
        const after = nextAfter(text, middle);
        if (after) splitAt(middle, after);

        removeIfEmpty(el);

        (middle as HTMLElement).style.removeProperty(property);
        if (middle.getAttribute('style') === '') middle.removeAttribute('style');

        // Prázdný obal bez atributů už nic nenese.
        if (middle.tagName.toLowerCase() === 'span' && middle.attributes.length === 0) {
          unwrap(middle);
        } else {
          break;   // obal si nechal jinou vlastnost, výš se nechodí
        }
      }
    }

    const out = this.doc.createRange();
    const first = targets[0];
    const last = targets[targets.length - 1];
    if (first && last && first.parentNode && last.parentNode) {
      out.setStartBefore(first);
      out.setEndAfter(last);
    } else {
      out.setStart(range.startContainer, range.startOffset);
      out.collapse(true);
    }

    this.root.normalize();
    return out;
  }

  private nearestStyled(node: Node, property: string): HTMLElement | null {
    let cur: Node | null = node.parentNode;
    while (cur && cur !== this.root) {
      if (cur.nodeType === NODE_ELEMENT
          && (cur as HTMLElement).style?.getPropertyValue(property)) {
        return cur as HTMLElement;
      }
      cur = cur.parentNode;
    }
    return null;
  }

  /** Rozdělí krajní textové uzly, aby výběr končil na hranicích uzlů. */
  private splitBoundaries(range: Range): void {
    if (range.startContainer.nodeType === NODE_TEXT) {
      const start = range.startContainer as Text;
      if (range.startOffset > 0 && range.startOffset < start.data.length) {
        start.splitText(range.startOffset);
      }
    }
    if (range.endContainer.nodeType === NODE_TEXT) {
      const end = range.endContainer as Text;
      if (range.endOffset > 0 && range.endOffset < end.data.length) {
        end.splitText(range.endOffset);
      }
    }
  }

  private remove(range: Range, tag: string): Range {
    this.splitBoundaries(range);   // rozsahy jsou živé a upraví se samy

    const targets = collectTextNodes(this.root).filter(
      (t) => t.data !== '' && range.intersectsNode(t),
    );

    for (const text of targets) {
      let guard = 0;
      while (nearestAncestor(text, tag, this.root) && guard++ < 16) {
        const el = nearestAncestor(text, tag, this.root)!;

        // Vyzout uzel z obalu: rozdělit obal před ním a znovu za ním, takže
        // zbude klon obsahující jen jeho — a ten se rozbalí.
        const middle = splitAt(el, text);
        const after = nextAfter(text, middle);
        if (after) splitAt(middle, after);

        removeIfEmpty(el);
        unwrap(middle);
      }
    }

    const out = this.doc.createRange();
    const first = targets[0];
    const last = targets[targets.length - 1];
    if (first && last && first.parentNode && last.parentNode) {
      out.setStartBefore(first);
      out.setEndAfter(last);
    } else {
      out.setStart(range.startContainer, range.startOffset);
      out.collapse(true);
    }

    this.root.normalize();
    return out;
  }
}
