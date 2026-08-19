/**
 * Tabulky.
 *
 * Priority určila data z ostrého provozu, ne obecná představa o tom, co tabulka
 * potřebuje. V 55 tabulkách je `colspan` dvakrát a `rowspan` jednou — slučování
 * buněk se prakticky nepoužívá. Zato `<col width>` je tam 49× a `<colgroup>`
 * 16×, takže šířky sloupců jsou to, na čem záleží. Podle toho je rozdělená
 * i pečlivost: mřížka počítá se sloučenými buňkami všude, kde by jinak spočítala
 * špatně, ale ovládání slučování zůstává jednoduché.
 *
 * Mřížka je základ všeho ostatního. Bez ní se `<tr>` a `<td>` počítají špatně
 * pokaždé, když je v tabulce jediné `rowspan` — vizuální sloupec číslo 2 pak
 * není druhý `<td>` v řádku.
 */

const NODE_ELEMENT = 1;

export interface GridCell {
  cell: HTMLTableCellElement;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  /** Levý horní roh buňky, nebo jen políčko, které zabírá? */
  origin: boolean;
}

export interface Grid {
  table: Element;
  cells: GridCell[][];
  width: number;
  height: number;
}

export function isTable(node: Node | null): node is HTMLTableElement {
  return !!node && node.nodeType === NODE_ELEMENT
    && (node as Element).tagName.toLowerCase() === 'table';
}

export function isCell(node: Node | null): node is HTMLTableCellElement {
  if (!node || node.nodeType !== NODE_ELEMENT) return false;
  const tag = (node as Element).tagName.toLowerCase();
  return tag === 'td' || tag === 'th';
}

export function closestCell(node: Node | null, root: Element): HTMLTableCellElement | null {
  let cur: Node | null = node;
  while (cur && cur !== root) {
    if (isCell(cur)) return cur;
    cur = cur.parentNode;
  }
  return null;
}

/** Nejbližší tabulka. U vnořených tabulek vrací tu vnitřní — tam uživatel stojí. */
export function closestTable(node: Node | null, root: Element): Element | null {
  let cur: Node | null = node;
  while (cur && cur !== root) {
    if (isTable(cur)) return cur;
    cur = cur.parentNode;
  }
  return null;
}

/** Řádky tabulky v pořadí dokumentu, napříč thead, tbody i tfoot. */
export function rowsOf(table: Element): HTMLTableRowElement[] {
  return Array.from(table.querySelectorAll('tr')).filter(
    (tr) => closestTableOf(tr) === table,
  ) as HTMLTableRowElement[];
}

/** Tabulka, do které řádek patří — kvůli vnořeným tabulkám. */
function closestTableOf(node: Element): Element | null {
  let cur: Node | null = node.parentNode;
  while (cur) {
    if (isTable(cur)) return cur;
    cur = cur.parentNode;
  }
  return null;
}

function spanOf(cell: Element, name: 'colspan' | 'rowspan'): number {
  const raw = Number(cell.getAttribute(name));
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 1000) : 1;
}

/**
 * Postaví mřížku, ve které každé políčko ví, která buňka ho zabírá.
 *
 * Sloučená buňka se objeví na všech políčkách, která pokrývá, ale `origin` má
 * jen na tom levém horním. Díky tomu jde pracovat se sloupcem jako se sloupcem,
 * i když v něm některé buňky fyzicky nejsou.
 */
export function buildGrid(table: Element): Grid {
  const rows = rowsOf(table);
  const cells: GridCell[][] = [];

  rows.forEach((tr, rowIndex) => {
    if (!cells[rowIndex]) cells[rowIndex] = [];

    let col = 0;
    for (const cell of Array.from(tr.children)) {
      if (!isCell(cell)) continue;

      while (cells[rowIndex]![col]) col++;

      const colSpan = spanOf(cell, 'colspan');
      const rowSpan = spanOf(cell, 'rowspan');

      for (let r = 0; r < rowSpan; r++) {
        const target = rowIndex + r;
        if (!cells[target]) cells[target] = [];
        for (let c = 0; c < colSpan; c++) {
          cells[target]![col + c] = {
            cell, row: rowIndex, col, rowSpan, colSpan,
            origin: r === 0 && c === 0,
          };
        }
      }

      col += colSpan;
    }
  });

  const width = cells.reduce((max, row) => Math.max(max, row.length), 0);
  return { table, cells, width, height: cells.length };
}

