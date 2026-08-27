import type { Editor } from '@nibble/core';
import { renderControl, syncControl } from './controls.js';
import { iconSvg } from './icons.js';

/**
 * Lišta podle vzoru ARIA `toolbar`: dovnitř se vstoupí jedním tabem a mezi
 * prvky se chodí šipkami. Prvky se berou z registru v jádře, takže plugin,
 * který si přihlásí tlačítko, se do lišty dostane bez dalšího zařizování.
 *
 * Co se na šířku nevejde, jde pod trojtečku vpravo. Dřív se lišta lámala do
 * dalších řádků a při větším počtu tlačítek zabrala klidně čtyři — z editoru
 * pak zbyl proužek. Řádky jsou proto nejvýš dva, a to jsou ty dva, které si
 * uživatel sám nastavil.
 *
 * Přetečené skupiny se do panelu **přesouvají**, neklonují. Klon by měl vlastní
 * stav a vlastní posluchače, takže by tlačítko v panelu ukazovalo něco jiného
 * než totéž tlačítko v liště.
 */
export class Toolbar {
  readonly element: HTMLElement;
  private readonly items: HTMLElement[] = [];
  private readonly groups: HTMLElement[] = [];
  private readonly teardown: Array<() => void> = [];

  private readonly overflow: HTMLButtonElement;
  private readonly panel: HTMLElement;
  private observer: ResizeObserver | null = null;
  private open = false;
  /** Šířka, na kterou je lišta přerovnaná. Brání kolotoči s pozorovatelem. */
  private lastWidth = -1;
  private reflowing = false;

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

      // Skupina je vlastní obal, aby se do trojtečky odcházelo po skupinách,
      // ne po jednotlivých tlačítkách. Jinak by v liště zbylo osamocené
      // tlačítko bez těch, se kterými patří k sobě.
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

