import { expect, test } from '@playwright/test';
import { caret, html, mount } from './helpers.js';

/** Postaví kurzor do n-té buňky v pořadí dokumentu. */
async function caretInCell(page: import('@playwright/test').Page, index: number) {
  await page.evaluate((i) => {
    const ed = (window as any).ed;
    const cell = ed.root.querySelectorAll('td, th')[i as number];
    const text = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT).nextNode();
    ed.selection.collapseTo(text ?? cell, 0);
    ed.root.focus();
  }, index);
}

const T = (rows: string) => '<table><tbody>' + rows + '</tbody></table>';
const shape = (out: string) => out.replace(/<tbody>|<\/tbody>/g, '');

test.describe('vložení tabulky', () => {
  test('dialog za mřížkou vloží tabulku se záhlavím', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.locator('.nb-toolbar .nb-btn[data-control=table]').click();
    await page.locator('.nb-grid').waitFor();
    await page.locator('.nb-grid-more').click();
    await page.locator('.nb-dialog[open]').waitFor();
    await page.locator('.nb-dialog [name=rows]').fill('2');
    await page.locator('.nb-dialog [name=cols]').fill('2');
    await page.locator('.nb-dialog-btn-primary').click();

    await expect.poll(() => page.evaluate(() =>
      (window as any).ed.root.querySelectorAll('td, th').length)).toBe(4);
    expect(await html(page)).toContain('<thead>');
  });

  test('bez záhlaví vzniknou jen <td>', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.evaluate(() =>
      (window as any).ed.exec('inserttable', { rows: 2, cols: 2, header: false }));
    const out = await html(page);
    expect(out).not.toContain('<th>');
    expect(out).toContain('<td><br></td>');
  });
});

test.describe('navigace Tabem', () => {
  test('přeskočí do další buňky', async ({ page }) => {
    await mount(page, T('<tr><td>a</td><td>b</td></tr>'));
    await caretInCell(page, 0);
    await page.keyboard.press('Tab');
    await expect.poll(() => page.evaluate(() => {
      const ed = (window as any).ed;
      return ed.selection.getRange()?.startContainer.textContent;
    })).toBe('b');
  });

  test('Shift+Tab jde zpátky', async ({ page }) => {
    await mount(page, T('<tr><td>a</td><td>b</td></tr>'));
    await caretInCell(page, 1);
    await page.keyboard.press('Shift+Tab');
    await expect.poll(() => page.evaluate(() =>
      (window as any).ed.selection.getRange()?.startContainer.textContent)).toBe('a');
  });

  test('na poslední buňce přidá řádek', async ({ page }) => {
    await mount(page, T('<tr><td>a</td><td>b</td></tr>'));
    await caretInCell(page, 1);
    await page.keyboard.press('Tab');
    await expect.poll(() => html(page)).toBe(
      shape(T('<tr><td>a</td><td>b</td></tr><tr><td><br></td><td><br></td></tr>'))
        .replace('<table>', '<table><tbody>').replace('</table>', '</tbody></table>'));
  });

  test('seznam v buňce si Tab bere pro sebe', async ({ page }) => {
    await mount(page, T('<tr><td><ul><li>a</li><li>b</li></ul></td><td>c</td></tr>'));
    await page.evaluate(() => {
      const ed = (window as any).ed;
      const li = ed.root.querySelectorAll('li')[1];
      ed.selection.collapseTo(li.firstChild, 1);
      ed.root.focus();
    });
    await page.keyboard.press('Tab');
    // Zanoření seznamu, ne skok do vedlejší buňky.
    await expect.poll(() => html(page)).toContain('<li>a<ul><li>b</li></ul></li>');
  });
});

