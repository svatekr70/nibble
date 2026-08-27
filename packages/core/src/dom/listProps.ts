import { isList } from './lists.js';

/**
 * Druh značky, odsazení a počáteční číslo seznamu.
 *
 * Zapisuje se atribut i vlastnost stylu současně. Vypadá to jako zbytečná
 * dvojkolejnost, ale každá půlka je jinde k něčemu: `list-style-type` umí i to,
 * na co atribut nestačí (`none` a znakové odrážky), a `type` projde i tam, kde
 * se inline styl seznamu nedodrží. Uložené HTML se čte i jinde než
 * v prohlížeči, takže se vyplatí říct totéž dvakrát.
 *
 * Oddělovač za číslem — tečka, závorka — tady schválně není, a je v tom rozdíl
 * proti znakovým odrážkám. Řetězec v `list-style-type` je statický: jako
 * odrážka poslouží, ale počítat neumí. Číslo se závorkou potřebuje
 * `@counter-style` nebo `::marker { content }`, tedy stylopis u obsahu — a ten
 * Nibble nemá jak zaručit. Slibovat v dialogu něco, co se v půlce míst
 * nezobrazí, je horší než to nenabídnout.
 */

const NODE_ELEMENT = 1;

/** Druh značky: co je v dialogu vidět a co se z toho zapíše. */
export interface MarkerKind {
  value: string;
  text: string;
  /** Atribut `type`. Prázdné znamená, že na tenhle druh atribut není. */
  attr: string;
  /** Vlastnost `list-style-type`. */
  style: string;
  list: 'ol' | 'ul';
}

export const MARKERS: readonly MarkerKind[] = [
  { value: 'decimal', text: '1, 2, 3', attr: '1', style: 'decimal', list: 'ol' },
  { value: 'lower-alpha', text: 'a, b, c', attr: 'a', style: 'lower-alpha', list: 'ol' },
  { value: 'upper-alpha', text: 'A, B, C', attr: 'A', style: 'upper-alpha', list: 'ol' },
  { value: 'lower-roman', text: 'i, ii, iii', attr: 'i', style: 'lower-roman', list: 'ol' },
  { value: 'upper-roman', text: 'I, II, III', attr: 'I', style: 'upper-roman', list: 'ol' },
  { value: 'disc', text: '● kolečko', attr: 'disc', style: 'disc', list: 'ul' },
  { value: 'circle', text: '○ kroužek', attr: 'circle', style: 'circle', list: 'ul' },
  { value: 'square', text: '▪ čtvereček', attr: 'square', style: 'square', list: 'ul' },

  // Znakové odrážky. `list-style-type` bere i řetězec, takže se obejdou bez
  // stylopisu u obsahu — a to je celý důvod, proč tady jsou. Atribut `type`
  // na ně není, kde je prohlížeč nezná, spadnou na kolečko.
  // Mezera uvnitř řetězce drží značku od textu; bez ní se lepí.
  { value: '"– "', text: '– pomlčka', attr: '', style: '"– "', list: 'ul' },
  { value: '"→ "', text: '→ šipka', attr: '', style: '"→ "', list: 'ul' },
  { value: '"✓ "', text: '✓ fajfka', attr: '', style: '"✓ "', list: 'ul' },
];

/** Druh značky bez značky. Atribut na to není, jen styl. */
export const MARKER_NONE = 'none';

export interface ListProps {
  /** Hodnota z `MARKERS`, `MARKER_NONE`, nebo prázdno = neurčeno. */
  marker: string;
  /** `list-style-position` — 'inside', 'outside', nebo prázdno. */
  position: string;
  /** Atribut `start`, jen u `<ol>`. */
  start: string;
}

/** Je to číslovaný seznam? Druhy značek se podle toho nabízejí. */
export function isOrdered(list: Element): boolean {
  return list.tagName.toLowerCase() === 'ol';
}

/**
 * Hodnota z dialogu na řetězec.
 *
 * Číselná pole vracejí `number`, ne text — bez převodu spadne `.trim()`
 * a zbytek vlastností se tiše neuloží.
 */
function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function styleOf(el: Element, property: string): string {
  return (el as HTMLElement).style?.getPropertyValue(property).trim() ?? '';
}

