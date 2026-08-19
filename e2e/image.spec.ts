import { expect, test } from '@playwright/test';
import { caret, html, mount } from './helpers.js';

/** Jednopixelový PNG jako testovací soubor. */
const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function attachFile(page: import('@playwright/test').Page, name = 'obrazek.png') {
  await page.locator('.nb-dialog [name=file]').setInputFiles({
    name, mimeType: 'image/png', buffer: Buffer.from(PIXEL, 'base64'),
  });
}

test.describe('vložení obrázku', () => {
  test('z adresy', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await caret(page, 0, 4);
    await page.locator('.nb-toolbar .nb-btn[data-control=image]').click();
    await page.locator('.nb-dialog[open]').waitFor();
    await page.locator('.nb-dialog [name=src]').fill('/media/foto.jpg');
    await page.locator('.nb-dialog [name=alt]').fill('popis');
    await page.locator('.nb-dialog-btn-primary').click();

    await expect.poll(() => html(page)).toBe('<p>text<img src="/media/foto.jpg" alt="popis"></p>');
  });

  test('rozměry se zapíšou, když je uživatel zadá', async ({ page }) => {
    await mount(page, '<p>t</p>');
    await caret(page, 0, 1);
    await page.locator('.nb-toolbar .nb-btn[data-control=image]').click();
    await page.locator('.nb-dialog[open]').waitFor();
    await page.locator('.nb-dialog [name=src]').fill('/a.png');
    await page.locator('.nb-dialog [name=width]').fill('320');
    await page.locator('.nb-dialog [name=height]').fill('240');
    await page.locator('.nb-dialog-btn-primary').click();

    await expect.poll(() => html(page)).toBe(
      '<p>t<img src="/a.png" alt="" width="320" height="240"></p>');
  });

  test('nahraný soubor projde adaptérem', async ({ page }) => {
    await mount(page, '<p>t</p>');
    await page.evaluate(() => {
      (window as any).nahrane = [];
      (window as any).uploadStub = (file: File) => {
        (window as any).nahrane.push({ jmeno: file.name, typ: file.type });
        return Promise.resolve('/uploads/' + file.name);
      };
    });

    await caret(page, 0, 1);
    await page.locator('.nb-toolbar .nb-btn[data-control=image]').click();
    await page.locator('.nb-dialog[open]').waitFor();
    await attachFile(page);
    await page.locator('.nb-dialog-btn-primary').click();

    await expect.poll(() => html(page)).toContain('src="/uploads/obrazek.png"');
    expect(await page.evaluate(() => (window as any).nahrane)).toEqual([
      { jmeno: 'obrazek.png', typ: 'image/png' },
    ]);
  });

  test('selhání adaptéru se ohlásí a obsah zůstane', async ({ page }) => {
    await mount(page, '<p>t</p>');
    await page.evaluate(() => {
      (window as any).uploadStub = () => Promise.reject(new Error('server neodpovídá'));
    });

    await caret(page, 0, 1);
    await page.locator('.nb-toolbar .nb-btn[data-control=image]').click();
    await page.locator('.nb-dialog[open]').waitFor();
    await attachFile(page);
    await page.locator('.nb-dialog-btn-primary').click();

    await expect(page.locator('.nb-note-error')).toContainText('server neodpovídá');
    expect(await html(page)).toBe('<p>t</p>');
  });

  test('bez adaptéru se vloží jako data: URL', async ({ page }) => {
    await page.goto('/e2e.html');
    await page.waitForFunction(() => (window as any).ready === true);
    await page.evaluate(() => (window as any).mountInline('<p>t</p>'));

    await caret(page, 0, 1);
    await page.locator('.nb-toolbar .nb-btn[data-control=image]').click();
    await page.locator('.nb-dialog[open]').waitFor();
    await attachFile(page);
    await page.locator('.nb-dialog-btn-primary').click();

    await expect.poll(() => html(page)).toContain('src="data:image/png;base64,');
  });
});

test.describe('úprava obrázku', () => {
  test('kurzor u obrázku ukáže plovoucí lištu', async ({ page }) => {
    await mount(page, '<p><img src="/a.png" alt="x"></p>');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      const img = ed.root.querySelector('img')!;
      const range = document.createRange();
      range.setStartBefore(img);
      range.collapse(true);
      ed.selection.setRange(range);
      ed.root.focus();
    });
    await expect(page.locator('.nb-context .nb-btn[data-control=removeimage]')).toBeVisible();
  });

  test('odebrání obrázku', async ({ page }) => {
    await mount(page, '<p><img src="/a.png" alt="x"></p>');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      const img = ed.root.querySelector('img')!;
      const range = document.createRange();
      range.setStartBefore(img);
      range.collapse(true);
      ed.selection.setRange(range);
      ed.root.focus();
    });
    await page.locator('.nb-context .nb-btn[data-control=removeimage]').click();
    await expect.poll(() => html(page)).toBe('<p></p>');
  });

  test('úprava přepíše stávající obrázek, nevloží druhý', async ({ page }) => {
    await mount(page, '<p><img src="/a.png" alt="stary"></p>');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      const img = ed.root.querySelector('img')!;
      const range = document.createRange();
      range.setStartBefore(img);
      range.collapse(true);
      ed.selection.setRange(range);
      ed.root.focus();
    });
    await page.evaluate(() =>
      (window as any).ed.exec('image', { src: '/b.png', alt: 'novy' }));
    expect(await html(page)).toBe('<p><img src="/b.png" alt="novy"></p>');
  });
});

test.describe('vložení souboru ze schránky', () => {
  test('obrázek ze schránky projde adaptérem', async ({ page }) => {
    await mount(page, '<p>t</p>');
    await page.evaluate(() => {
      (window as any).uploadStub = (file: File) => Promise.resolve('/uploads/' + file.name);
    });
    await caret(page, 0, 1);

    await page.evaluate((base64) => {
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const file = new File([bytes], 'ze-schranky.png', { type: 'image/png' });

      const dt = new DataTransfer();
      dt.items.add(file);
      (window as any).ed.root.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, PIXEL);

    await expect.poll(() => html(page)).toContain('src="/uploads/ze-schranky.png"');
  });
});