test.describe('řádky a sloupce', () => {
  test('přidání řádku pod', async ({ page }) => {
    await mount(page, T('<tr><td>a</td></tr>'));
    await caretInCell(page, 0);
    await page.evaluate(() => (window as any).ed.exec('tablerowafter'));
    await expect.poll(() => page.evaluate(() =>
      (window as any).ed.root.querySelectorAll('tr').length)).toBe(2);
  });

  test('smazání řádku', async ({ page }) => {
    await mount(page, T('<tr><td>a</td></tr><tr><td>b</td></tr>'));
    await caretInCell(page, 0);
    await page.evaluate(() => (window as any).ed.exec('tabledeleterow'));
    await expect.poll(() => html(page)).toContain('b');
    expect(await html(page)).not.toContain('>a<');
  });

  test('přidání sloupce vpravo', async ({ page }) => {
    await mount(page, T('<tr><td>a</td></tr><tr><td>b</td></tr>'));
    await caretInCell(page, 0);
    await page.evaluate(() => (window as any).ed.exec('tablecolafter'));
    await expect.poll(() => page.evaluate(() =>
      (window as any).ed.root.querySelectorAll('td').length)).toBe(4);
  });

  test('poslední sloupec smazat nejde', async ({ page }) => {
    await mount(page, T('<tr><td>a</td></tr>'));
    await caretInCell(page, 0);
    expect(await page.evaluate(() => (window as any).ed.exec('tabledeletecol'))).toBe(false);
  });

  test('smazání tabulky nechá odstavec, do kterého jde psát', async ({ page }) => {
    await mount(page, T('<tr><td>a</td></tr>'));
    await caretInCell(page, 0);
    await page.evaluate(() => (window as any).ed.exec('tabledelete'));
    await page.keyboard.type('po tabulce');
    await expect.poll(() => html(page)).toBe('<p>po tabulce</p>');
  });
});

test.describe('záhlaví a slučování', () => {
  test('přepnutí záhlaví vymění td za th', async ({ page }) => {
    await mount(page, T('<tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr>'));
    await caretInCell(page, 0);
    await page.evaluate(() => (window as any).ed.exec('tableheader'));
    await expect.poll(() => page.evaluate(() =>
      (window as any).ed.root.querySelectorAll('th').length)).toBe(2);
  });

  test('sloučení s buňkou vpravo', async ({ page }) => {
    await mount(page, T('<tr><td>a</td><td>b</td></tr>'));
    await caretInCell(page, 0);
    await page.evaluate(() => (window as any).ed.exec('tablemergeright'));
    await expect.poll(() => html(page)).toContain('colspan="2"');
  });

  test('rozdělení sloučené buňky', async ({ page }) => {
    await mount(page, T('<tr><td colspan="2">ab</td></tr>'));
    await caretInCell(page, 0);
    await page.evaluate(() => (window as any).ed.exec('tablesplitcell'));
    await expect.poll(() => html(page)).not.toContain('colspan');
    expect(await page.evaluate(() =>
      (window as any).ed.root.querySelectorAll('td').length)).toBe(2);
  });
});

test.describe('plovoucí lišta tabulky', () => {
  test('ukáže se v buňce', async ({ page }) => {
    await mount(page, T('<tr><td>a</td></tr>'));
    await caretInCell(page, 0);
    await expect(page.locator('.nb-context .nb-btn[data-control=tablerowafter]')).toBeVisible();
  });

  test('mimo tabulku je schovaná', async ({ page }) => {
    await mount(page, '<p>mimo</p>' + T('<tr><td>a</td></tr>'));
    await caret(page, 0, 2);
    await expect(page.locator('.nb-context')).toBeHidden();
  });
});

test.describe('šířka sloupce', () => {
  test('tažení okraje zapíše width do <col>', async ({ page }) => {
    await mount(page, T('<tr><td>prvni</td><td>druhy</td></tr>'));

    const box = await page.evaluate(() => {
      const cell = (window as any).ed.root.querySelector('td')!;
      const r = cell.getBoundingClientRect();
      return { x: r.right - 2, y: r.top + r.height / 2 };
    });

    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    await page.mouse.move(box.x + 60, box.y, { steps: 5 });
    await page.mouse.up();

    await expect.poll(() => html(page)).toContain('<colgroup>');
    const width = await page.evaluate(() =>
      Number((window as any).ed.root.querySelector('col')?.getAttribute('width')));
    expect(width).toBeGreaterThan(60);
  });
});