export function findCell(grid: Grid, cell: Element): GridCell | null {
  for (const row of grid.cells) {
    for (const slot of row) {
      if (slot?.cell === cell && slot.origin) return slot;
    }
  }
  return null;
}

export function cellAt(grid: Grid, row: number, col: number): GridCell | null {
  return grid.cells[row]?.[col] ?? null;
}

/** Buňky, které v daném sloupci začínají. */
function originsInColumn(grid: Grid, col: number): GridCell[] {
  const out: GridCell[] = [];
  for (let r = 0; r < grid.height; r++) {
    const slot = cellAt(grid, r, col);
    if (slot?.origin && slot.col === col) out.push(slot);
  }
  return out;
}

function colgroupOf(table: Element): Element | null {
  const group = table.querySelector('colgroup');
  return group && closestTableOf(group) === table ? group : null;
}

/**
 * Srovná tvar tabulky.
 *
 * Volá se až při úpravě, ne při načtení — stejně jako u seznamů. Doplňuje
 * chybějící `<tbody>` a dorovnává řádky, kterým chybí buňky; bez toho by se
 * sloupce počítaly pokaždé jinak.
 */
export function normalizeTable(table: Element, doc: Document): void {
  const looseRows = Array.from(table.children).filter(
    (child) => child.tagName.toLowerCase() === 'tr',
  );
  if (looseRows.length > 0) {
    const tbody = doc.createElement('tbody');
    table.insertBefore(tbody, looseRows[0]!);
    for (const tr of looseRows) tbody.appendChild(tr);
  }

  const grid = buildGrid(table);
  if (grid.width === 0) return;

  for (let r = 0; r < grid.height; r++) {
    const row = rowsOf(table)[r];
    if (!row) continue;

    for (let c = 0; c < grid.width; c++) {
      if (cellAt(grid, r, c)) continue;
      row.appendChild(doc.createElement('td'));
    }
  }

  const group = colgroupOf(table);
  if (group) {
    const cols = Array.from(group.children).filter((c) => c.tagName.toLowerCase() === 'col');
    while (cols.length < grid.width) {
      const col = doc.createElement('col');
      group.appendChild(col);
      cols.push(col);
    }
    for (const extra of cols.slice(grid.width)) extra.remove();
  }
}

function emptyCell(doc: Document, tag: 'td' | 'th'): HTMLTableCellElement {
  const cell = doc.createElement(tag) as HTMLTableCellElement;
  cell.appendChild(doc.createElement('br'));
  return cell;
}

/** Vytvoří tabulku se zadaným počtem řádků a sloupců. */
export function createTable(
  doc: Document,
  rows: number,
  cols: number,
  options: { header?: boolean } = {},
): HTMLTableElement {
  const table = doc.createElement('table');
  const body = doc.createElement('tbody');

  if (options.header) {
    const head = doc.createElement('thead');
    const tr = doc.createElement('tr');
    for (let c = 0; c < cols; c++) tr.appendChild(emptyCell(doc, 'th'));
    head.appendChild(tr);
    table.appendChild(head);
  }

  for (let r = 0; r < rows - (options.header ? 1 : 0); r++) {
    const tr = doc.createElement('tr');
    for (let c = 0; c < cols; c++) tr.appendChild(emptyCell(doc, 'td'));
    body.appendChild(tr);
  }

  table.appendChild(body);
  return table;
}

/**
 * Vloží řádek nad nebo pod daný.
 *
 * Buňky, které přes hranici přesahují svým `rowspan`, se nekopírují — jen se
 * jim přesah zvětší. Jinak by ve sloučené oblasti přibyla buňka navíc.
 */
