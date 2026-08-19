import type { Editor } from '../Editor.js';

/**
 * Barva písma a pozadí.
 *
 * V každém toolbaru cílového projektu je `forecolor backcolor` — a v uloženém obsahu je
 * `color` 432× a `background-color` 457×, vždy jako `<span style="…">`. Nibble
 * proto zapisuje přesně tenhle tvar: nový obsah bude vypadat stejně jako ten,
 * který tam už roky je.
 */

export const COLOR_PROPERTY = {
  forecolor: 'color',
  backcolor: 'background-color',
} as const;

export type ColorCommand = keyof typeof COLOR_PROPERTY;

function applyColor(editor: Editor, command: ColorCommand, color: string | null): boolean {
  const property = COLOR_PROPERTY[command];
  const range = editor.selection.getRange();
  if (!range) return false;

  if (range.collapsed) {
    // Bez výběru není co obarvit. Předepisovat barvu dalšímu znaku jako
    // u tučného písma nedává smysl — barvu si uživatel vybírá k něčemu.
    return false;
  }

  const next = color === null
    ? editor.formatter.removeStyle(range, property)
    : editor.formatter.applyStyle(range, property, color);

  editor.selection.setRange(next);
  editor.commit('color');
  return true;
}

export function registerColorCommands(editor: Editor): void {
  for (const name of Object.keys(COLOR_PROPERTY) as ColorCommand[]) {
    editor.commands.add(
      name,
      (ed, args) => applyColor(ed, name, typeof args === 'string' ? args : null),
      (ed) => {
        const range = ed.selection.getRange();
        return !!range && !range.collapsed;
      },
    );
  }
}

/** Barva pod kurzorem, nebo null. Řídí ukazatel na tlačítku. */
export function currentColor(editor: Editor, command: ColorCommand): string | null {
  const range = editor.selection.getRange();
  return range ? editor.formatter.queryStyle(range, COLOR_PROPERTY[command]) : null;
}
