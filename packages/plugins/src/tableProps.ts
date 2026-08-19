import {
  captureCaret, closestCell, closestTable, normalizeTable, restoreCaret,
  type Editor,
} from '@nibble/core';

/**
 * Vlastnosti tabulky a řádku.
 *
 * Nabízí se to, co je v datech opravdu vidět: `cellpadding` (5×), `border` (2×),
 * `width` a `border-collapse` ve stylu. Řádky v produkčním obsahu nenesou nic
 * a `<thead>` se tam nevyskytuje ani jednou — právě proto má smysl umět řádek
 * na záhlaví přepnout, jinak se k němu uživatel nedostane.
 *
 * Barvy se zadávají textem, ne výběrem barvy. Vypadá to jako krok zpět, ale
 * `<input type="color">` každou hodnotu převede na `#rrggbb` — a tabulka, která
 * má v obsahu `rgb(245, 245, 245)`, by se tím při pouhém otevření dialogu
 * přepsala. Textové pole vrátí beze změny to, co bylo.
 */

export interface TableProps {
  width: string;
  height: string;
  border: string;
  cellpadding: string;
  cellspacing: string;
  align: string;
  background: string;
  bordercolor: string;
}

export interface RowProps {
  type: 'thead' | 'tbody' | 'tfoot';
  align: string;
  valign: string;
  height: string;
  background: string;
}

function styleOf(el: Element, property: string): string {
  return (el as HTMLElement).style?.getPropertyValue(property) ?? '';
}

/**
 * Hodnota z dialogu na řetězec.
 *
 * Číselná pole vracejí `number`, ne text — bez převodu spadne `.trim()`
 * a zbytek vlastností se tiše neuloží.
 */
function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function setStyle(el: Element, property: string, value: unknown): void {
  const text = asText(value);
  const style = (el as HTMLElement).style;

  if (text === '') style.removeProperty(property);
  else style.setProperty(property, text);
  if (el.getAttribute('style') === '') el.removeAttribute('style');
}

function setAttr(el: Element, name: string, value: unknown): void {
  const text = asText(value);
  if (text === '') el.removeAttribute(name);
  else el.setAttribute(name, text);
}

/** Zarovnání tabulky na stránce — přes okraje, ne přes zrušený `align`. */
function readTableAlign(table: Element): string {
  const style = table as HTMLElement;
  if (style.style.marginLeft === 'auto' && style.style.marginRight === 'auto') return 'center';
  if (style.style.marginLeft === 'auto') return 'right';
  return table.getAttribute('align') ?? '';
}

function applyTableAlign(table: Element, align: string): void {
  const style = (table as HTMLElement).style;
  table.removeAttribute('align');

  style.removeProperty('margin-left');
  style.removeProperty('margin-right');

  if (align === 'center') { style.marginLeft = 'auto'; style.marginRight = 'auto'; }
  else if (align === 'right') { style.marginLeft = 'auto'; }

  if (table.getAttribute('style') === '') table.removeAttribute('style');
}

export function readTableProps(table: Element): TableProps {
  return {
    width: styleOf(table, 'width') || table.getAttribute('width') || '',
    height: styleOf(table, 'height') || table.getAttribute('height') || '',
    border: table.getAttribute('border') ?? '',
    cellpadding: table.getAttribute('cellpadding') ?? '',
    cellspacing: table.getAttribute('cellspacing') ?? '',
    align: readTableAlign(table),
    background: styleOf(table, 'background-color'),
    bordercolor: styleOf(table, 'border-color'),
  };
}

export function applyTableProps(table: Element, props: Partial<TableProps>): void {
  if (props.width !== undefined) {
    setStyle(table, 'width', props.width);
    table.removeAttribute('width');
  }
  if (props.height !== undefined) {
    setStyle(table, 'height', props.height);
    table.removeAttribute('height');
  }
  if (props.border !== undefined) setAttr(table, 'border', props.border);
  if (props.cellpadding !== undefined) setAttr(table, 'cellpadding', props.cellpadding);
  if (props.cellspacing !== undefined) setAttr(table, 'cellspacing', props.cellspacing);
  if (props.background !== undefined) setStyle(table, 'background-color', props.background);
  if (props.bordercolor !== undefined) setStyle(table, 'border-color', props.bordercolor);
  if (props.align !== undefined) applyTableAlign(table, props.align);
}