test.describe('zachování obsahu', () => {
  test('tabulka z produkce se načte a uloží beze změny', async ({ page }) => {
    const original = '<table style="border-collapse: collapse; width: 100%;" border="1">'
      + '<colgroup><col style="width: 49.98%;"><col style="width: 49.98%;"></colgroup>'
      + '<tbody><tr><td data-row="0">a</td><td data-row="0">b</td></tr></tbody></table>';
    await mount(page, original);
    expect(await html(page)).toBe(original);
  });

  test('úprava tabulky nesáhne na okolní odstavce', async ({ page }) => {
    const original = '<p>pred</p>' + T('<tr><td>a</td></tr>') + '<p>po</p>';
    await mount(page, original);
    await caretInCell(page, 0);
    await page.evaluate(() => (window as any).ed.exec('tablerowafter'));

    const out = await html(page);
    expect(out.startsWith('<p>pred</p>')).toBe(true);
    expect(out.endsWith('<p>po</p>')).toBe(true);
  });
});

/**
 * Rozměr se vybírá okem, ne dvěma čísly. Mřížka se přitom rozrůstá pod rukou,
 * takže pevný strop není vidět, dokud se do něj nenarazí.
 */
test.describe('mřížka rozměru', () => {
  test('tlačítko ji otevře', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.locator('.nb-toolbar .nb-btn[data-control=table]').click();
    await expect(page.locator('.nb-grid')).toBeVisible();
    await expect(page.locator('.nb-grid-label')).toHaveText('Vyberte rozměr');
  });

  test('najetí ukazuje rozměr', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.locator('.nb-toolbar .nb-btn[data-control=table]').click();
    await page.locator('.nb-grid').waitFor();

    await page.locator('.nb-grid-cell[data-row="3"][data-col="4"]').hover();
    await expect(page.locator('.nb-grid-label')).toHaveText('3 × 4');
  });

  test('kliknutí vloží tabulku zvoleného rozměru', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.locator('.nb-toolbar .nb-btn[data-control=table]').click();
    await page.locator('.nb-grid').waitFor();
    await page.locator('.nb-grid-cell[data-row="2"][data-col="3"]').click();

    await expect.poll(() => page.evaluate(() => ({
      radku: (window as any).ed.root.querySelectorAll('tr').length,
      bunek: (window as any).ed.root.querySelectorAll('td').length,
    }))).toEqual({ radku: 2, bunek: 6 });
  });

  test('mřížka se na kraji rozroste', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.locator('.nb-toolbar .nb-btn[data-control=table]').click();
    await page.locator('.nb-grid').waitFor();

    const before = await page.locator('.nb-grid-cell:visible').count();
    await page.locator('.nb-grid-cell[data-row="5"][data-col="5"]').hover();
    expect(await page.locator('.nb-grid-cell:visible').count()).toBeGreaterThan(before);
  });

  test('Escape zavře bez vložení', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await caret(page, 0, 1);
    await page.locator('.nb-toolbar .nb-btn[data-control=table]').click();
    await page.locator('.nb-grid').waitFor();
    await page.keyboard.press('Escape');

    await expect(page.locator('.nb-grid')).toHaveCount(0);
    expect(await html(page)).toBe('<p>text</p>');
  });
});

/**
 * Nabízí se to, co je v datech vidět: cellpadding, border, width
 * a border-collapse. Řádky v produkčním obsahu nenesou nic a `<thead>` tam
 * není ani jednou — právě proto má smysl umět řádek na záhlaví přepnout.
 */
