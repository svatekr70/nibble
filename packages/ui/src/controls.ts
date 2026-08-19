import {
  isColor, isGrid, isMenu, isSelect, type ControlSpec, type Editor,
} from '@nibble/core';
import { openColorPicker, toHex } from './ColorPicker.js';
import { openGridPicker } from './GridPicker.js';
import { openMenu } from './Menu.js';
import { iconSvg } from './icons.js';

/** Vyrobí ovládací prvek podle popisu z registru. Sdílí lišta i kontextová lišta. */
export function renderControl(name: string, spec: ControlSpec, editor: Editor): HTMLElement {
  const doc = editor.root.ownerDocument;

  if (isSelect(spec)) {
    const select = doc.createElement('select');
    select.className = 'nb-select';
    select.dataset.control = name;
    select.title = spec.tooltip;
    select.setAttribute('aria-label', spec.tooltip);
    select.tabIndex = -1;

    for (const option of spec.options) {
      const el = doc.createElement('option');
      el.value = option.value;
      el.textContent = option.text;
      select.appendChild(el);
    }

    select.addEventListener('change', () => spec.onAction(editor, select.value));
    return select;
  }

  if (isMenu(spec)) {
    const trigger = doc.createElement('button');
    trigger.type = 'button';
    trigger.className = 'nb-btn nb-btn-menu';
    trigger.dataset.control = name;
    trigger.title = spec.tooltip;
    trigger.setAttribute('aria-label', spec.tooltip);
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.tabIndex = -1;
    if (spec.width) trigger.style.width = spec.width + 'px';
    trigger.innerHTML = '<span class="nb-btn-value"></span><span class="nb-btn-caret">⌄</span>';

    trigger.addEventListener('mousedown', (e) => e.preventDefault());
    trigger.addEventListener('click', () => {
      if (trigger.getAttribute('aria-disabled') === 'true' || trigger.disabled) return;

      // Stejné pravidlo jako u dialogů a výběru barvy: nabídka bere fokus
      // a `editor.focus()` by výběr sbalil na kurzor.
      const mark = editor.selection.save();
      const same = spec.matches ?? ((a: string, b: string) =>
        normalizeValue(a) === normalizeValue(b));

      openMenu(trigger, {
        items: spec.items(editor),
        current: spec.value(editor),
        matches: same,
        onPick: (value) => {
          editor.focus();
          editor.selection.restore(mark);
          spec.onPick(editor, value);
        },
      });
    });

    return trigger;
  }

  if (isGrid(spec)) {
    const trigger = doc.createElement('button');
    trigger.type = 'button';
    trigger.className = 'nb-btn';
    trigger.dataset.control = name;
    trigger.title = spec.tooltip;
    trigger.setAttribute('aria-label', spec.tooltip);
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.tabIndex = -1;
    trigger.innerHTML = iconSvg(spec.icon);

    trigger.addEventListener('mousedown', (e) => e.preventDefault());
    trigger.addEventListener('click', () => {
      if (trigger.getAttribute('aria-disabled') === 'true' || trigger.disabled) return;

      const mark = editor.selection.save();
      const withSelection = (run: () => void): void => {
        editor.focus();
        editor.selection.restore(mark);
        run();
      };

      openGridPicker(trigger, {
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
    });

    return trigger;
  }

  if (isColor(spec)) {
    const trigger = doc.createElement('button');
    trigger.type = 'button';
    trigger.className = 'nb-btn nb-btn-color';
    trigger.dataset.control = name;
    trigger.title = spec.tooltip;
    trigger.setAttribute('aria-label', spec.tooltip);
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.tabIndex = -1;
    trigger.innerHTML = iconSvg(spec.icon) + '<span class="nb-btn-bar"></span>';

    // mousedown by popover otevřel a hned zase zavřel — kliknutí, které ho
    // otevírá, by spadlo do obsluhy „kliknuto mimo".
    trigger.addEventListener('mousedown', (e) => e.preventDefault());
    trigger.addEventListener('click', () => {
      if (trigger.getAttribute('aria-disabled') === 'true' || trigger.disabled) return;

      // Výběr se ukládá při otevření a obnovuje před spuštěním příkazu.
      // Popover přesune fokus a `editor.focus()` pak výběr sbalí na kurzor —
      // příkaz by dostal prázdný výběr a mlčky selhal. Totéž řeší `ui.dialog()`,
      // jen tudy se nechodí přes něj.
      const mark = editor.selection.save();
      const withSelection = (run: () => void): void => {
        editor.focus();
        editor.selection.restore(mark);
        run();
      };

      openColorPicker(trigger, {
        title: spec.tooltip,
        current: spec.value(editor),
        ...(spec.swatches ? { swatches: spec.swatches } : {}),
        onPick: (color) => withSelection(() => spec.onPick(editor, color)),
        onClear: () => withSelection(() => spec.onPick(editor, null)),
      });
    });

    return trigger;
  }

  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'nb-btn';
  button.dataset.control = name;
  button.innerHTML = iconSvg(spec.icon);
  button.title = spec.shortcut ? spec.tooltip + ' (' + spec.shortcut + ')' : spec.tooltip;
  button.setAttribute('aria-label', spec.tooltip);
  button.tabIndex = -1;

  const run = (): void => {
    if (button.getAttribute('aria-disabled') === 'true' || button.disabled) return;
    spec.onAction(editor);
  };

  // mousedown, ne click: kliknutí by nejdřív sebralo fokus a s ním i výběr.
  button.addEventListener('mousedown', (e) => { e.preventDefault(); run(); });
  button.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    run();
  });

  return button;
}