/** Ve které sekci řádek leží. */
export function rowSection(row: Element): RowProps['type'] {
  const tag = row.parentElement?.tagName.toLowerCase();
  return tag === 'thead' || tag === 'tfoot' ? tag : 'tbody';
}

export function readRowProps(row: Element): RowProps {
  return {
    type: rowSection(row),
    align: styleOf(row, 'text-align') || row.getAttribute('align') || '',
    valign: styleOf(row, 'vertical-align') || row.getAttribute('valign') || '',
    height: styleOf(row, 'height') || row.getAttribute('height') || '',
    background: styleOf(row, 'background-color'),
  };
}

/**
 * Přesune řádek do jiné sekce a přepíše buňky.
 *
 * Záhlaví není jen jiné místo v tabulce: buňky v něm musí být `<th>`, jinak to
 * čtečka ani prohlížeč za záhlaví nepovažují a celá změna je jen kosmetická.
 */
function moveRowToSection(table: Element, row: Element, type: RowProps['type'], doc: Document): void {
  if (rowSection(row) === type) return;

  let section = Array.from(table.children).find(
    (child) => child.tagName.toLowerCase() === type,
  );

  if (!section) {
    section = doc.createElement(type);
    // Pořadí sekcí v tabulce má být thead, tbody, tfoot.
    const before = type === 'thead'
      ? table.firstElementChild
      : type === 'tbody'
        ? Array.from(table.children).find((c) => c.tagName.toLowerCase() === 'tfoot') ?? null
        : null;
    table.insertBefore(section, before ?? null);
  }

  const previous = row.parentElement;
  if (type === 'thead') section.appendChild(row);
  else if (type === 'tfoot') section.appendChild(row);
  else section.appendChild(row);

  // Prázdná sekce po přesunu nemá zůstávat.
  if (previous && previous !== table && !previous.querySelector('tr')) previous.remove();

  const wanted = type === 'thead' ? 'th' : 'td';
  for (const cell of Array.from(row.children)) {
    if (cell.tagName.toLowerCase() === wanted) continue;

    const next = doc.createElement(wanted);
    for (const attr of Array.from(cell.attributes)) next.setAttribute(attr.name, attr.value);
    while (cell.firstChild) next.appendChild(cell.firstChild);
    cell.replaceWith(next);
  }
}

export function applyRowProps(
  table: Element, row: Element, props: Partial<RowProps>, doc: Document,
): void {
  if (props.type) moveRowToSection(table, row, props.type, doc);

  if (props.align !== undefined) {
    setStyle(row, 'text-align', props.align);
    row.removeAttribute('align');
  }
  if (props.valign !== undefined) {
    setStyle(row, 'vertical-align', props.valign);
    row.removeAttribute('valign');
  }
  if (props.height !== undefined) {
    setStyle(row, 'height', props.height);
    row.removeAttribute('height');
  }
  if (props.background !== undefined) setStyle(row, 'background-color', props.background);
}

const ALIGN_OPTIONS = [
  { value: '', text: 'Neurčeno' },
  { value: 'left', text: 'Vlevo' },
  { value: 'center', text: 'Na střed' },
  { value: 'right', text: 'Vpravo' },
];

export async function openTablePropsDialog(editor: Editor): Promise<void> {
  const range = editor.selection.getRange();
  const table = range ? closestTable(range.startContainer, editor.root) : null;
  if (!table) return;

  const current = readTableProps(table);

  const data = await editor.ui.dialog({
    title: 'Vlastnosti tabulky',
    fields: [
      { type: 'text', name: 'width', label: 'Šířka', placeholder: 'např. 100% nebo 600px' },
      { type: 'text', name: 'height', label: 'Výška' },
      { type: 'select', name: 'align', label: 'Zarovnání tabulky', options: ALIGN_OPTIONS },
      { type: 'number', name: 'border', label: 'Rámeček (px)' },
      { type: 'number', name: 'cellpadding', label: 'Odsazení v buňkách (px)' },
      { type: 'number', name: 'cellspacing', label: 'Mezera mezi buňkami (px)' },
      { type: 'text', name: 'bordercolor', label: 'Barva rámečku', placeholder: 'např. #dddddd' },
      { type: 'text', name: 'background', label: 'Barva pozadí' },
    ],
    initial: current as unknown as Record<string, unknown>,
    submitLabel: 'Použít',
  });

  if (data) editor.exec('tableprops', data);
}

