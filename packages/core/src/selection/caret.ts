import type { Editor } from '../Editor.js';

/**
 * Poloha kurzoru jako odkaz na uzel.
 *
 * Operace, které mění strukturu — srovnání seznamu, obalení citací, srovnání
 * tabulky — uzly přesouvají. Přesun podle specifikace posune i živé rozsahy:
 * jakmile se `<ul>` nebo `<blockquote>` přendá jinam, kurzor uvnitř něj
 * vyskočí na rodiče a příkaz pak nenajde, na čem měl pracovat.
 *
 * Cesta indexů z `Bookmark` na to nestačí, protože po přeskládání ukazuje
 * jinam. Odkaz na textový uzel přesun přežije — text se stěhuje i s obsahem.
 *
 * Pravidlo je vždycky stejné: **zachyť před zásahem, obnov po něm.**
 */
export interface CaretRef {
  node: Node;
  offset: number;
}

export function captureCaret(editor: Editor): CaretRef | null {
  const range = editor.selection.getRange();
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

export function restoreCaret(editor: Editor, ref: CaretRef | null): void {
  if (!ref || !editor.root.contains(ref.node)) return;

  const limit = ref.node.nodeType === 3
    ? (ref.node.nodeValue ?? '').length
    : ref.node.childNodes.length;

  editor.selection.collapseTo(ref.node, Math.min(ref.offset, limit));
}

/**
 * Provede zásah do struktury a přitom uhlídá kurzor.
 *
 * Vrátí čerstvý rozsah po obnovení — ten původní je po přeskládání k ničemu.
 */
export function withCaret(editor: Editor, change: () => void): Range | null {
  const ref = captureCaret(editor);
  change();
  restoreCaret(editor, ref);
  return editor.selection.getRange();
}