      this.groups.push(box);
      this.element.appendChild(box);
    });

    this.overflow = doc.createElement('button');
    this.overflow.type = 'button';
    this.overflow.className = 'nb-btn nb-overflow';
    this.overflow.hidden = true;
    this.overflow.title = 'Další nástroje';
    this.overflow.setAttribute('aria-label', 'Další nástroje');
    this.overflow.setAttribute('aria-expanded', 'false');
    this.overflow.innerHTML = iconSvg('more');
    this.element.appendChild(this.overflow);

    this.panel = doc.createElement('div');
    this.panel.className = 'nb-overflow-panel';
    this.panel.hidden = true;
    this.element.appendChild(this.panel);

    this.overflow.addEventListener('mousedown', (e) => e.preventDefault());
    this.overflow.addEventListener('click', () => this.toggle());

    // Použití čehokoli z panelu ho zavře — je to nabídka, ne druhá lišta.
    this.panel.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('.nb-btn, .nb-select, .nb-color')) {
        this.close();
      }
    });
    this.panel.addEventListener('change', () => this.close());

    const onOutside = (event: Event): void => {
      const target = event.target as Node;
      if (!this.element.contains(target)) this.close();
    };
    doc.addEventListener('mousedown', onOutside);
    this.teardown.push(() => doc.removeEventListener('mousedown', onOutside));

    // Escape se poslouchá na dokumentu, ne na liště. Tlačítka ruší `mousedown`,
    // aby kliknutím nezmizel výběr v obsahu — a s ním nedostávají fokus, takže
    // by se stisk k liště nedostal.
    const onEscape = (event: Event): void => {
      if (!this.open || (event as KeyboardEvent).key !== 'Escape') return;
      const active = doc.activeElement;
      this.close();
      if (active && this.panel.contains(active)) this.overflow.focus();
    };
    doc.addEventListener('keydown', onEscape);
    this.teardown.push(() => doc.removeEventListener('keydown', onEscape));

    this.element.addEventListener('keydown', this.onKeyDown);
    this.teardown.push(() => this.element.removeEventListener('keydown', this.onKeyDown));
    this.teardown.push(editor.on('selectionchange', () => this.sync()));
    this.teardown.push(editor.on('change', () => this.sync()));
    this.teardown.push(editor.on('modechange', () => this.sync()));

    this.watchWidth();
    this.sync();
  }

  /**
   * Přerovná lištu podle toho, co se na šířku vejde.
   *
   * Měří se v jednom průchodu: nejdřív jde všechno zpátky do lišty, změří se
   * šířky skupin a pak se odzadu odebírá, dokud se zbytek nevejde. Odebírat
   * po jedné s měřením po každém kroku by znamenalo tolik reflow, kolik je
   * skupin — a to při tažení za okraj okna znát je.
   */
  reflow(): void {
    if (this.groups.length === 0 || this.reflowing) return;

    // Bez rozměru se měřit nedá — lišta ještě není v dokumentu nebo je skrytá.
    if (this.element.clientWidth === 0) return;

    this.reflowing = true;
    try {
      this.measure();
    } finally {
      this.reflowing = false;
    }
  }

  private measure(): void {
    this.lastWidth = this.element.clientWidth;

    for (const group of this.groups) {
      if (group.parentElement !== this.element) this.element.insertBefore(group, this.overflow);
    }
    this.overflow.hidden = true;

    const style = this.element.ownerDocument.defaultView?.getComputedStyle(this.element);
    const gap = parseFloat(style?.gap ?? '0') || 0;
    const padding = (parseFloat(style?.paddingLeft ?? '0') || 0)
      + (parseFloat(style?.paddingRight ?? '0') || 0);

    const widths = this.groups.map((g) => g.offsetWidth + gap);
    const total = widths.reduce((sum, w) => sum + w, 0);
    const available = this.element.clientWidth - padding;

    if (total <= available) {
      this.close();
      return;
    }

    // Trojtečka sama zabírá místo, takže se do rozpočtu musí započítat.
    this.overflow.hidden = false;
    const budget = available - this.overflow.offsetWidth - gap;

    let used = total;
    for (let i = this.groups.length - 1; i >= 0 && used > budget; i -= 1) {
      this.panel.appendChild(this.groups[i]!);
      used -= widths[i]!;
    }

    // Do panelu se přesouvalo odzadu, takže je v obráceném pořadí.
    const moved = Array.from(this.panel.children).reverse();
    for (const group of moved) this.panel.appendChild(group);
  }

  private watchWidth(): void {
    const view = this.element.ownerDocument.defaultView;
    if (!view?.ResizeObserver) {
      // Bez `ResizeObserver` se přerovná aspoň jednou — lepší než nikdy.
      view?.setTimeout(() => this.reflow(), 0);
      return;
    }

    // Jen na změnu šířky. `reflow` mění obsah lišty, takže by se pozorovatel
    // spustil vlastním zásahem znovu a dokola — a prohlížeč by v tom uvízl.
    this.observer = new view.ResizeObserver(() => {
      if (this.element.clientWidth === this.lastWidth) return;
      this.reflow();
    });
    this.observer.observe(this.element);
    this.teardown.push(() => { this.observer?.disconnect(); this.observer = null; });
  }

  private toggle(): void {
    if (this.open) this.close();
    else {
      this.open = true;
      this.panel.hidden = false;
      this.overflow.setAttribute('aria-expanded', 'true');
    }
  }

  private close(): void {
    if (!this.open) return;
    this.open = false;
    this.panel.hidden = true;
    this.overflow.setAttribute('aria-expanded', 'false');
  }

  /** Prvky, po kterých se dá chodit šipkami — schované se přeskakují. */
  private reachable(): HTMLElement[] {
    return this.items.filter((el) => this.open || !this.panel.contains(el));
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    // Šipky uvnitř rozbaleného výběru patří výběru, ne liště.
    if ((event.target as HTMLElement).tagName === 'SELECT') return;

    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;

    const reachable = this.reachable();
    if (reachable.length === 0) return;

    event.preventDefault();
    const current = reachable.findIndex((b) => b.tabIndex === 0);
    const next = (Math.max(current, 0) + step + reachable.length) % reachable.length;

    for (const el of this.items) el.tabIndex = -1;
    reachable[next]!.tabIndex = 0;
    reachable[next]!.focus();
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