export async function openRowPropsDialog(editor: Editor): Promise<void> {
  const range = editor.selection.getRange();
  const cell = range ? closestCell(range.startContainer, editor.root) : null;
  const row = cell?.parentElement;
  if (!row) return;

  const current = readRowProps(row);

  const data = await editor.ui.dialog({
    title: 'Vlastnosti řádku',
    fields: [
      { type: 'select', name: 'type', label: 'Typ řádku', options: [
        { value: 'thead', text: 'Záhlaví' },
        { value: 'tbody', text: 'Tělo tabulky' },
        { value: 'tfoot', text: 'Patička' },
      ] },
      { type: 'select', name: 'align', label: 'Zarovnání textu', options: ALIGN_OPTIONS },
      { type: 'select', name: 'valign', label: 'Svisle', options: [
        { value: '', text: 'Neurčeno' },
        { value: 'top', text: 'Nahoru' },
        { value: 'middle', text: 'Na střed' },
        { value: 'bottom', text: 'Dolů' },
      ] },
      { type: 'text', name: 'height', label: 'Výška', placeholder: 'např. 32px' },
      { type: 'text', name: 'background', label: 'Barva pozadí' },
      { type: 'html', name: 'napoveda', html:
        '<p class="nb-hint">Záhlaví přepíše buňky na <code>&lt;th&gt;</code>. '
        + 'Bez toho by to za záhlaví nepovažoval prohlížeč ani čtečka.</p>' },
    ],
    initial: current as unknown as Record<string, unknown>,
    submitLabel: 'Použít',
  });

  if (data) editor.exec('rowprops', data);
}

export function registerTablePropsCommands(editor: Editor): void {
  const { commands } = editor;

  const inTable = (ed: Editor): boolean => {
    const range = ed.selection.getRange();
    return !!range && closestTable(range.startContainer, ed.root) !== null;
  };

  commands.add('tableprops', (ed, args) => {
    const range = ed.selection.getRange();
    const table = range ? closestTable(range.startContainer, ed.root) : null;
    if (!table) return false;

    normalizeTable(table, ed.document);
    applyTableProps(table, (args ?? {}) as Partial<TableProps>);
    ed.commit('table');
    return true;
  }, inTable);

  commands.add('rowprops', (ed, args) => {
    const range = ed.selection.getRange();
    const cell = range ? closestCell(range.startContainer, ed.root) : null;
    const table = range ? closestTable(range.startContainer, ed.root) : null;
    const row = cell?.parentElement;
    if (!table || !row) return false;

    normalizeTable(table, ed.document);

    // Přepnutí na záhlaví buňku nahradí, ale textové uzly se do nové jen
    // přestěhují — odkaz na uzel proto přesun přežije a kurzor zůstane tam,
    // kde byl. Postavit ho natvrdo na začátek by uživateli posunulo psaní.
    const caret = captureCaret(ed);
    applyRowProps(table, row, (args ?? {}) as Partial<RowProps>, ed.document);
    restoreCaret(ed, caret);

    ed.commit('table');
    return true;
  }, inTable);

  editor.ui.addButton('tableprops', {
    icon: 'tableprops', tooltip: 'Vlastnosti tabulky',
    enabled: (ed) => ed.can('tableprops'),
    onAction: (ed) => { void openTablePropsDialog(ed); },
  });

  editor.ui.addButton('rowprops', {
    icon: 'rowprops', tooltip: 'Vlastnosti řádku',
    enabled: (ed) => ed.can('rowprops'),
    onAction: (ed) => { void openRowPropsDialog(ed); },
  });
}
