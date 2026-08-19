/**
 * Oblast = kus původního HTML a uzly, které z něj v DOMu vznikly.
 *
 * Dokud uzly vypadají stejně jako po načtení, vypíše se při ukládání původní
 * řetězec. Jakmile se změní, oblast se serializuje z DOMu. Rozhoduje se tedy
 * podle skutečného stavu, ne podle toho, jestli někdo zavolal `markDirty()` —
 * na to by se dřív nebo později zapomnělo.
 */

const NODE_ELEMENT = 1;

export interface Region {
  source: string;
  nodes: Node[];
  snapshot: string;
  /** Sanitizace do oblasti zasáhla — původní řetězec už vypsat nelze. */
  poisoned: boolean;
}

export function representation(nodes: readonly Node[]): string {
  let out = '';
  for (const n of nodes) {
    out += n.nodeType === NODE_ELEMENT ? (n as Element).outerHTML : (n.nodeValue ?? '');
  }
  return out;
}

/** Je oblast pořád v tom stavu, v jakém se načetla? */
export function isIntact(region: Region, parent: Node): boolean {
  if (region.poisoned || region.nodes.length === 0) return false;

  for (const n of region.nodes) {
    if (n.parentNode !== parent) return false;
  }

  // Uzly musí být pořád vedle sebe a ve stejném pořadí.
  for (let i = 1; i < region.nodes.length; i++) {
    if (region.nodes[i - 1]!.nextSibling !== region.nodes[i]) return false;
  }

  return representation(region.nodes) === region.snapshot;
}
