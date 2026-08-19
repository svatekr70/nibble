import type { Editor } from '../Editor.js';
import { closestListItem } from '../dom/lists.js';
import { currentColor } from '../commands/colors.js';
import { closestQuote, currentLineHeight } from '../commands/blocks.js';
import type { UIRegistry } from './Registry.js';

/**
 * Tlačítka pro příkazy, které umí samo jádro.
 *
 * Ikona je tady jen jméno — na obrázek ho převádí `@nibble/ui`. Jádro tak
 * nezná SVG ani CSS, ale pořád může říct, jak se jeho příkazy jmenují a kdy
 * jsou dostupné.
 */

const BLOCK_OPTIONS = [
  { value: 'p', text: 'Odstavec' },
  { value: 'h1', text: 'Nadpis 1' },
  { value: 'h2', text: 'Nadpis 2' },
  { value: 'h3', text: 'Nadpis 3' },
  { value: 'h4', text: 'Nadpis 4' },
  { value: 'pre', text: 'Předformátovaný' },
] as const;

const ALIGN_LABELS: Record<string, string> = {
  left: 'vlevo', center: 'na střed', right: 'vpravo', justify: 'do bloku',
};

export function registerCoreControls(editor: Editor, ui: UIRegistry): void {
  ui.addButton('undo', {
    icon: 'undo', tooltip: 'Zpět', shortcut: 'Ctrl+Z',
    enabled: (ed) => ed.can('undo'),
    onAction: (ed) => { ed.focus(); ed.exec('undo'); },
  });
  ui.addButton('redo', {
    icon: 'redo', tooltip: 'Znovu', shortcut: 'Ctrl+Shift+Z',
    enabled: (ed) => ed.can('redo'),
    onAction: (ed) => { ed.focus(); ed.exec('redo'); },
  });

  ui.addSelect('blocks', {
    tooltip: 'Druh bloku',
    options: BLOCK_OPTIONS,
    value: (ed) => ed.getBlockTag() ?? '',
    onAction: (ed, value) => { ed.focus(); ed.exec('formatBlock', value); },
  });

  const inline = (name: string, tooltip: string, shortcut?: string): void => {
    ui.addButton(name, {
      icon: name, tooltip,
      ...(shortcut ? { shortcut } : {}),
      active: (ed) => ed.is(name),
      onAction: (ed) => { ed.focus(); ed.exec(name); },
    });
  };
  inline('bold', 'Tučně', 'Ctrl+B');
  inline('italic', 'Kurzíva', 'Ctrl+I');
  inline('underline', 'Podtržení', 'Ctrl+U');
  inline('strike', 'Přeškrtnutí');
  inline('superscript', 'Horní index');
  inline('subscript', 'Dolní index');
  inline('inlinecode', 'Kód');

  ui.addButton('bullist', {
    icon: 'bullist', tooltip: 'Odrážkový seznam',
    active: (ed) => ed.isInList() === 'ul',
    onAction: (ed) => { ed.focus(); ed.exec('bullist'); },
  });
  ui.addButton('numlist', {
    icon: 'numlist', tooltip: 'Číslovaný seznam',
    active: (ed) => ed.isInList() === 'ol',
    onAction: (ed) => { ed.focus(); ed.exec('numlist'); },
  });
  ui.addButton('indent', {
    icon: 'indent', tooltip: 'Zanořit', shortcut: 'Tab',
    enabled: (ed) => ed.can('indent'),
    onAction: (ed) => { ed.focus(); ed.exec('indent'); },
  });
  ui.addButton('outdent', {
    icon: 'outdent', tooltip: 'Vysunout', shortcut: 'Shift+Tab',
    enabled: (ed) => ed.can('outdent'),
    onAction: (ed) => { ed.focus(); ed.exec('outdent'); },
  });

  ui.addColor('forecolor', {
    icon: 'forecolor', tooltip: 'Barva písma',
    value: (ed) => currentColor(ed, 'forecolor'),
    enabled: (ed) => ed.can('forecolor'),
    onPick: (ed, color) => { ed.focus(); ed.exec('forecolor', color); },
  });
  ui.addColor('backcolor', {
    icon: 'backcolor', tooltip: 'Barva pozadí',
    value: (ed) => currentColor(ed, 'backcolor'),
    enabled: (ed) => ed.can('backcolor'),
    onPick: (ed, color) => { ed.focus(); ed.exec('backcolor', color); },
  });

  // Zanořování patří k seznamu, ne do hlavní lišty. V seznamu se nabídne samo,
  // jinde by jen zabíralo místo — a na klávesnici je stejně na Tabu.
  ui.addContextToolbar('list', {
    match: (node, ed) => closestListItem(node, ed.root),
    items: ['outdent', 'indent'],
    priority: 1,
  });

  for (const value of ['left', 'center', 'right', 'justify'] as const) {
    ui.addButton('align' + value, {
      icon: 'align' + value,
      tooltip: 'Zarovnat ' + ALIGN_LABELS[value],
      active: (ed) => ed.getAlignment() === value,
      onAction: (ed) => { ed.focus(); ed.exec('align', value); },
    });
  }

  ui.addMenu('lineheight', {
    tooltip: 'Výška řádku',
    width: 74,
    placeholder: 'Řádek',
    items: () => [
      { value: '', label: 'Výchozí' },
      ...['1', '1.15', '1.3', '1.5', '1.75', '2', '2.5', '3']
        .map((value) => ({ value, label: value })),
    ],
    value: (ed: Editor) => currentLineHeight(ed),
    onPick: (ed: Editor, value: string) => { ed.focus(); ed.exec('lineheight', value); },
  });

  ui.addButton('blockquote', {
    icon: 'blockquote', tooltip: 'Citace',
    active: (ed) => {
      const range = ed.selection.getRange();
      return !!range && closestQuote(range.startContainer, ed.root) !== null;
    },
    onAction: (ed) => { ed.focus(); ed.exec('blockquote'); },
  });

  ui.addButton('hr', {
    icon: 'hr', tooltip: 'Vodorovná čára',
    onAction: (ed) => { ed.focus(); ed.exec('hr'); },
  });
  ui.addButton('removeformat', {
    icon: 'removeformat', tooltip: 'Zrušit formátování',
    onAction: (ed) => { ed.focus(); ed.exec('removeFormat'); },
  });
}
