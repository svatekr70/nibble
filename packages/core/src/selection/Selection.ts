import { bookmarkOf, rangeOf, type Bookmark } from './Bookmark.js';

export class EditorSelection {
  constructor(
    private readonly root: HTMLElement,
    private readonly doc: Document,
  ) {}

  private native(): Selection | null {
    return this.doc.defaultView?.getSelection() ?? null;
  }

  /** Rozsah výběru, pokud je uvnitř editoru. */
  getRange(): Range | null {
    const sel = this.native();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    return this.root.contains(range.commonAncestorContainer) ? range : null;
  }

  setRange(range: Range): void {
    const sel = this.native();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
  }

  collapseTo(node: Node, offset: number): void {
    const range = this.doc.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    this.setRange(range);
  }

  save(): Bookmark | null {
    const range = this.getRange();
    return range ? bookmarkOf(this.root, range) : null;
  }

  restore(mark: Bookmark | null): void {
    if (!mark) return;
    const range = rangeOf(this.root, mark, this.doc);
    if (range) this.setRange(range);
  }

  getText(): string {
    return this.getRange()?.toString() ?? '';
  }
}
