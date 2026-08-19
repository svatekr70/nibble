import { describe, expect, it } from 'vitest';
import { parseWindow } from './dom.js';
import {
  buildGrid, cellAt, createTable, deleteColumn, deleteRow, findCell,
  insertColumn, insertRow, mergeCell, normalizeTable, setColumnWidth, splitCell,
} from '../src/dom/tables.js';

/**
 * Mřížka je základ všeho ostatního. Bez ní se sloupce počítají špatně pokaždé,
 * když je v tabulce jediné rowspan — vizuální sloupec 2 pak není druhý <td>.
 */
function build(html: string) {
  const { document } = parseWindow();
  const root = document.createElement('div');
  root.innerHTML = html;
  return { root, document, table: root.querySelector('table')! };
}

const T = (rows: string) => '<table><tbody>' + rows + '</tbody></table>';
const shape = (root: Element) => root.innerHTML.replace(/<tbody>|<\/tbody>/g, '');

describe('mřížka', () => {
  it('rozměry prosté tabulky', () => {
    const { table } = build(T('<tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr>'));
    const grid = buildGrid(table);
    expect([grid.width, grid.height]).toEqual([2, 2]);
  });

  it('colspan zabírá víc políček', () => {
    const { table } = build(T('<tr><td colspan="2">a</td></tr><tr><td>b</td><td>c</td></tr>'));
    const grid = buildGrid(table);
    expect(grid.width).toBe(2);
    expect(cellAt(grid, 0, 0)!.cell).toBe(cellAt(grid, 0, 1)!.cell);
    expect(cellAt(grid, 0, 1)!.origin).toBe(false);
  });

  it('rowspan posune buňky v dalším řádku doprava', () => {
    const { table } = build(T(
      '<tr><td rowspan="2">a</td><td>b</td></tr><tr><td>c</td></tr>'));
    const grid = buildGrid(table);
    // Sloupec 0 druhého řádku patří buňce "a", ne buňce "c".
    expect(cellAt(grid, 1, 0)!.cell.textContent).toBe('a');
    expect(cellAt(grid, 1, 1)!.cell.textContent).toBe('c');
  });

  it('vnořená tabulka se do mřížky té vnější nepočítá', () => {
    const { table } = build(T('<tr><td><table><tbody><tr><td>x</td></tr></tbody></table></td>'
      + '<td>b</td></tr>'));
    expect(buildGrid(table).width).toBe(2);
  });

  it('findCell najde jen počátek buňky', () => {
    const { table } = build(T('<tr><td colspan="2">a</td></tr>'));
    const grid = buildGrid(table);
    const slot = findCell(grid, table.querySelector('td')!)!;
    expect([slot.row, slot.col, slot.colSpan]).toEqual([0, 0, 2]);
  });
});

describe('normalizeTable', () => {
  it('volné <tr> obalí do <tbody>', () => {
    const { root, table, document } = build('<table><tr><td>a</td></tr></table>');
    normalizeTable(table, document);
    expect(root.innerHTML).toBe('<table><tbody><tr><td>a</td></tr></tbody></table>');
  });

  it('dorovná řádek, kterému chybí buňka', () => {
    const { root, table, document } = build(T('<tr><td>a</td><td>b</td></tr><tr><td>c</td></tr>'));
    normalizeTable(table, document);
    expect(shape(root)).toBe('<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td></td></tr></table>');
  });

  it('colgroup dorovná na počet sloupců', () => {
    const { table, document } = build(
      '<table><colgroup><col></colgroup><tbody><tr><td>a</td><td>b</td></tr></tbody></table>');
    normalizeTable(table, document);
    expect(table.querySelectorAll('col')).toHaveLength(2);
  });
});

describe('createTable', () => {
  it('vytvoří mřížku zadané velikosti', () => {
    const { document } = parseWindow();
    const grid = buildGrid(createTable(document, 2, 3));
    expect([grid.width, grid.height]).toEqual([3, 2]);
  });

  it('s hlavičkou dá první řádek do <thead> jako <th>', () => {
    const { document } = parseWindow();
    const table = createTable(document, 2, 2, { header: true });
    expect(table.querySelectorAll('thead th')).toHaveLength(2);
    expect(buildGrid(table).height).toBe(2);
  });

  it('buňky mají <br>, aby do nich šlo kliknout', () => {
    const { document } = parseWindow();
    expect(createTable(document, 1, 1).querySelector('td')!.innerHTML).toBe('<br>');
  });
});

describe('řádky', () => {
  it('vloží řádek pod daný', () => {
    const { root, table, document } = build(T('<tr><td>a</td><td>b</td></tr>'));
    insertRow(table, 0, 'after', document);
    expect(shape(root)).toBe(
      '<table><tr><td>a</td><td>b</td></tr><tr><td><br></td><td><br></td></tr></table>');
  });

  it('vloží řádek nad daný', () => {
    const { table, document } = build(T('<tr><td>a</td></tr>'));
    insertRow(table, 0, 'before', document);
    expect(buildGrid(table).height).toBe(2);
    expect(table.querySelector('tr')!.textContent).toBe('');
  });

  it('buňce přes hranici jen zvětší rowspan, nepřidá další', () => {
    const { table, document } = build(T(
      '<tr><td rowspan="2">a</td><td>b</td></tr><tr><td>c</td></tr>'));
    insertRow(table, 0, 'after', document);
    expect(table.querySelector('td')!.getAttribute('rowspan')).toBe('3');
    expect(buildGrid(table).width).toBe(2);
  });

  it('smaže řádek', () => {
    const { table } = build(T('<tr><td>a</td></tr><tr><td>b</td></tr>'));
    expect(deleteRow(table, 0)).toBe(true);
    expect(table.textContent).toBe('b');
  });

  it('poslední řádek smazat nejde — zbyla by prázdná tabulka', () => {
    const { table } = build(T('<tr><td>a</td></tr>'));
    expect(deleteRow(table, 0)).toBe(false);
  });

  it('mazání řádku zmenší rowspan buňky, která přesahovala', () => {
    const { table } = build(T(
      '<tr><td rowspan="2">a</td><td>b</td></tr><tr><td>c</td></tr>'));
    deleteRow(table, 1);
    expect(table.querySelector('td')!.hasAttribute('rowspan')).toBe(false);
  });
});

