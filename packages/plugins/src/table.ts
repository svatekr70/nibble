import {
  buildGrid, closestCell, closestTable, createTable, deleteColumn, deleteRow,
  findCell, insertColumn, insertRow, mergeCell, neighbourCell, normalizeTable,
  rowsOf, setColumnWidth, splitCell, captureCaret, restoreCaret,
  type Editor, type Plugin,
} from '@nibble/core';
import { registerTablePropsCommands } from './tableProps.js';

/**
 * Tabulky.
 *
 * Rozsah určila data z ostrého provozu. V 55 tabulkách je `colspan` dvakrát
 * a `rowspan` jednou — slučování se prakticky nepoužívá. Zato `<col width>` je
 * tam 49×, takže tažení šířky sloupce má vyšší cenu než pohodlné slučování přes
 * výběr více buněk. Sloučit jde proto se sousedem vpravo nebo dolů; na výběr
 * obdélníku buněk zatím není důvod.
 */

/** Kolik pixelů od okraje buňky se ještě chytá táhlo. */
const RESIZE_ZONE = 5;

export interface TableOptions {
  /** Výchozí velikost nabízená v dialogu. */
  defaultRows?: number;
  defaultCols?: number;
}

/** Tabulka a buňka pod kurzorem, se srovnaným tvarem. */
function context(editor: Editor): { table: Element; cell: Element } | null {
  const range = editor.selection.getRange();
  if (!range) return null;

  const cell = closestCell(range.startContainer, editor.root);
  const table = closestTable(range.startContainer, editor.root);
  if (!cell || !table) return null;

  return { table, cell };
}

/** Postaví kurzor na začátek buňky. */
function caretInCell(editor: Editor, cell: Element): void {
  const walker = editor.document.createTreeWalker(cell, 4 /* SHOW_TEXT */);
  const text = walker.nextNode();
  if (text) editor.selection.collapseTo(text, 0);
  else editor.selection.collapseTo(cell, 0);
}

function structural(editor: Editor, run: (table: Element, cell: Element) => boolean): boolean {
  const ctx = context(editor);
  if (!ctx) return false;

  const caret = captureCaret(editor);
  normalizeTable(ctx.table, editor.document);

  if (!run(ctx.table, ctx.cell)) return false;

  restoreCaret(editor, caret);
  editor.commit('table');
  return true;
}

function positionOf(table: Element, cell: Element): { row: number; col: number } | null {
  const slot = findCell(buildGrid(table), cell);
  return slot ? { row: slot.row, col: slot.col } : null;
}

async function openTableDialog(editor: Editor, options: TableOptions): Promise<void> {
  const data = await editor.ui.dialog({
    title: 'Vložit tabulku',
    fields: [
      { type: 'number', name: 'rows', label: 'Řádků', required: true },
      { type: 'number', name: 'cols', label: 'Sloupců', required: true },
      { type: 'checkbox', name: 'header', label: 'První řádek je záhlaví' },
    ],
    initial: {
      rows: options.defaultRows ?? 3,
      cols: options.defaultCols ?? 3,
      header: true,
    },
    submitLabel: 'Vložit',
  });

  if (data) editor.exec('inserttable', data);
}

/** Táhlo šířky sloupce. Nic nepřidává do obsahu — jen sleduje myš. */
function bindColumnResize(editor: Editor): () => void {
  const root = editor.root;
  let dragging: { table: Element; col: number; startX: number; startWidth: number } | null = null;

  /** U kterého sloupce je myš na pravém okraji? */
  const edgeAt = (event: MouseEvent): { table: Element; col: number; cell: Element } | null => {
    const target = event.target as Node;
    const cell = closestCell(target, root);
    const table = closestTable(target, root);
    if (!cell || !table) return null;

    const box = cell.getBoundingClientRect();
    if (event.clientX < box.right - RESIZE_ZONE) return null;

    const slot = findCell(buildGrid(table), cell);
    if (!slot) return null;

    return { table, col: slot.col + slot.colSpan - 1, cell };
  };

  const onMouseMove = (event: Event): void => {
    const e = event as MouseEvent;

    if (dragging) {
      const width = dragging.startWidth + (e.clientX - dragging.startX);
      setColumnWidth(dragging.table, dragging.col, width, editor.document);
      e.preventDefault();
      return;
    }

    root.classList.toggle('nb-col-resize', edgeAt(e) !== null);
  };

  const onMouseDown = (event: Event): void => {
    const e = event as MouseEvent;
    const edge = edgeAt(e);
    if (!edge) return;

    e.preventDefault();
    normalizeTable(edge.table, editor.document);

    dragging = {
      table: edge.table,
      col: edge.col,
      startX: e.clientX,
      startWidth: edge.cell.getBoundingClientRect().width,
    };
  };

  const onMouseUp = (): void => {
    if (!dragging) return;
    dragging = null;
    editor.commit('table');
  };

  root.addEventListener('mousemove', onMouseMove);
  root.addEventListener('mousedown', onMouseDown);
  root.ownerDocument.addEventListener('mouseup', onMouseUp);

  return () => {
    root.classList.remove('nb-col-resize');
    root.removeEventListener('mousemove', onMouseMove);
    root.removeEventListener('mousedown', onMouseDown);
    root.ownerDocument.removeEventListener('mouseup', onMouseUp);
  };
}

