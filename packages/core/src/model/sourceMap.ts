/**
 * Převod mezi pozicí v obsahu a pozicí ve zdrojovém kódu.
 *
 * Kdo si otevře zdroj, chce pokračovat tam, kde byl — ne hledat v pěti
 * kilobajtech HTML odstavec, na kterém stál. Značky se do dokumentu vkládat
 * nedají (rozbily by záruku, že se nedotčený obsah neuloží jinak), takže se
 * počítá: kolik **viditelných znaků textu** je před kurzorem, a kde v HTML
 * řetězci je stejné místo.
 *
 * Text se počítá po znacích, ne po bajtech: `&iacute;` je v HTML osm znaků,
 * ale pro čtenáře jedno písmeno. Bez toho by se pozice v dokumentu s českou
 * diakritikou rozjela o desítky znaků.
 */

const NODE_TEXT = 3;
const NODE_ELEMENT = 1;

/** Prvky, jejichž obsah se nepočítá jako text. */
const NON_TEXT = new Set(['script', 'style']);

/** Kolik znaků textu je v kořeni před danou pozicí. */
export function textOffsetOf(root: Node, node: Node, offset: number): number {
  let count = 0;
  let found = false;

  const walk = (current: Node): void => {
    if (found) return;

    if (current === node && current.nodeType === NODE_TEXT) {
      count += Math.min(offset, (current.nodeValue ?? '').length);
      found = true;
      return;
    }

    if (current.nodeType === NODE_TEXT) {
      count += (current.nodeValue ?? '').length;
      return;
    }

    if (current.nodeType !== NODE_ELEMENT) return;
    if (NON_TEXT.has((current as Element).tagName.toLowerCase())) return;

    const children = Array.from(current.childNodes);

    // Kurzor mezi uzly: sečti, co je před ním, a skonči.
    if (current === node) {
      for (let i = 0; i < Math.min(offset, children.length); i++) walk(children[i]!);
      found = true;
      return;
    }

    for (const child of children) {
      walk(child);
      if (found) return;
    }
  };

  walk(root);
  return count;
}

/** Přeskočí značku od `<` a vrátí index za ní. */
function skipTag(html: string, from: number): number {
  if (html.startsWith('<!--', from)) {
    const end = html.indexOf('-->', from + 4);
    return end < 0 ? html.length : end + 3;
  }

  let quote = '';
  for (let i = from + 1; i < html.length; i++) {
    const ch = html[i]!;
    if (quote) { if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '>') return i + 1;
  }
  return html.length;
}

/** Délka entity začínající na `&`, nebo 0. */
function entityLength(html: string, at: number): number {
  const end = html.indexOf(';', at);
  if (end < 0 || end - at > 12) return 0;
  return /^&#?[a-zA-Z0-9]+;$/.test(html.slice(at, end + 1)) ? end + 1 - at : 0;
}

/** Index v HTML řetězci, kde je před ním právě `target` znaků textu. */
export function htmlIndexForTextOffset(html: string, target: number): number {
  if (target <= 0) return 0;

  let seen = 0;
  let i = 0;

  while (i < html.length) {
    const ch = html[i]!;

    if (ch === '<') { i = skipTag(html, i); continue; }

    if (ch === '&') {
      const length = entityLength(html, i);
      if (length > 0) {
        seen++;
        if (seen >= target) return i + length;
        i += length;
        continue;
      }
    }

    seen++;
    if (seen >= target) return i + 1;
    i++;
  }

  return html.length;
}

/** Kolik znaků textu je v HTML řetězci před daným indexem. */
export function textOffsetForHtmlIndex(html: string, index: number): number {
  let seen = 0;
  let i = 0;

  while (i < html.length && i < index) {
    const ch = html[i]!;

    if (ch === '<') {
      const next = skipTag(html, i);
      // Kurzor uvnitř značky patří na její začátek.
      if (next > index) return seen;
      i = next;
      continue;
    }

    if (ch === '&') {
      const length = entityLength(html, i);
      if (length > 0) { seen++; i += length; continue; }
    }

    seen++;
    i++;
  }

  return seen;
}

/** Umístí pozici danou počtem znaků textu zpátky do dokumentu. */
export function positionAtTextOffset(
  root: Node, target: number,
): { node: Node; offset: number } | null {
  let remaining = target;
  let result: { node: Node; offset: number } | null = null;

  const walk = (current: Node): void => {
    if (result) return;

    if (current.nodeType === NODE_TEXT) {
      const length = (current.nodeValue ?? '').length;
      if (remaining <= length) {
        result = { node: current, offset: remaining };
        return;
      }
      remaining -= length;
      return;
    }

    if (current.nodeType !== NODE_ELEMENT) return;
    if (NON_TEXT.has((current as Element).tagName.toLowerCase())) return;

    for (const child of Array.from(current.childNodes)) {
      walk(child);
      if (result) return;
    }
  };

  walk(root);
  return result;
}
