import { expect, test } from '@playwright/test';
import { CONTENT, caret, html, mount } from './helpers.js';

const BLOCK = '<details><summary>Otázka</summary><p>Odpověď</p></details>';

test.describe('rozbalovací blok', () => {
  test('obsah sbaleného bloku je v editoru vidět', async ({ page }) => {
    await mount(page, BLOCK);
    await expect(page.locator(`${CONTENT} details p`)).toBeVisible();
  });

  test('klik na nadpis nezmění HTML', async ({ page }) => {
    await mount(page, BLOCK);
    await page.locator(`${CONTENT} summary`).click();
    expect(await html(page)).toBe(BLOCK);
  });

  test('vložení z nabídky Vložit, psaní nadpisu, Enter do obsahu', async ({ page }) => {
    await mount(page, '<p>x</p>');
    await caret(page, 0, 1);
    await page.locator('.nb-menubar-item', { hasText: 'Vložit' }).click();
    await page.locator('.nb-panel-item', { hasText: 'Rozbalovací blok' }).click();
    await page.keyboard.type('Q');
    await page.keyboard.press('Enter');
    await page.keyboard.type('A');
    expect(await html(page)).toBe('<p>x</p><details><summary>Q</summary><p>A</p></details>');
  });

  test('přepínač Rozbalený na webu', async ({ page }) => {
    await mount(page, BLOCK);
    await caret(page, 0, 1);
    await page.locator('.nb-context .nb-btn[data-control=detailsopen]').click();
    expect(await html(page)).toBe('<details open=""><summary>Otázka</summary><p>Odpověď</p></details>');
  });

  test('Backspace na začátku obsahu nevlije obsah do nadpisu', async ({ page }) => {
    await mount(page, BLOCK);
    await page.evaluate(() => {
      const ed = (window as any).ed;
      ed.selection.collapseTo(ed.root.querySelector('details p').firstChild, 0);
      ed.root.focus();
    });
    await page.keyboard.press('Backspace');
    expect(await html(page)).toBe(BLOCK);
  });

  test('Zrušit blok', async ({ page }) => {
    await mount(page, BLOCK);
    await caret(page, 0, 1);
    await page.locator('.nb-context .nb-btn[data-control=undetails]').click();
    expect(await html(page)).toBe('<p>Otázka</p><p>Odpověď</p>');
  });
});