export function insertRow(
  table: Element, at: number, where: 'before' | 'after', doc: Document,
): HTMLTableRowElement | null {
  const grid = buildGrid(table);
  const rows = rowsOf(table);
  const index = where === 'after' ? at + 1 : at;
  if (index < 0 || index > grid.height) return null;

  const tr = doc.createElement('tr');

  for (let c = 0; c < grid.width; c++) {
    const above = index > 0 ? cellAt(grid, index - 1, c) : null;
    const below = index < grid.height ? cellAt(grid, index, c) : null;

    // Buňka pokrývá políčko nad i pod vkládaným řádkem → jen ji protáhneme.
    if (above && below && above.cell === below.cell) {
      if (above.col === c) {
        above.cell.setAttribute('rowspan', String(above.rowSpan + 1));
      }
      continue;
    }

    const template = below?.origin ? below.cell : above?.cell;
    const tag = template?.tagName.toLowerCase() === 'th' ? 'th' : 'td';
    const cell = emptyCell(doc, tag);
    const colSpan = below?.colSpan ?? above?.colSpan ?? 1;
    if (colSpan > 1) {
      cell.setAttribute('colspan', String(colSpan));
      c += colSpan - 1;
    }
    tr.appendChild(cell);
  }

  const anchor = rows[Math.min(index, rows.length - 1)];
  if (!anchor) {
    (table.querySelector('tbody') ?? table).appendChild(tr);
    return tr;
  }

  if (index >= rows.length) anchor.parentNode?.appendChild(tr);
  else anchor.parentNode?.insertBefore(tr, anchor);

  return tr;
}

export function deleteRow(table: Element, at: number): boolean {
  const grid = buildGrid(table);
  const rows = rowsOf(table);
  const row = rows[at];
  if (!row || grid.height <= 1) return false;

  for (let c = 0; c < grid.width; c++) {
    const slot = cellAt(grid, at, c);
    if (!slot || slot.col !== c) continue;

    if (slot.rowSpan > 1) {
      // Buňka přesahuje dál — zmenšíme přesah a případně ji přesuneme níž.
      if (slot.row === at) {
        const nextRow = rows[at + 1];
        if (nextRow) {
          const before = firstCellAtOrAfter(buildGrid(table), at + 1, c);
          nextRow.insertBefore(slot.cell, before ?? null);
        }
      }
      slot.cell.setAttribute('rowspan', String(slot.rowSpan - 1));
      if (slot.rowSpan - 1 === 1) slot.cell.removeAttribute('rowspan');
    }
  }

  const parent = row.parentNode;
  row.remove();
  if (parent && parent.nodeType === NODE_ELEMENT && !(parent as Element).querySelector('tr')
      && (parent as Element).tagName.toLowerCase() !== 'table') {
    (parent as Element).remove();
  }
  return true;
}

function firstCellAtOrAfter(grid: Grid, row: number, col: number): Element | null {
  for (let c = col; c < grid.width; c++) {
    const slot = cellAt(grid, row, c);
    if (slot?.origin && slot.row === row) return slot.cell;
  }
  return null;
}

export function insertColumn(
  table: Element, at: number, where: 'before' | 'after', doc: Document,
): boolean {
  const grid = buildGrid(table);
  const index = where === 'after' ? at + 1 : at;
  if (index < 0 || index > grid.width) return false;

  const rows = rowsOf(table);

  for (let r = 0; r < grid.height; r++) {
    const left = index > 0 ? cellAt(grid, r, index - 1) : null;
    const right = index < grid.width ? cellAt(grid, r, index) : null;

    if (left && right && left.cell === right.cell) {
      if (left.row === r) left.cell.setAttribute('colspan', String(left.colSpan + 1));
      continue;
    }

    const row = rows[r];
    if (!row) continue;

    const template = right?.cell ?? left?.cell;
    const tag = template?.tagName.toLowerCase() === 'th' ? 'th' : 'td';
    const cell = emptyCell(doc, tag);

    const anchor = right && right.row === r ? right.cell
      : right ? firstCellAtOrAfter(grid, r, index) : null;
    row.insertBefore(cell, anchor ?? null);
  }

  const group = colgroupOf(table);
  if (group) {
    const cols = Array.from(group.children).filter((c) => c.tagName.toLowerCase() === 'col');
    const col = doc.createElement('col');
    group.insertBefore(col, cols[index] ?? null);
  }

  return true;
}

