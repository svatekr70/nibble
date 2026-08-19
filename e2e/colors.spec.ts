import { expect, test } from '@playwright/test';
import { caret, html, mount, select } from './helpers.js';

async function openPicker(page: import('@playwright/test').Page, which: 'forecolor' | 'backcolor') {
  await page.locator(`.nb-toolbar .nb-btn[data-control=${which}]`).click();
  await page.locator('.nb-picker').waitFor();
}

test.describe('barva písma', () => {
  test('z palety obarví výběr', async ({ page }) => {
    await mount(page, '<p>abcdef</p>');
    await select(page, 0, 1, 4);
    await openPicker(page, 'forecolor');
    await page.locator('.nb-picker-tab', { hasText: 'Palety' }).click();
    await page.locator('.nb-picker-swatch').first().click();

    await expect.poll(() => html(page)).toBe(
      '<p>a<span style="color: rgb(31, 95, 91);">bcd</span>ef</p>');
  });

  test('vlastní barva z kola', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    await select(page, 0, 0, 3);
    await openPicker(page, 'forecolor');
    await page.locator('.nb-wheel-cell').nth(20).click();

    await expect.poll(() => html(page)).toContain('style="color:');
  });

  test('„Bez barvy" ji zase sundá', async ({ page }) => {
    await mount(page, '<p><span style="color: rgb(255, 0, 0);">abc</span></p>');
    await select(page, 0, 0, 3);
    await openPicker(page, 'forecolor');
    await page.locator('.nb-picker-clear').click();

    await expect.poll(() => html(page)).toBe('<p>abc</p>');
  });

  test('přebarvení nahradí starou barvu, nevnoří druhý span', async ({ page }) => {
    await mount(page, '<p><span style="color: rgb(255, 0, 0);">abc</span></p>');
    await select(page, 0, 0, 3);
    await page.evaluate(() => (window as any).ed.exec('forecolor', '#0d6efd'));

    const out = await html(page);
    expect((out.match(/<span/g) ?? []).length).toBe(1);
    expect(out).toContain('rgb(13, 110, 253)');
  });

  test('bez výběru je tlačítko nedostupné', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    await caret(page, 0, 1);
    await expect.poll(() =>
      page.locator('.nb-btn[data-control=forecolor]').getAttribute('aria-disabled'),
    ).toBe('true');
  });
});

test.describe('barva pozadí', () => {
  test('zapíše background-color', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    await select(page, 0, 0, 3);
    await page.evaluate(() => (window as any).ed.exec('backcolor', '#fff3cd'));
    await expect.poll(() => html(page)).toContain('background-color: rgb(255, 243, 205)');
  });

  test('barva písma a pozadí se nepřebíjejí', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    await select(page, 0, 0, 3);
    await page.evaluate(() => (window as any).ed.exec('forecolor', '#ff0000'));
    await select(page, 0, 0, 3);
    await page.evaluate(() => (window as any).ed.exec('backcolor', '#ffff00'));

    const out = await html(page);
    expect(out).toContain('color: rgb(255, 0, 0)');
    expect(out).toContain('background-color: rgb(255, 255, 0)');
  });

  test('sundání pozadí nechá barvu písma', async ({ page }) => {
    await mount(page,
      '<p><span style="color: rgb(255, 0, 0); background-color: rgb(255, 255, 0);">abc</span></p>');
    await select(page, 0, 0, 3);
    await page.evaluate(() => (window as any).ed.exec('backcolor', null));

    const out = await html(page);
    expect(out).toContain('color: rgb(255, 0, 0)');
    expect(out).not.toContain('background-color');
  });
});

test.describe('popover', () => {
  test('má dva listy a přepínají se', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    await select(page, 0, 0, 3);
    await openPicker(page, 'forecolor');

    await expect(page.locator('.nb-wheel')).toBeVisible();
    await page.locator('.nb-picker-tab', { hasText: 'Palety' }).click();
    await expect(page.locator('.nb-wheel')).toBeHidden();
    await expect(page.locator('.nb-picker-grid')).toBeVisible();
  });

  test('jezdec jasu přebarví kolo', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    await select(page, 0, 0, 3);
    await openPicker(page, 'forecolor');

    const before = await page.locator('.nb-wheel-cell').nth(30).getAttribute('fill');
    await page.locator('.nb-picker-bright input').fill('40');
    const after = await page.locator('.nb-wheel-cell').nth(30).getAttribute('fill');

    expect(after).not.toBe(before);
  });

  test('Escape zavře bez změny obsahu', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    await select(page, 0, 0, 3);
    await openPicker(page, 'forecolor');
    await page.keyboard.press('Escape');

    await expect(page.locator('.nb-picker')).toHaveCount(0);
    expect(await html(page)).toBe('<p>abc</p>');
  });

  test('kliknutí mimo zavře', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    await select(page, 0, 0, 3);
    await openPicker(page, 'forecolor');
    await page.mouse.click(5, 5);
    await expect(page.locator('.nb-picker')).toHaveCount(0);
  });

  test('vybraná barva se zapamatuje mezi otevřeními', async ({ page }) => {
    await mount(page, '<p>abcdef</p>');
    await select(page, 0, 0, 3);
    await openPicker(page, 'forecolor');
    await page.locator('.nb-wheel-cell').nth(25).click();

    // Po obarvení je text rozdělený na <span>abc</span>def, takže druhý výběr
    // se musí postavit na poslední textový uzel, ne na první.
    await page.evaluate(() => {
      const ed = (window as any).ed;
      const last = ed.root.querySelector('p')!.lastChild!;
      const range = document.createRange();
      range.setStart(last, 0);
      range.setEnd(last, last.textContent!.length);
      ed.selection.setRange(range);
      ed.root.focus();
    });

    await openPicker(page, 'forecolor');
    await expect(page.locator('.nb-picker-recent').first()).toBeVisible();
  });

  test('předvolby z palety historii nezaplňují', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    // Až po načtení stránky — před ním by se mazalo úložiště jiného původu.
    await page.evaluate(() => localStorage.removeItem('nibble:recent-colors'));
    await select(page, 0, 0, 3);
    await openPicker(page, 'forecolor');
    await page.locator('.nb-picker-tab', { hasText: 'Palety' }).click();
    await page.locator('.nb-picker-swatch').first().click();

    await select(page, 0, 0, 3);
    await openPicker(page, 'forecolor');
    await expect(page.locator('.nb-picker-recent')).toHaveCount(0);
  });
});

test.describe('ukazatel barvy na tlačítku', () => {
  test('proužek ukazuje barvu pod kurzorem', async ({ page }) => {
    await mount(page, '<p><span style="color: rgb(255, 0, 0);">abc</span> jinak</p>');
    await select(page, 0, 0, 2);

    await expect.poll(() => page.evaluate(() => {
      const bar = document.querySelector('.nb-btn[data-control=forecolor] .nb-btn-bar');
      return (bar as HTMLElement)?.style.background;
    })).toBe('rgb(255, 0, 0)');
  });
});
