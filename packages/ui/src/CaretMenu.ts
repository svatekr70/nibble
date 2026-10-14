import type { Editor, SuggestionItem, SuggestionSpec } from '@nibble/core';
import { closestBlock, fillIfEmpty, suggestionQuery, textBeforeCaret } from '@nibble/core';
import { iconSvg } from './icons.js';

/**
 * Nabídka u kurzoru.
 *
 * Na rozdíl od `Menu` si fokus nebere: uživatel píše dál do editoru a psaním
 * nabídku filtruje. Šipky, Enter, Tab a Escape se proto zachytávají na
 * kořeni editoru — a jen tehdy, když je nabídka otevřená.
 *
 * Třída je schválně `nb-caret-menu`, ne `nb-menu`: `openMenu` při otevření
 * maže všechny `.nb-menu` v dokumentu, a tahle nabídka visí v `<body>` po
 * celý život editoru. Vzhled sdílí přes CSS.
 */

interface Open {
  spec: SuggestionSpec;
  items: readonly SuggestionItem[];
  active: number;
  text: Text;
  /** Kde v textovém uzlu začíná spouštěč. */
  from: number;
}

export function bindCaretMenu(editor: Editor): () => void {
  const doc = editor.root.ownerDocument;
  const menu = doc.createElement('div');
  menu.className = 'nb-caret-menu';
  menu.setAttribute('role', 'listbox');
  menu.hidden = true;
  doc.body.appendChild(menu);

  let open: Open | null = null;
  /** Escape zavře nabídku pro tenhle spouštěč, dokud se neodmaže. */
  let dismissed: { text: Text; from: number } | null = null;

  const close = (): void => { open = null; menu.hidden = true; menu.replaceChildren(); };

  const render = (): void => {
    if (!open) return;
    menu.replaceChildren();
    open.items.forEach((item, index) => {
      const option = doc.createElement('button');
      option.type = 'button';
      option.className = 'nb-menu-item';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(index === open!.active));
      option.tabIndex = -1;
      option.dataset.value = item.id;
      if (item.icon) {
        const icon = doc.createElement('span');
        icon.className = 'nb-caret-menu-icon';
        icon.innerHTML = iconSvg(item.icon);
        option.appendChild(icon);
      }
      const label = doc.createElement('span');
      label.className = 'nb-menu-label';
      label.textContent = item.label;
      option.appendChild(label);
      // `mousedown`, ne `click`: kliknutí by editoru vzalo fokus i kurzor.
      option.addEventListener('mousedown', (e) => { e.preventDefault(); pick(index); });
      menu.appendChild(option);
    });
  };

  /**
   * Aktivní položka musí být vidět. Ručně přes `scrollTop`, ne
   * `scrollIntoView()`: to by odrolovalo i stránku pod editorem.
   */
  const reveal = (): void => {
    const active = open ? menu.children[open.active] as HTMLElement | undefined : undefined;
    if (!active) return;
    const top = active.offsetTop;
    const bottom = top + active.offsetHeight;
    if (top < menu.scrollTop) menu.scrollTop = top;
    else if (bottom > menu.scrollTop + menu.clientHeight) menu.scrollTop = bottom - menu.clientHeight;
  };

  // `.nb-menu` je `position: absolute` vůči stránce, proto se přičítá scroll.
  const position = (range: Range): void => {
    let rect = range.getBoundingClientRect();
    // Prázdný řádek nemá obdélník kurzoru — vezme se blok.
    if (rect.width === 0 && rect.height === 0) {
      const block = closestBlock(range.startContainer, editor.root);
      if (block) rect = block.getBoundingClientRect();
    }
    const win = doc.defaultView!;
    menu.style.left = Math.round(rect.left + win.scrollX) + 'px';
    menu.style.top = Math.round(rect.bottom + win.scrollY + 4) + 'px';
  };

  const sync = (): void => {
    if (editor.mode !== 'design' || editor.composing) return close();
    const range = editor.selection.getRange();
    if (!range || !range.collapsed || range.startContainer.nodeType !== 3) return close();

    const text = range.startContainer as Text;
    const block = closestBlock(text, editor.root);
    if (!block) return close();

    for (const spec of editor.ui.suggestions().values()) {
      const before = spec.startOfBlock
        ? textBeforeCaret(block, range)
        : text.data.slice(0, range.startOffset);
      const query = suggestionQuery(before, spec.trigger, spec.startOfBlock ?? false);
      if (query === null) continue;

      const from = range.startOffset - query.length - spec.trigger.length;
      if (from < 0) continue;
      if (dismissed && dismissed.text === text && dismissed.from === from) return close();

      const items = spec.items(editor, query);
      if (items.length === 0) return close();

      const sameAnchor = open && open.text === text && open.from === from;
      open = { spec, items, active: sameAnchor ? Math.min(open!.active, items.length - 1) : 0, text, from };
      menu.hidden = false;
      render();
      position(range);
      reveal();
      return;
    }
    dismissed = null;
    close();
  };

  const pick = (index: number): void => {
    if (!open) return;
    const { spec, text, from } = open;
    const item = open.items[index];
    close();
    if (!item) return;

    const range = editor.selection.getRange();
    if (!range) return;

    // Smazat `/dotaz`. U příkazu bez dialogu se smazání nezapisuje zvlášť:
    // zapíše ho až příkaz a Ctrl+Z pak vrátí rovnou `/dotaz`.
    const remove = doc.createRange();
    remove.setStart(text, from);
    remove.setEnd(range.startContainer, range.startOffset);
    remove.deleteContents();
    const block = closestBlock(text, editor.root);
    if (block) {
      fillIfEmpty(block, doc);
      if (text.parentNode) editor.selection.collapseTo(text, from);
      else editor.selection.collapseTo(block, 0);
    }

    if (spec.opensDialog?.(item)) editor.commit('slash');
    spec.onPick(editor, item);
  };

  const onKeyDown = (event: Event): void => {
    if (!open) return;
    const e = event as KeyboardEvent;
    if (e.isComposing) return;
    const count = open.items.length;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopImmediatePropagation();
      open.active = (open.active + (e.key === 'ArrowDown' ? 1 : count - 1)) % count;
      render();
      reveal();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      e.stopImmediatePropagation();
      pick(open.active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      dismissed = { text: open.text, from: open.from };
      close();
    }
  };

  const onFocusOut = (): void => close();

  // Až po zpracování úhozu jádrem: `input` přijde uprostřed příkazu, kdy je
  // výběr ještě v pohybu.
  const offInput = editor.on('input', () => queueMicrotask(sync));
  const offChange = editor.on('change', () => queueMicrotask(sync));
  const offSelection = editor.on('selectionchange', () => { if (open) sync(); });

  // Capture: nabídka musí Enter dostat dřív než pluginy a jádro.
  editor.root.addEventListener('keydown', onKeyDown, true);
  editor.root.addEventListener('focusout', onFocusOut);

  return () => {
    offInput(); offChange(); offSelection();
    editor.root.removeEventListener('keydown', onKeyDown, true);
    editor.root.removeEventListener('focusout', onFocusOut);
    menu.remove();
  };
}
