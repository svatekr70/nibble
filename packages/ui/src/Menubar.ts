import {
  isColor, isGrid, isMenu, isSelect,
  type ButtonSpec, type ControlSpec, type Editor,
} from '@nibble/core';
import { openColorPicker } from './ColorPicker.js';
import { openGridPicker } from './GridPicker.js';
import { openMenu } from './Menu.js';
import { iconSvg } from './icons.js';

/**
 * Nabídkový pruh.
 *
 * Ve fázi F0 jsem ho odložil s tím, že desktopovou metaforu v CMS nikdo
 * nepoužívá. To byl omyl založený na dojmu, ne na datech: u dlouhé šablony je
 * lišta se čtyřiadvaceti tlačítky horší než pojmenované nabídky, ve kterých
 * se dá hledat podle toho, co člověk chce udělat.
 *
 * Položky **odkazují na registrované prvky jménem**. Nabídka tak nezná příkazy
 * ani jejich dostupnost — jen říká, co kde má být. Prvek, který nikdo
 * nezaregistroval (protože se nenačetl jeho plugin), se přeskočí i s případným
 * oddělovačem, takže nabídka nikdy nenabízí něco, co neexistuje.
 */

export interface MenuNode {
  /** Jméno registrovaného prvku. */
  control?: string;
  /** Popisek; bez něj se vezme z prvku. */
  label?: string;
  /** Podnabídka. */
  items?: readonly MenuNode[];
  /** Oddělovač nad položkou. */
  separator?: boolean;
}

export interface MenubarMenu {
  label: string;
  items: readonly MenuNode[];
}

const S = (separator = true) => ({ separator });

/** Výchozí rozvržení. Odkazuje na prvky, které nemusí existovat — pak vypadnou. */
export const DEFAULT_MENUBAR: readonly MenubarMenu[] = [
  {
    label: 'Úpravy',
    items: [
      { control: 'undo' }, { control: 'redo' },
      { ...S(), control: 'cut' }, { control: 'copy' },
      { control: 'paste' }, { control: 'pastetext' },
      { ...S(), control: 'selectall' },
      { control: 'searchreplace' },
    ],
  },
  {
    label: 'Zobrazit',
    items: [
      { control: 'fullscreen' },
      { control: 'code' },
    ],
  },
  {
    label: 'Vložit',
    items: [
      { control: 'link' }, { control: 'image' }, { control: 'media' },
      { ...S(), control: 'table' }, { control: 'hr' },
      { ...S(), control: 'emoji' }, { control: 'charmap' },
    ],
  },
  {
    label: 'Formát',
    items: [
      { control: 'bold' }, { control: 'italic' },
      { control: 'underline' }, { control: 'strike' },
      { control: 'superscript' }, { control: 'subscript' },
      { control: 'inlinecode' },
      {
        ...S(),
        label: 'Blok',
        items: [
          { control: 'blocks' },
          { ...S(), control: 'blockquote' },
        ],
      },
      { label: 'Typ písma', items: [{ control: 'fontfamily' }] },
      { label: 'Velikost písma', items: [{ control: 'fontsize' }] },
      { label: 'Výška řádku', items: [{ control: 'lineheight' }] },
      {
        label: 'Zarovnání',
        items: [
          { control: 'alignleft' }, { control: 'aligncenter' },
          { control: 'alignright' }, { control: 'alignjustify' },
        ],
      },
      { ...S(), control: 'forecolor' }, { control: 'backcolor' },
      { ...S(), control: 'removeformat' },
    ],
  },
  {
    label: 'Tabulka',
    items: [
      { control: 'table', label: 'Vložit tabulku' },
      {
        ...S(),
        label: 'Řádek',
        items: [
          { control: 'tablerowbefore' }, { control: 'tablerowafter' },
          { ...S(), control: 'tabledeleterow' },
          { ...S(), control: 'rowprops' },
        ],
      },
      {
        label: 'Sloupec',
        items: [
          { control: 'tablecolbefore' }, { control: 'tablecolafter' },
          { ...S(), control: 'tabledeletecol' },
        ],
      },
      {
        label: 'Buňka',
        items: [
          { control: 'tablemergeright' }, { control: 'tablemergedown' },
          { control: 'tablesplitcell' },
        ],
      },
      { ...S(), control: 'tableheader' },
      { control: 'tableprops' },
      { control: 'tabledelete' },
    ],
  },
  {
    label: 'Nástroje',
    items: [
      { control: 'code' }, { control: 'searchreplace' },
      { ...S(), control: 'bullist' }, { control: 'numlist' },
      { control: 'outdent' }, { control: 'indent' },
    ],
  },
];