export function createTablePlugin(options: TableOptions = {}): Plugin {
  return {
    name: 'table',

    setup(editor) {
      const { commands, ui } = editor;
      const inTable = (ed: Editor): boolean => context(ed) !== null;

      commands.add('inserttable', (ed, args) => {
        const spec = (args ?? {}) as { rows?: number; cols?: number; header?: boolean };
        const rows = Math.max(1, Math.min(Number(spec.rows) || 3, 100));
        const cols = Math.max(1, Math.min(Number(spec.cols) || 3, 50));

        const table = createTable(ed.document, rows, cols, { header: Boolean(spec.header) });
        if (!ed.insertHTML(table.outerHTML)) return false;

        const first = ed.root.querySelector('table td, table th');
        if (first) caretInCell(ed, first);
        return true;
      });

      const rowCommand = (name: string, where: 'before' | 'after'): void => {
        commands.add(name, (ed) => structural(ed, (table, cell) => {
          const at = positionOf(table, cell);
          return at ? insertRow(table, at.row, where, ed.document) !== null : false;
        }), inTable);
      };
      rowCommand('tablerowbefore', 'before');
      rowCommand('tablerowafter', 'after');

      const colCommand = (name: string, where: 'before' | 'after'): void => {
        commands.add(name, (ed) => structural(ed, (table, cell) => {
          const at = positionOf(table, cell);
          return at ? insertColumn(table, at.col, where, ed.document) : false;
        }), inTable);
      };
      colCommand('tablecolbefore', 'before');
      colCommand('tablecolafter', 'after');

      commands.add('tabledeleterow', (ed) => structural(ed, (table, cell) => {
        const at = positionOf(table, cell);
        return at ? deleteRow(table, at.row) : false;
      }), inTable);

      commands.add('tabledeletecol', (ed) => structural(ed, (table, cell) => {
        const at = positionOf(table, cell);
        return at ? deleteColumn(table, at.col) : false;
      }), inTable);

      commands.add('tablemergeright', (ed) => structural(
        ed, (table, cell) => mergeCell(table, cell, 'right')), inTable);
      commands.add('tablemergedown', (ed) => structural(
        ed, (table, cell) => mergeCell(table, cell, 'down')), inTable);
      commands.add('tablesplitcell', (ed) => structural(
        ed, (table, cell) => splitCell(table, cell, ed.document)), inTable);

      commands.add('tableheader', (ed) => structural(ed, (table) => {
        const first = rowsOf(table)[0];
        if (!first) return false;

        const toHeader = first.querySelector('th') === null;
        for (const cell of Array.from(first.children)) {
          const next = ed.document.createElement(toHeader ? 'th' : 'td');
          for (const attr of Array.from(cell.attributes)) {
            next.setAttribute(attr.name, attr.value);
          }
          while (cell.firstChild) next.appendChild(cell.firstChild);
          cell.replaceWith(next);
        }
        return true;
      }), inTable);

      commands.add('tabledelete', (ed) => {
        const ctx = context(ed);
        if (!ctx) return false;

        const after = ed.document.createElement('p');
        after.appendChild(ed.document.createElement('br'));
        ctx.table.replaceWith(after);

        ed.selection.collapseTo(after, 0);
        ed.commit('table');
        return true;
      }, inTable);

      // ---------------------------------------------------------------- UI

      ui.addGrid('table', {
        icon: 'table', tooltip: 'Tabulka',
        maxRows: 10, maxCols: 10,
        onPick: (ed, rows, cols) => ed.exec('inserttable', { rows, cols, header: false }),
        more: {
          label: 'Další nastavení…',
          onAction: (ed) => { void openTableDialog(ed, options); },
        },
      });

      const button = (name: string, icon: string, tooltip: string): void => {
        ui.addButton(name, {
          icon, tooltip,
          enabled: (ed) => ed.can(name),
          onAction: (ed) => { ed.focus(); ed.exec(name); },
        });
      };
      button('tablerowafter', 'rowplus', 'Přidat řádek pod');
      button('tabledeleterow', 'rowminus', 'Smazat řádek');
      button('tablecolafter', 'colplus', 'Přidat sloupec vpravo');
      button('tabledeletecol', 'colminus', 'Smazat sloupec');
      button('tablemergeright', 'merge', 'Sloučit s buňkou vpravo');
      button('tablesplitcell', 'split', 'Rozdělit buňku');
      button('tableheader', 'header', 'Přepnout záhlaví');
      button('tabledelete', 'trash', 'Smazat tabulku');

      ui.addContextToolbar('table', {
        match: (node, ed) => closestTable(node, ed.root),
        items: [
          'tablerowafter', 'tabledeleterow', 'tablecolafter', 'tabledeletecol',
          'tablemergeright', 'tablesplitcell', 'tableprops', 'tabledelete',
        ],
        priority: 5,
      });

      /**
       * Tab uvnitř tabulky přeskakuje po buňkách. Na poslední buňce přidá řádek —
       * je to nejrychlejší způsob, jak tabulku vyplnit, a uživatelé to čekají.
       */
      const onKeyDown = (event: Event): void => {
        const e = event as KeyboardEvent;
        if (e.key !== 'Tab' || e.defaultPrevented) return;

        const ctx = context(editor);
        if (!ctx) return;

        e.preventDefault();

        const next = neighbourCell(ctx.table, ctx.cell, e.shiftKey ? 'prev' : 'next');
        if (next) { caretInCell(editor, next); return; }
        if (e.shiftKey) return;

        const at = positionOf(ctx.table, ctx.cell);
        if (!at) return;

        const row = insertRow(ctx.table, at.row, 'after', editor.document);
        const first = row?.querySelector('td, th');
        if (first) caretInCell(editor, first);
        editor.commit('table');
      };

      registerTablePropsCommands(editor);

      editor.root.addEventListener('keydown', onKeyDown);
      const unbindResize = bindColumnResize(editor);

      return () => {
        editor.root.removeEventListener('keydown', onKeyDown);
        unbindResize();
      };
    },
  };
}

/** Tabulky s výchozím nastavením. */
export const table: Plugin = createTablePlugin();