test.describe('vlastnosti tabulky', () => {
  async function openProps(page: import('@playwright/test').Page) {
    await caretInCell(page, 0);
    await page.evaluate(() => (window as any).ed.ui.get('tableprops').onAction((window as any).ed));
    await page.locator('.nb-dialog[open]').waitFor();
  }

  test('dialog předvyplní, co tabulka má', async ({ page }) => {
    await mount(page, '<table border="1" cellpadding="4" style="width: 100%;">'
      + '<tbody><tr><td>a</td></tr></tbody></table>');
    await openProps(page);

    await expect(page.locator('.nb-dialog [name=border]')).toHaveValue('1');
    await expect(page.locator('.nb-dialog [name=cellpadding]')).toHaveValue('4');
    await expect(page.locator('.nb-dialog [name=width]')).toHaveValue('100%');
  });

  test('zapíše šířku a odsazení', async ({ page }) => {
    await mount(page, T('<tr><td>a</td></tr>'));
    await openProps(page);
    await page.locator('.nb-dialog [name=width]').fill('80%');
    await page.locator('.nb-dialog [name=cellpadding]').fill('8');
    await page.locator('.nb-dialog-btn-primary').click();

    await expect.poll(() => html(page)).toContain('cellpadding="8"');
    expect(await html(page)).toContain('width: 80%');
  });

  test('barva se uloží tak, jak byla zadaná', async ({ page }) => {
    // Výběr barvy by `rgb(245, 245, 245)` převedl na #f5f5f5 a tabulku tím
    // přepsal už jen otevřením dialogu.
    await mount(page, T('<tr><td>a</td></tr>'));
    await caretInCell(page, 0);
    await page.evaluate(() =>
      (window as any).ed.exec('tableprops', { background: 'rgb(245, 245, 245)' }));

    await expect.poll(() => html(page)).toContain('background-color: rgb(245, 245, 245)');
  });

  test('otevřít a zavřít beze změny nic nepřepíše', async ({ page }) => {
    const original = '<table border="1" cellpadding="4"><tbody><tr><td>a</td></tr></tbody></table>';
    await mount(page, original);
    await openProps(page);
    await page.locator('.nb-dialog-btn', { hasText: 'Zrušit' }).click();

    expect(await html(page)).toBe(original);
  });
});

test.describe('vlastnosti řádku', () => {
  async function openRowProps(page: import('@playwright/test').Page, cell = 0) {
    await caretInCell(page, cell);
    await page.evaluate(() => (window as any).ed.ui.get('rowprops').onAction((window as any).ed));
    await page.locator('.nb-dialog[open]').waitFor();
  }

  test('přepnutí na záhlaví přesune řádek a udělá z buněk <th>', async ({ page }) => {
    await mount(page, T('<tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr>'));
    await openRowProps(page, 0);
    await page.locator('.nb-dialog [name=type]').selectOption('thead');
    await page.locator('.nb-dialog-btn-primary').click();

    await expect.poll(() => html(page)).toContain('<thead>');
    expect(await html(page)).toContain('<th>a</th>');
  });

  test('zarovnání a výška se zapíšou na řádek', async ({ page }) => {
    await mount(page, T('<tr><td>a</td></tr>'));
    await caretInCell(page, 0);
    await page.evaluate(() =>
      (window as any).ed.exec('rowprops', { align: 'center', height: '32px' }));

    const out = await html(page);
    expect(out).toContain('text-align: center');
    expect(out).toContain('height: 32px');
  });

  test('kurzor zůstane tam, kde byl, i po přepnutí na záhlaví', async ({ page }) => {
    // Buňka se nahradí, ale textový uzel se do nové jen přestěhuje — odkaz
    // na něj přesun přežije. Postavit kurzor natvrdo na začátek by uživateli
    // posunulo psaní.
    await mount(page, T('<tr><td>abc</td></tr>'));
    await page.evaluate(() => {
      const ed = (window as any).ed;
      const cell = ed.root.querySelector('td')!;
      ed.selection.collapseTo(cell.firstChild!, 3);
      ed.root.focus();
    });

    await page.evaluate(() => (window as any).ed.exec('rowprops', { type: 'thead' }));
    await page.keyboard.type('!');

    await expect.poll(() => html(page)).toContain('<th>abc!</th>');
  });

  test('prázdná sekce po přesunu zmizí', async ({ page }) => {
    await mount(page, '<table><thead><tr><th>a</th></tr></thead></table>');
    await caretInCell(page, 0);
    await page.evaluate(() => (window as any).ed.exec('rowprops', { type: 'tbody' }));

    const out = await html(page);
    expect(out).not.toContain('<thead>');
    expect(out).toContain('<td>a</td>');
  });
});