interface PanelHandle {
  element: HTMLElement;
  close: () => void;
}

/** Popisek prvku pro nabídku — vlastní přebíjí ten z registru. */
function labelOf(node: MenuNode, spec: ControlSpec | undefined): string {
  if (node.label) return node.label;
  if (!spec) return node.control ?? '';
  return spec.tooltip;
}

/** Ikonu má tlačítko a výběr barvy; výběr ze seznamu ani nabídka ne. */
function iconOf(spec: ControlSpec | undefined): string {
  if (!spec || isMenu(spec) || isSelect(spec)) return '';
  return spec.icon;
}

/** Prvek, který otevírá vlastní výběr místo aby rovnou něco udělal. */
function opensPicker(spec: ControlSpec): boolean {
  return isColor(spec) || isMenu(spec) || isSelect(spec) || isGrid(spec);
}

/** Prvek, který se dá rovnou spustit — na rozdíl od těch, co chtějí další volbu. */
function isPlainButton(spec: ControlSpec): spec is ButtonSpec {
  return !opensPicker(spec);
}

/** Má položka na co odkazovat? Prvek bez registrace se do nabídky nedostane. */
function resolvable(node: MenuNode, editor: Editor): boolean {
  if (node.items) return node.items.some((child) => resolvable(child, editor));
  return node.control !== undefined && editor.ui.get(node.control) !== undefined;
}

export class Menubar {
  readonly element: HTMLElement;
  private readonly teardown: Array<() => void> = [];
  private readonly triggers: HTMLButtonElement[] = [];
  private open: PanelHandle | null = null;
  private openIndex = -1;
  /**
   * Výběr v okamžiku otevření nabídky.
   *
   * Zachytit ho až při spuštění příkazu je pozdě — to už ho panel přetáhl.
   * Ukládá se proto při rozbalení a obnovuje těsně před akcí.
   */
  private savedSelection: ReturnType<Editor['selection']['save']> = null;

  constructor(
    private readonly editor: Editor,
    menus: readonly MenubarMenu[] = DEFAULT_MENUBAR,
  ) {
    const doc = editor.root.ownerDocument;

    this.element = doc.createElement('div');
    this.element.className = 'nb-menubar';
    this.element.setAttribute('role', 'menubar');
    this.element.setAttribute('aria-label', 'Nabídka');

    menus.forEach((menu, index) => {
      const usable = menu.items.filter((item) => resolvable(item, editor));
      if (usable.length === 0) return;

      const trigger = doc.createElement('button');
      trigger.type = 'button';
      trigger.className = 'nb-menubar-item';
      trigger.textContent = menu.label;
      trigger.setAttribute('role', 'menuitem');
      trigger.setAttribute('aria-haspopup', 'true');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.tabIndex = this.triggers.length === 0 ? 0 : -1;

      trigger.addEventListener('mousedown', (e) => e.preventDefault());
      trigger.addEventListener('click', () => this.toggle(index, trigger, usable));

      // Když je jedna nabídka otevřená, přejezd myší přepne na sousední —
      // tak se nabídkový pruh chová všude a lidé to čekají.
      trigger.addEventListener('mouseenter', () => {
        if (this.open && this.openIndex !== index) this.toggle(index, trigger, usable);
      });

      this.triggers.push(trigger);
      this.element.appendChild(trigger);
    });

    this.element.addEventListener('keydown', this.onKeyDown);
    this.teardown.push(() => this.element.removeEventListener('keydown', this.onKeyDown));
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;

    event.preventDefault();
    const current = this.triggers.findIndex((t) => t.tabIndex === 0);
    const next = (current + step + this.triggers.length) % this.triggers.length;

    this.triggers[current]!.tabIndex = -1;
    this.triggers[next]!.tabIndex = 0;
    this.triggers[next]!.focus();
  };

