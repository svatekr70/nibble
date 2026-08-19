import type { Editor } from '@nibble/core';
import { renderControl, syncControl } from './controls.js';

/**
 * Plovoucí lišta u prvku pod kurzorem.
 *
 * Ukáže se jen tam, kde má co nabídnout — u odkazu nebo obrázku. Drží se
 * v `position: absolute` vůči obalu editoru, ne vůči oknu, aby při rolování
 * neutíkala a nemusel se hlídat scroll.
 */
export class ContextToolbar {
  readonly element: HTMLElement;
  private readonly teardown: Array<() => void> = [];
  private visible = false;

  constructor(private readonly editor: Editor, private readonly host: HTMLElement) {
    const doc = editor.root.ownerDocument;
    this.element = doc.createElement('div');
    this.element.className = 'nb-context';
    this.element.setAttribute('role', 'toolbar');
    this.element.setAttribute('aria-label', 'Nástroje prvku');
    this.element.hidden = true;
    host.appendChild(this.element);

    this.teardown.push(editor.on('selectionchange', () => this.sync()));
    this.teardown.push(editor.on('change', () => this.sync()));
    this.teardown.push(editor.on('blur', () => this.hide()));
  }

  sync(): void {
    const range = this.editor.selection.getRange();
    if (!range || this.editor.mode !== 'design') return this.hide();

    const node = range.startContainer;
    const matches = this.editor.ui.contextToolbarsFor(node, this.editor);
    const first = matches[0];
    if (!first) return this.hide();

    this.render(first.items);
    this.syncControls();
    this.position(first.target);
  }

  private render(items: readonly string[]): void {
    const key = items.join(' ');
    if (this.element.dataset.items === key && this.visible) return;

    this.element.dataset.items = key;
    this.element.replaceChildren();

    for (const name of items) {
      const spec = this.editor.ui.get(name);
      if (!spec) continue;

      const el = renderControl(name, spec, this.editor);
      el.tabIndex = this.element.childElementCount === 0 ? 0 : -1;
      this.element.appendChild(el);
    }
  }

  /**
   * Srovná stav tlačítek. Bez toho by plovoucí lišta nikdy neukázala, že je
   * příkaz nedostupný — třeba že první položku seznamu není kam zanořit.
   */
  private syncControls(): void {
    for (const el of Array.from(this.element.children) as HTMLElement[]) {
      const spec = this.editor.ui.get(el.dataset.control ?? '');
      if (spec) syncControl(el, spec, this.editor);
    }
  }

  private position(target: Element): void {
    const box = target.getBoundingClientRect();
    const base = this.host.getBoundingClientRect();

    this.element.hidden = false;
    this.visible = true;

    const width = this.element.offsetWidth;
    const left = Math.max(0, Math.min(
      box.left - base.left + box.width / 2 - width / 2,
      this.host.clientWidth - width,
    ));

    this.element.style.left = left + 'px';
    this.element.style.top = Math.max(0, box.top - base.top - this.element.offsetHeight - 6) + 'px';
  }

  hide(): void {
    if (!this.visible) return;
    this.element.hidden = true;
    this.visible = false;
  }

  destroy(): void {
    for (const fn of this.teardown) fn();
    this.element.remove();
  }
}