describe('sloupce', () => {
  it('vloží sloupec vpravo', () => {
    const { root, table, document } = build(T('<tr><td>a</td></tr><tr><td>b</td></tr>'));
    insertColumn(table, 0, 'after', document);
    expect(shape(root)).toBe(
      '<table><tr><td>a</td><td><br></td></tr><tr><td>b</td><td><br></td></tr></table>');
  });

  it('vloží sloupec vlevo', () => {
    const { table, document } = build(T('<tr><td>a</td></tr>'));
    insertColumn(table, 0, 'before', document);
    expect(table.querySelector('tr')!.children[1]!.textContent).toBe('a');
  });

  it('smaže sloupec', () => {
    const { table } = build(T('<tr><td>a</td><td>b</td></tr>'));
    expect(deleteColumn(table, 0)).toBe(true);
    expect(table.textContent).toBe('b');
  });

  it('poslední sloupec smazat nejde', () => {
    const { table } = build(T('<tr><td>a</td></tr>'));
    expect(deleteColumn(table, 0)).toBe(false);
  });

  it('mazání sloupce zmenší colspan místo smazání buňky', () => {
    const { table } = build(T('<tr><td colspan="2">a</td></tr><tr><td>b</td><td>c</td></tr>'));
    deleteColumn(table, 0);
    expect(table.querySelector('td')!.hasAttribute('colspan')).toBe(false);
    expect(table.querySelector('td')!.textContent).toBe('a');
  });

  it('colgroup se drží s počtem sloupců', () => {
    const { table, document } = build(
      '<table><colgroup><col width="100"><col width="200"></colgroup>'
      + '<tbody><tr><td>a</td><td>b</td></tr></tbody></table>');
    insertColumn(table, 1, 'after', document);
    expect(table.querySelectorAll('col')).toHaveLength(3);
    deleteColumn(table, 0);
    expect(table.querySelectorAll('col')).toHaveLength(2);
  });
});

describe('šířka sloupce', () => {
  it('zapíše se do <col>, jak je to v datech dnes', () => {
    const { table, document } = build(
      '<table><colgroup><col width="100"><col></colgroup>'
      + '<tbody><tr><td>a</td><td>b</td></tr></tbody></table>');
    setColumnWidth(table, 1, 250, document);
    expect(table.querySelectorAll('col')[1]!.getAttribute('width')).toBe('250');
  });

  it('chybějící colgroup se doplní', () => {
    const { table, document } = build(T('<tr><td>a</td><td>b</td></tr>'));
    setColumnWidth(table, 0, 120, document);
    expect(table.querySelectorAll('col')).toHaveLength(2);
    expect(table.querySelector('col')!.getAttribute('width')).toBe('120');
  });
});

describe('slučování', () => {
  it('sloučí buňku se sousední vpravo', () => {
    const { root, table } = build(T('<tr><td>a</td><td>b</td></tr>'));
    expect(mergeCell(table, table.querySelector('td')!, 'right')).toBe(true);
    expect(shape(root)).toBe('<table><tr><td colspan="2">ab</td></tr></table>');
  });

  it('sloučí buňku se sousední dole', () => {
    const { table } = build(T('<tr><td>a</td></tr><tr><td>b</td></tr>'));
    expect(mergeCell(table, table.querySelector('td')!, 'down')).toBe(true);
    expect(table.querySelector('td')!.getAttribute('rowspan')).toBe('2');
  });

  it('na kraji tabulky sloučit nejde', () => {
    const { table } = build(T('<tr><td>a</td></tr>'));
    expect(mergeCell(table, table.querySelector('td')!, 'right')).toBe(false);
  });

  it('rozdílně vysoké buňky sloučit nejde — vznikla by díra', () => {
    const { table } = build(T(
      '<tr><td rowspan="2">a</td><td>b</td></tr><tr><td>c</td></tr>'));
    expect(mergeCell(table, table.querySelector('td')!, 'right')).toBe(false);
  });

  it('rozdělení vrátí buňky zpátky', () => {
    const { root, table, document } = build(T('<tr><td colspan="2">ab</td></tr>'));
    expect(splitCell(table, table.querySelector('td')!, document)).toBe(true);
    expect(shape(root)).toBe('<table><tr><td>ab</td><td><br></td></tr></table>');
  });

  it('nesloučenou buňku rozdělit nelze', () => {
    const { table, document } = build(T('<tr><td>a</td></tr>'));
    expect(splitCell(table, table.querySelector('td')!, document)).toBe(false);
  });
});