  private toggle(index: number, trigger: HTMLButtonElement, items: readonly MenuNode[]): void {
    const wasOpen = this.openIndex === index;
    this.closePanel();
    if (wasOpen) return;

    this.savedSelection = this.editor.selection.save();
    this.openIndex = index;
    trigger.setAttribute('aria-expanded', 'true');
    this.open = this.buildPanel(items, trigger, false);
  }

  private closePanel(): void {
    this.open?.close();
    this.open = null;
    for (const trigger of this.triggers) trigger.setAttribute('aria-expanded', 'false');
    this.openIndex = -1;
  }

  /** Vykreslí jeden panel nabídky. Podnabídky se otevírají vedle. */
  private buildPanel(
    items: readonly MenuNode[], anchor: HTMLElement, toSide: boolean,
  ): PanelHandle {
    const doc = this.editor.root.ownerDocument;

    const panel = doc.createElement('div');
    panel.className = 'nb-panel';
    panel.setAttribute('role', 'menu');

    let child: PanelHandle | null = null;
    const closeChild = (): void => { child?.close(); child = null; };

    for (const node of items) {
      if (!resolvable(node, this.editor)) continue;

      if (node.separator && panel.childElementCount > 0) {
        const line = doc.createElement('div');
        line.className = 'nb-panel-sep';
        line.setAttribute('aria-hidden', 'true');
        panel.appendChild(line);
      }

      const spec = node.control ? this.editor.ui.get(node.control) : undefined;
      const row = doc.createElement('button');
      row.type = 'button';
      row.className = 'nb-panel-item';
      row.setAttribute('role', 'menuitem');
      row.tabIndex = -1;
      if (node.control) row.dataset.control = node.control;

      // Bez tohohle by kliknutí nejdřív přeneslo fokus a `editor.focus()`
      // v příkazu by pak výběr sbalil na kurzor — položka by mlčky nic
      // neudělala. Stejné pravidlo jako u lišty, dialogů a výběru barvy.
      row.addEventListener('mousedown', (e) => e.preventDefault());

      const icon = doc.createElement('span');
      icon.className = 'nb-panel-icon';
      icon.innerHTML = iconOf(spec) ? iconSvg(iconOf(spec)) : '';

      const label = doc.createElement('span');
      label.className = 'nb-panel-label';
      label.textContent = labelOf(node, spec);

      const hint = doc.createElement('span');
      hint.className = 'nb-panel-hint';

      if (node.items) {
        hint.textContent = '›';
        row.setAttribute('aria-haspopup', 'true');
        row.addEventListener('mouseenter', () => {
          closeChild();
          child = this.buildPanel(node.items!, row, true);
        });
        row.addEventListener('click', () => {
          closeChild();
          child = this.buildPanel(node.items!, row, true);
        });
      } else {
        if (spec && isPlainButton(spec) && spec.shortcut) hint.textContent = spec.shortcut;
        row.addEventListener('mouseenter', closeChild);
        row.addEventListener('click', () => this.run(spec, row));
      }

      row.append(icon, label, hint);
      panel.appendChild(row);
    }

    doc.body.appendChild(panel);
    place(panel, anchor, toSide);

    this.sync(panel);

    return {
      element: panel,
      close() { closeChild(); panel.remove(); },
    };
  }

