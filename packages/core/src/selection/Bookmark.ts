/**
 * Poloha kurzoru jako cesta indexů od kořene.
 *
 * Odkaz na uzel by nestačil: undo obsah přeparsuje, takže původní uzly už
 * neexistují. Cesta indexů přežije, protože popisuje tvar dokumentu, ne jeho
 * konkrétní instanci.
 */

export interface Bookmark {
  start: number[];
  startOffset: number;
  end: number[];
  endOffset: number;
}

function pathTo(root: Node, node: Node): number[] {
  const path: number[] = [];
  let cur: Node | null = node;
  while (cur && cur !== root) {
    const parent: Node | null = cur.parentNode;
    if (!parent) return [];
    path.unshift(Array.prototype.indexOf.call(parent.childNodes, cur));
    cur = parent;
  }
  return path;
}

function nodeAt(root: Node, path: readonly number[]): Node {
  let cur: Node = root;
  for (const i of path) {
    const next = cur.childNodes[i];
    if (!next) return cur;
    cur = next;
  }
  return cur;
}

export function bookmarkOf(root: Node, range: Range): Bookmark {
  return {
    start: pathTo(root, range.startContainer),
    startOffset: range.startOffset,
    end: pathTo(root, range.endContainer),
    endOffset: range.endOffset,
  };
}

export function rangeOf(root: Node, mark: Bookmark, doc: Document): Range | null {
  const range = doc.createRange();
  const startNode = nodeAt(root, mark.start);
  const endNode = nodeAt(root, mark.end);
  const cap = (n: Node, o: number) =>
    Math.min(o, n.nodeType === 3 ? (n.nodeValue ?? '').length : n.childNodes.length);
  try {
    range.setStart(startNode, cap(startNode, mark.startOffset));
    range.setEnd(endNode, cap(endNode, mark.endOffset));
    return range;
  } catch {
    return null;
  }
}
