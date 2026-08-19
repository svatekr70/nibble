import { describe, expect, it } from 'vitest';
import { parseWindow } from './dom.js';
import {
  applyRowProps, applyTableProps, readRowProps, readTableProps, rowSection,
} from '../../plugins/src/tableProps.js';

/**
 * Nabízí se to, co je v datech vidět: cellpadding (5×), border (2×), width
 * a border-collapse ve stylu. Řádky v produkčním obsahu nenesou nic
 * a `<thead>` se tam nevyskytuje ani jednou.
 */
function build(html: string) {
  const { document } = parseWindow();
  const root = document.createElement('div');
  root.innerHTML = html;
  return { root, document, table: root.querySelector('table')! };
}

const T = (rows: string, attrs = '') =>
  '<table' + attrs + '><tbody>' + rows + '</tbody></table>';

/**
 * linkedom serializuje styl bez mezery za dvojtečkou (`width:100%`), prohlížeč
 * s ní (`width: 100%`). Porovnává se proto bez mezer; přesný tvar, který se
 * uloží, hlídá `e2e/table.spec.ts`.
 */
const style = (el: Element): string => (el.getAttribute('style') ?? '').replace(/\s+/g, '');

describe('čtení vlastností tabulky', () => {
  it('přečte atributy, které jsou v datech', () => {
    const { table } = build(T('<tr><td>a</td></tr>', ' border="1" cellpadding="4"'));
    const props = readTableProps(table);
    expect(props.border).toBe('1');
    expect(props.cellpadding).toBe('4');
  });

  it('šířku vezme ze stylu i z atributu', () => {
    expect(readTableProps(build(T('<tr><td>a</td></tr>',
      ' style="width: 100%;"')).table).width).toBe('100%');
    expect(readTableProps(build(T('<tr><td>a</td></tr>',
      ' width="600"')).table).width).toBe('600');
  });

  it('prázdná tabulka nemá nastavené nic', () => {
    const props = readTableProps(build(T('<tr><td>a</td></tr>')).table);
    expect(Object.values(props).every((v) => v === '')).toBe(true);
  });

  it('zarovnání pozná podle okrajů', () => {
    expect(readTableProps(build(T('<tr><td>a</td></tr>',
      ' style="margin-left: auto; margin-right: auto;"')).table).align).toBe('center');
    expect(readTableProps(build(T('<tr><td>a</td></tr>',
      ' style="margin-left: auto;"')).table).align).toBe('right');
  });
});

describe('zápis vlastností tabulky', () => {
  it('šířka jde do stylu a atribut zmizí', () => {
    const { table } = build(T('<tr><td>a</td></tr>', ' width="600"'));
    applyTableProps(table, { width: '100%' });
    expect(style(table)).toContain('width:100%');
    expect(table.hasAttribute('width')).toBe(false);
  });

  it('rámeček a odsazení jdou do atributů — tak je to v datech', () => {
    const { table } = build(T('<tr><td>a</td></tr>'));
    applyTableProps(table, { border: '1', cellpadding: '6' });
    expect(table.getAttribute('border')).toBe('1');
    expect(table.getAttribute('cellpadding')).toBe('6');
  });

  it('prázdná hodnota vlastnost odstraní', () => {
    const { table } = build(T('<tr><td>a</td></tr>', ' border="1" style="width: 50%;"'));
    applyTableProps(table, { border: '', width: '' });
    expect(table.hasAttribute('border')).toBe(false);
    expect(table.hasAttribute('style')).toBe(false);
  });

  it('zarovnání na střed nastaví okraje, ne zrušený align', () => {
    const { table } = build(T('<tr><td>a</td></tr>', ' align="center"'));
    applyTableProps(table, { align: 'center' });
    expect(table.hasAttribute('align')).toBe(false);
    expect(style(table)).toContain('margin-left:auto');
  });

  it('barva se zapíše tak, jak přišla — bez převodu na hex', () => {
    // `<input type="color">` by z toho udělal #f5f5f5 a tabulku tím přepsal.
    const { table } = build(T('<tr><td>a</td></tr>'));
    applyTableProps(table, { background: 'rgb(245, 245, 245)' });
    expect(style(table).replace(/,/g, ', ')).toContain('rgb(245, 245, 245)');
  });
});

describe('vlastnosti řádku', () => {
  it('pozná sekci, ve které řádek leží', () => {
    const { root } = build('<table><thead><tr><th>h</th></tr></thead>'
      + '<tbody><tr><td>b</td></tr></tbody></table>');
    const rows = root.querySelectorAll('tr');
    expect(rowSection(rows[0]!)).toBe('thead');
    expect(rowSection(rows[1]!)).toBe('tbody');
  });

  it('bez sekce se počítá jako tělo', () => {
    const { root } = build('<table><tr><td>a</td></tr></table>');
    expect(rowSection(root.querySelector('tr')!)).toBe('tbody');
  });

  it('přepnutí na záhlaví přesune řádek a přepíše buňky na <th>', () => {
    const { root, table, document } = build(T('<tr><td>a</td><td>b</td></tr>'));
    const row = root.querySelector('tr')!;
    applyRowProps(table, row, { type: 'thead' }, document);

    expect(table.querySelectorAll('thead th')).toHaveLength(2);
    expect(table.querySelectorAll('td')).toHaveLength(0);
  });

  it('návrat do těla vrátí <td>', () => {
    const { root, table, document } = build(
      '<table><thead><tr><th>a</th></tr></thead></table>');
    const row = root.querySelector('tr')!;
    applyRowProps(table, row, { type: 'tbody' }, document);

    expect(table.querySelectorAll('tbody td')).toHaveLength(1);
    expect(table.querySelector('thead')).toBeNull();
  });

  it('atributy buněk přesun přežijí', () => {
    const { root, table, document } = build(T('<tr><td colspan="2" class="x">a</td></tr>'));
    applyRowProps(table, root.querySelector('tr')!, { type: 'thead' }, document);

    const th = table.querySelector('th')!;
    expect(th.getAttribute('colspan')).toBe('2');
    expect(th.getAttribute('class')).toBe('x');
  });

  it('zarovnání a výška jdou do stylu', () => {
    const { root, table, document } = build(T('<tr><td>a</td></tr>'));
    const row = root.querySelector('tr')!;
    applyRowProps(table, row, { align: 'center', valign: 'top', height: '32px' }, document);

    expect(style(row)).toContain('text-align:center');
    expect(style(row)).toContain('vertical-align:top');
    expect(style(row)).toContain('height:32px');
  });

  it('přečte, co je nastavené', () => {
    const { root } = build(T('<tr style="text-align: right; height: 40px;"><td>a</td></tr>'));
    const props = readRowProps(root.querySelector('tr')!);
    expect(props.align).toBe('right');
    expect(props.height).toBe('40px');
  });
});