/** Uvozovky, mezery ani velikost písmen v zásobníku písma nerozhodují. */
function normalizeValue(value: string): string {
  return value.toLowerCase().replace(/["']/g, '').replace(/\s*,\s*/g, ',').trim();
}

/** Srovná stav prvku s tím, co je pod kurzorem. */
export function syncControl(el: HTMLElement, spec: ControlSpec, editor: Editor): void {
  const design = editor.mode === 'design';

  if (isSelect(spec)) {
    const select = el as HTMLSelectElement;
    select.disabled = !design;

    // Bez kurzoru v textu se drží poslední známá hodnota. Prázdné pole vypadá
    // jako rozbité, i když je technicky správně — a jakmile se do editoru
    // klikne, stejně naskočí ta správná.
    const value = spec.value(editor);
    if (value === null || value === '') return;

    select.value = Array.from(select.options).some((o) => o.value === value) ? value : '';
    return;
  }

  const button = el as HTMLButtonElement;
  // Nedostupný příkaz dostane aria-disabled, ne disabled: podle vzoru ARIA
  // toolbar musí zůstat dosažitelný šipkami.
  button.disabled = !design;
  const enabled = isGrid(spec) ? true : (spec.enabled?.(editor) ?? true);
  button.setAttribute('aria-disabled', String(!enabled));

  if (isGrid(spec)) return;

  if (isMenu(spec)) {
    const slot = button.querySelector<HTMLElement>('.nb-btn-value');
    if (!slot) return;

    const current = spec.value(editor);
    // Stejně jako u výběru: bez kurzoru se drží, co bylo naposledy vidět.
    if (current === null && slot.textContent && !slot.classList.contains('nb-btn-value-empty')) {
      return;
    }

    const same = spec.matches ?? ((a: string, b: string) =>
      normalizeValue(a) === normalizeValue(b));
    const match = current === null
      ? undefined
      : spec.items(editor).find((item) => same(item.value, current));

    slot.textContent = match?.label ?? current ?? spec.placeholder ?? '';
    slot.classList.toggle('nb-btn-value-empty', !current);
    // Náhled i na spouštěči: u písma je jméno bez ukázky k ničemu.
    slot.style.fontFamily = match?.style?.['font-family'] ?? '';
    return;
  }

  if (isColor(spec)) {
    // Proužek pod ikonou ukazuje barvu, která je pod kurzorem nastavená.
    const bar = button.querySelector<HTMLElement>('.nb-btn-bar');
    const value = spec.value(editor);
    if (bar) bar.style.background = toHex(value) ?? 'transparent';
    return;
  }

  if (spec.active) button.setAttribute('aria-pressed', String(spec.active(editor)));
}