  /**
   * Spustí příkaz z nabídky.
   *
   * Prvky, které samy potřebují další volbu — barva, písmo, velikost —
   * se z nabídky otevřou stejně jako z lišty. Nabídka je jen další cesta
   * ke stejnému ovládání, ne jeho druhá implementace.
   */
  private run(spec: ControlSpec | undefined, row: HTMLElement): void {
    if (!spec) return;
    if (row.getAttribute('aria-disabled') === 'true') return;

    const editor = this.editor;
    editor.focus();
    editor.selection.restore(this.savedSelection);

    if (isGrid(spec)) {
      const mark = editor.selection.save();
      const withSelection = (run: () => void): void => {
        editor.focus(); editor.selection.restore(mark); run(); this.closePanel();
      };

      openGridPicker(row, {
        ...(spec.maxRows ? { maxRows: spec.maxRows } : {}),
        ...(spec.maxCols ? { maxCols: spec.maxCols } : {}),
        ...(spec.more ? {
          more: {
            label: spec.more.label,
            onAction: () => withSelection(() => spec.more!.onAction(editor)),
          },
        } : {}),
        onPick: (rows, cols) => withSelection(() => spec.onPick(editor, rows, cols)),
      });
      return;
    }

    if (isColor(spec)) {
      const mark = editor.selection.save();
      openColorPicker(row, {
        title: spec.tooltip,
        current: spec.value(editor),
        ...(spec.swatches ? { swatches: spec.swatches } : {}),
        onPick: (color) => {
          editor.focus(); editor.selection.restore(mark); spec.onPick(editor, color);
          this.closePanel();
        },
        onClear: () => {
          editor.focus(); editor.selection.restore(mark); spec.onPick(editor, null);
          this.closePanel();
        },
      });
      return;
    }

    if (isMenu(spec)) {
      const mark = editor.selection.save();
      openMenu(row, {
        items: spec.items(editor),
        current: spec.value(editor),
        ...(spec.matches ? { matches: spec.matches } : {}),
        onPick: (value) => {
          editor.focus(); editor.selection.restore(mark); spec.onPick(editor, value);
          this.closePanel();
        },
      });
      return;
    }

    if (isSelect(spec)) {
      // Výběr ze seznamu (druh bloku) se v nabídce chová jako rozbalovací
      // nabídka — jinak by se z ní nedal použít vůbec.
      const mark = editor.selection.save();
      openMenu(row, {
        items: spec.options.map((o) => ({ value: o.value, label: o.text })),
        current: spec.value(editor),
        onPick: (value) => {
          editor.focus(); editor.selection.restore(mark); spec.onAction(editor, value);
          this.closePanel();
        },
      });
      return;
    }

    if (isPlainButton(spec)) spec.onAction(editor);
    this.closePanel();
  }

  /** Nedostupné položky zšednou, ať je vidět, co teď nejde. */
  private sync(panel: HTMLElement): void {
    for (const row of Array.from(panel.querySelectorAll<HTMLElement>('[data-control]'))) {
      const spec = this.editor.ui.get(row.dataset.control!);
      if (!spec || !isPlainButton(spec)) continue;

      const enabled = this.editor.mode === 'design' && (spec.enabled?.(this.editor) ?? true);
      row.setAttribute('aria-disabled', String(!enabled));

      if (isPlainButton(spec) && spec.active) {
        row.setAttribute('aria-checked', String(spec.active(this.editor)));
      }
    }
  }

  /** Zavře otevřenou nabídku — používá `attachToolbar` při kliknutí jinam. */
  close(): void { this.closePanel(); }

  destroy(): void {
    this.closePanel();
    for (const fn of this.teardown) fn();
    this.element.remove();
  }
}

function place(panel: HTMLElement, anchor: HTMLElement, toSide: boolean): void {
  const box = anchor.getBoundingClientRect();
  const width = panel.offsetWidth;
  const height = panel.offsetHeight;

  const left = toSide
    ? (box.right + width > window.innerWidth ? box.left - width : box.right)
    : box.left;
  const top = toSide
    ? Math.min(box.top, window.innerHeight - height - 8)
    : box.bottom;

  panel.style.left = window.scrollX + Math.max(8, left) + 'px';
  panel.style.top = window.scrollY + Math.max(8, top) + 'px';
}
