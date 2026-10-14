/**
 * Text bloku od jeho začátku po kurzor.
 *
 * Přes `Range.toString()`, ne `textContent` jednoho uzlu: odstavec bývá
 * rozdělený do více textových uzlů a značek a zkratka typu `# ` musí platit
 * pro celý začátek bloku, ne jen pro uzel, ve kterém kurzor zrovna stojí.
 */
export function textBeforeCaret(block: Element, range: Range): string {
  const doc = block.ownerDocument;
  const before = doc.createRange();
  before.setStart(block, 0);
  before.setEnd(range.startContainer, range.startOffset);
  return before.toString();
}
