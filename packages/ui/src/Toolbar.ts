import type { Editor } from '@nibble/core';
import { renderControl, syncControl } from './controls.js';

/**
 * Lišta podle vzoru ARIA `toolbar`: dovnitř se vstoupí jedním tabem a mezi
 * prvky se chodí šipkami. Prvky se berou z registru v jádře, takže plugin,
 * který si přihlásí tlačítko, se do lišty dostane bez dalšího zařizování.
 */
export class Toolbar {
  readonly element: HTMLElement;
  private readonly items: HTMLElement[] = [];
  private readonly teardown: Array<() => void> = [];

  constructor(
    private readonly editor: Editor,
    layout: readonly (readonly string[])[],
  ) {
    const doc = editor.root.ownerDocument;
    this.element = doc.createElement('div');
    this.element.className = 'nb-toolbar';
    this.element.setAttribute('role', 'toolbar');
    this.element.setAttribute('aria-label', 'Formátování');

    let first = true;
    layout.forEach((group) => {
      const controls = group
        .map((name) => ({ name, spec: editor.ui.get(name) }))
        .filter((entry) => entry.spec !== undefined);

      // Skupina, jejíž tlačítka nikdo nepřihlásil, nemá dostat oddělovač.
      if (controls.length === 0) return;

      // Skupina je vlastní obal, aby se lišta lámala po skupinách, ne po
      // jednotlivých tlačítkách. Jinak zbude na druhém řádku jedno osamocené.
      const box = doc.createElement('span');
      box.className = 'nb-group';

      if (!first) {
        const sep = doc.createElement('span');
        sep.className = 'nb-sep';
        sep.setAttribute('aria-hidden', 'true');
        box.appendChild(sep);
      }
      first = false;

      for (const { name, spec } of controls) {
        const el = renderControl(name, spec!, editor);
        el.tabIndex = this.items.length === 0 ? 0 : -1;
        this.items.push(el);
        box.appendChild(el);
      }

      this.element.appendChild(box);
    });

    this.element.addEventListener('keydown', this.onKeyDown);
    this.teardown.push(() => this.element.removeEventListener('keydown', this.onKeyDown));
    this.teardown.push(editor.on('selectionchange', () => this.sync()));
    this.teardown.push(editor.on('change', () => this.sync()));
    this.teardown.push(editor.on('modechange', () => this.sync()));

    this.sync();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    // Šipky uvnitř rozbaleného výběru patří výběru, ne liště.
    if ((event.target as HTMLElement).tagName === 'SELECT') return;

    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;

    event.preventDefault();
    const current = this.items.findIndex((b) => b.tabIndex === 0);
    const next = (current + step + this.items.length) % this.items.length;

    this.items[current]!.tabIndex = -1;
    this.items[next]!.tabIndex = 0;
    this.items[next]!.focus();
  };

  sync(): void {
    for (const item of this.items) {
      const spec = this.editor.ui.get(item.dataset.control!);
      if (spec) syncControl(item, spec, this.editor);
    }
  }

  destroy(): void {
    for (const fn of this.teardown) fn();
    this.element.remove();
  }
}
