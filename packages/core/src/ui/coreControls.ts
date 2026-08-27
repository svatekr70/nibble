import type { Editor } from '../Editor.js';
import { closestListItem } from '../dom/lists.js';
import {
  isOrdered, listChain, MARKERS, MARKER_NONE, readListProps, type ListProps,
} from '../dom/listProps.js';
import { closestDefItem } from '../dom/deflist.js';
import { anchorTarget, suggestAnchor } from '../commands/anchor.js';
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
  ui.addButton('anchor', {
    icon: 'anchor', tooltip: 'Kotva',
    active: (ed) => !!anchorTarget(ed)?.id,
    enabled: (ed) => ed.can('anchor'),
    onAction: (ed) => { void openAnchorDialog(ed); },
  });
  ui.addButton('deflist', {
    icon: 'deflist', tooltip: 'Seznam definic',
    active: (ed) => closestDefItem(ed.selection.getRange()?.startContainer ?? null, ed.root) !== null,
    onAction: (ed) => { ed.focus(); ed.exec('deflist'); },
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
    items: ['outdent', 'indent', 'listprops'],
    priority: 1,
  });

  ui.addButton('listprops', {
    icon: 'listprops', tooltip: 'Vlastnosti seznamu',
    enabled: (ed) => ed.can('listprops'),
    onAction: (ed) => { void openListPropsDialog(ed); },
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


const POSITION_OPTIONS = [
  { value: '', text: 'Neurčeno' },
  { value: 'outside', text: 'Vně textu (outside)' },
  { value: 'inside', text: 'V textu (inside)' },
];

/** Popisek úrovně. Jedna úroveň se nečísluje — nemá se s čím splést. */
function levelLabel(index: number, total: number, text: string): string {
  return total === 1 ? text : `${index + 1}. úroveň — ${text}`;
}

function markerOptions(list: Element): Array<{ value: string; text: string }> {
  const kind = isOrdered(list) ? 'ol' : 'ul';
  return [
    { value: '', text: 'Neurčeno' },
    ...MARKERS.filter((m) => m.list === kind).map((m) => ({ value: m.value, text: m.text })),
    { value: MARKER_NONE, text: 'Bez značky' },
  ];
}

/**
 * Vlastnosti seznamu, po úrovních.
 *
 * Dialog nemá jak reagovat na změnu pole — vrací se jednou, až se potvrdí.
 * Rozbalovátko „která úroveň" by tedy nešlo: po jeho přepnutí se zbylá pole
 * nemají jak přenačíst. Místo toho se vysází skupina polí pro každou úroveň
 * nad kurzorem. U jednoúrovňového seznamu je dialog krátký, u zanořeného
 * ukáže celý řetěz najednou — a v tom je právě ta nezávislost vidět.
 */
export async function openListPropsDialog(editor: Editor): Promise<void> {
  const range = editor.selection.getRange();
  const chain = range ? listChain(range.startContainer, editor.root) : [];
  if (chain.length === 0) return;

  const fields = [];
  const initial: Record<string, unknown> = {};

  for (const [i, list] of chain.entries()) {
    const props = readListProps(list);

    fields.push({
      type: 'select' as const,
      name: `marker${i}`,
      label: levelLabel(i, chain.length, 'druh značky'),
      options: markerOptions(list),
    });
    initial[`marker${i}`] = props.marker;

    // `start` jen u číslovaného seznamu — na odrážkách nic neznamená.
    if (isOrdered(list)) {
      fields.push({
        type: 'number' as const,
        name: `start${i}`,
        label: levelLabel(i, chain.length, 'začít od'),
        placeholder: '1',
      });
      initial[`start${i}`] = props.start;
    }

    fields.push({
      type: 'select' as const,
      name: `position${i}`,
      label: levelLabel(i, chain.length, 'odsazení značky'),
      options: POSITION_OPTIONS,
    });
    initial[`position${i}`] = props.position;
  }

  fields.push({
    type: 'html' as const,
    name: 'napoveda',
    html: '<p class="nb-hint">Druh značky se ukládá atributem i stylem, aby ho '
      + 'přečetl i renderer, který inline styly seznamu nedodrží. Odsazení '
      + '<code>inside</code> je jen ve stylu — část poštovních klientů ho ignoruje.</p>',
  });

  const data = await editor.ui.dialog({
    title: 'Vlastnosti seznamu',
    fields,
    initial,
    submitLabel: 'Použít',
  });

  if (!data) return;

  const levels: Array<Partial<ListProps>> = chain.map((list, i) => {
    const props: Partial<ListProps> = {
      marker: String(data[`marker${i}`] ?? ''),
      position: String(data[`position${i}`] ?? ''),
    };
    // Pole, které v dialogu nebylo, se nesmí poslat — `undefined` znamená
    // nesahat, prázdný řetězec by `start` smazal.
    if (isOrdered(list)) props.start = String(data[`start${i}`] ?? '');
    return props;
  });

  editor.exec('listprops', { levels });
}

/**
 * Kotva na bloku, ve kterém stojí kurzor.
 *
 * Název se předvyplní tím, co na bloku už je, jinak se navrhne z jeho textu.
 * Prázdné pole kotvu zruší — je to jediná cesta, jak ji zase sundat.
 */
export async function openAnchorDialog(editor: Editor): Promise<void> {
  const block = anchorTarget(editor);
  if (!block) return;

  const data = await editor.ui.dialog({
    title: 'Kotva',
    fields: [
      {
        type: 'text',
        name: 'name',
        label: 'Název kotvy',
        placeholder: 'napr-kapitola-1',
      },
      {
        type: 'html',
        name: 'napoveda',
        html: '<p class="nb-hint">Zapíše se jako <code>id</code> na odstavec nebo nadpis, '
          + 'takže na něj vede odkaz <code>#nazev</code>. Diakritika a mezery se převedou '
          + 'na pomlčky. Prázdné pole kotvu zruší.</p>',
      },
    ],
    initial: { name: suggestAnchor(editor) },
    submitLabel: block.id ? 'Uložit' : 'Vložit',
  });

  if (data) editor.exec('anchor', { name: String(data.name ?? '') });
}