/**
 * Nastaví vlastnost stylu — a při shodné hodnotě nesáhne vůbec na nic.
 *
 * To druhé je tu kvůli záruce zachování obsahu. Zápis do `style` projde přes
 * CSSOM, který atribut vždycky přepíše kanonickým tvarem: z
 * `style="list-style-type:lower-alpha"` se stane `list-style-type: lower-alpha;`.
 * Kdo otevře dialog a dá Použít beze změny, tím přeformátuje blok, kterého se
 * nedotkl — a v uloženém HTML je to vidět.
 */
function setStyle(el: Element, property: string, value: string): void {
  if (styleOf(el, property) === value) return;

  const style = (el as HTMLElement).style;
  if (value === '') style.removeProperty(property);
  else style.setProperty(property, value);

  // Prázdný `style=""` v obsahu nikdo nenapsal a při ukládání by byl vidět.
  if (el.getAttribute('style') === '') el.removeAttribute('style');
}

/** Totéž pro atribut: shodná hodnota znamená nesahat. */
function setAttr(el: Element, name: string, value: string): void {
  if ((el.getAttribute(name) ?? '') === value) return;

  if (value === '') el.removeAttribute(name);
  else el.setAttribute(name, value);
}

/**
 * Druh značky, který na seznamu je.
 *
 * Styl má přednost před atributem: když se obojí rozchází, platí to, co je
 * vidět v prohlížeči. Neznámou hodnotu vrací, jak je — v dialogu se pak
 * nenabídne, ale zápis beze změny ji nesmí zahodit.
 */
function readMarker(list: Element): string {
  const style = styleOf(list, 'list-style-type');
  if (style !== '') return style;

  const attr = list.getAttribute('type') ?? '';
  if (attr === '') return '';

  const found = MARKERS.find((m) => m.attr === attr && m.list === (isOrdered(list) ? 'ol' : 'ul'));
  return found ? found.value : attr;
}

export function readListProps(list: Element): ListProps {
  return {
    marker: readMarker(list),
    position: styleOf(list, 'list-style-position'),
    start: isOrdered(list) ? (list.getAttribute('start') ?? '') : '',
  };
}

/**
 * Zapíše, co dostane. Co nedostane, nechá být.
 *
 * `Partial` schválně: dialog vrací jen svá pole a `undefined` musí znamenat
 * „nesahat", ne „vymazat". Prázdný řetězec naopak vymaže — tak se v dialogu
 * vybere „neurčeno".
 */
export function applyListProps(list: Element, props: Partial<ListProps>): void {
  if (props.marker !== undefined) {
    const value = asText(props.marker);
    const kind = MARKERS.find((m) => m.value === value);

    // Atribut první, ať je v uloženém HTML `<ol type="a" style="…">` a ne
    // naopak — pořadí atributů se řídí pořadím vložení a takhle se to čte líp.
    // Atribut jen tam, kde na ten druh je: u `none` a neznámé hodnoty by
    // `type` musel lhát, tak se raději smaže a zůstane samotný styl.
    setAttr(list, 'type', kind ? kind.attr : '');
    setStyle(list, 'list-style-type', value);
  }

  if (props.position !== undefined) {
    setStyle(list, 'list-style-position', asText(props.position));
  }

  if (props.start !== undefined) {
    // `start` na odrážkách nic neznamená a v uloženém HTML by jen překážel.
    setAttr(list, 'start', isOrdered(list) ? asText(props.start) : '');
  }
}

/**
 * Seznamy nad uzlem, od nejvyšší úrovně po tu, ve které uzel leží.
 *
 * Každá úroveň je vlastní element, takže se nastavuje nezávisle. Dialog z toho
 * dělá jednu skupinu polí na úroveň — proto pořadí odshora dolů, ať index
 * odpovídá tomu, co uživatel vidí.
 */
export function listChain(node: Node | null, root: Element): Element[] {
  const chain: Element[] = [];
  let cur: Node | null = node;

  while (cur && cur !== root) {
    if (cur.nodeType === NODE_ELEMENT && isList(cur)) chain.unshift(cur as Element);
    cur = cur.parentNode;
  }

  return chain;
}