export function deleteColumn(table: Element, at: number): boolean {
  const grid = buildGrid(table);
  if (grid.width <= 1) return false;

  const removed = new Set<Element>();

  for (let r = 0; r < grid.height; r++) {
    const slot = cellAt(grid, r, at);
    if (!slot || removed.has(slot.cell)) continue;

    if (slot.colSpan > 1) {
      const next = slot.colSpan - 1;
      if (next === 1) slot.cell.removeAttribute('colspan');
      else slot.cell.setAttribute('colspan', String(next));
      continue;
    }

    removed.add(slot.cell);
    slot.cell.remove();
  }

  const group = colgroupOf(table);
  if (group) {
    const cols = Array.from(group.children).filter((c) => c.tagName.toLowerCase() === 'col');
    cols[at]?.remove();
  }

  return true;
}

/** Šířka sloupce se zapisuje do `<col>` — přesně tak, jak je to v datech dnes. */
export function setColumnWidth(table: Element, at: number, width: number, doc: Document): void {
  let group = colgroupOf(table);

  if (!group) {
    group = doc.createElement('colgroup');
    const grid = buildGrid(table);
    for (let c = 0; c < grid.width; c++) group.appendChild(doc.createElement('col'));
    table.insertBefore(group, table.firstChild);
  }

  const cols = Array.from(group.children).filter((c) => c.tagName.toLowerCase() === 'col');
  cols[at]?.setAttribute('width', String(Math.max(20, Math.round(width))));
}

/** Sloučí buňku se sousední vpravo nebo dole. */
export function mergeCell(table: Element, cell: Element, direction: 'right' | 'down'): boolean {
  const grid = buildGrid(table);
  const slot = findCell(grid, cell);
  if (!slot) return false;

  const targetRow = direction === 'down' ? slot.row + slot.rowSpan : slot.row;
  const targetCol = direction === 'right' ? slot.col + slot.colSpan : slot.col;

  const other = cellAt(grid, targetRow, targetCol);
  if (!other || !other.origin || other.cell === cell) return false;

  // Sloučit jde jen shodně široké nebo vysoké buňky, jinak by v mřížce vznikla díra.
  if (direction === 'right' && other.rowSpan !== slot.rowSpan) return false;
  if (direction === 'down' && other.colSpan !== slot.colSpan) return false;

  const trailing = cell.lastChild;
  if (trailing && trailing.nodeType === NODE_ELEMENT
      && (trailing as Element).tagName.toLowerCase() === 'br') {
    cell.removeChild(trailing);
  }
  while (other.cell.firstChild) cell.appendChild(other.cell.firstChild);
  other.cell.remove();

  if (direction === 'right') {
    cell.setAttribute('colspan', String(slot.colSpan + other.colSpan));
  } else {
    cell.setAttribute('rowspan', String(slot.rowSpan + other.rowSpan));
  }

  return true;
}

/** Rozdělí sloučenou buňku zpátky na jednotlivé. */
export function splitCell(table: Element, cell: Element, doc: Document): boolean {
  const grid = buildGrid(table);
  const slot = findCell(grid, cell);
  if (!slot || (slot.colSpan === 1 && slot.rowSpan === 1)) return false;

  const rows = rowsOf(table);
  const tag = cell.tagName.toLowerCase() === 'th' ? 'th' : 'td';

  cell.removeAttribute('colspan');
  cell.removeAttribute('rowspan');

  for (let r = slot.row; r < slot.row + slot.rowSpan; r++) {
    const row = rows[r];
    if (!row) continue;

    for (let c = slot.col; c < slot.col + slot.colSpan; c++) {
      if (r === slot.row && c === slot.col) continue;

      const fresh = emptyCell(doc, tag);
      const anchor = r === slot.row
        ? cell.nextSibling
        : firstCellAtOrAfter(buildGrid(table), r, c);
      row.insertBefore(fresh, anchor ?? null);
    }
  }

  return true;
}

/** Buňka v sousedním políčku ve směru pohybu — pro navigaci Tabem a šipkami. */
export function neighbourCell(
  table: Element, cell: Element, direction: 'next' | 'prev',
): HTMLTableCellElement | null {
  const cells = Array.from(table.querySelectorAll('td, th')).filter(
    (c) => closestTableOf(c) === table,
  ) as HTMLTableCellElement[];

  const index = cells.indexOf(cell as HTMLTableCellElement);
  if (index < 0) return null;

  return cells[direction === 'next' ? index + 1 : index - 1] ?? null;
}
