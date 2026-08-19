import { expect, test } from '@playwright/test';
import { caret, html, mount, select } from './helpers.js';

/**
 * Vyplní a odešle otevřený dialog.
 *
 * Po zavření se čeká na odpojení z DOMu. Příkaz se totiž spouští až v pokračování
 * za `await ui.dialog(...)`, takže hned po kliknutí obsah ještě změněný není —
 * výsledek se proto níž ověřuje přes `expect.poll`.
 */
async function fillDialog(
  page: import('@playwright/test').Page,
  values: Record<string, string>,
): Promise<void> {
  await page.locator('.nb-dialog[open]').waitFor();
  for (const [name, value] of Object.entries(values)) {
    const field = page.locator(`.nb-dialog [name="${name}"]`);
    if (await field.evaluate((el) => el.tagName) === 'SELECT') await field.selectOption(value);
    else await field.fill(value);
  }
  await page.locator('.nb-dialog-btn-primary').click();
  await page.locator('.nb-dialog').waitFor({ state: 'detached' });
}

test.describe('vložení odkazu', () => {
  test('obalí vybraný text', async ({ page }) => {
    await mount(page, '<p>klikni sem prosim</p>');
    await select(page, 0, 7, 10);
    await page.locator('.nb-toolbar .nb-btn[data-control=link]').click();
    await fillDialog(page, { href: 'https://example.com/a' });
    await expect.poll(() => html(page)).toBe(
      '<p>klikni <a href="https://example.com/a">sem</a> prosim</p>');
  });

  test('bez výběru vloží odkaz s vlastním textem', async ({ page }) => {
    await mount(page, '<p>text </p>');
    await caret(page, 0, 5);
    await page.locator('.nb-toolbar .nb-btn[data-control=link]').click();
    await fillDialog(page, { href: 'https://example.com/b', text: 'odkaz' });
    await expect.poll(() => html(page)).toBe(
      '<p>text <a href="https://example.com/b">odkaz</a></p>');
  });

  test('nová karta dostane rel="noopener"', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    await select(page, 0, 0, 3);
    await page.locator('.nb-toolbar .nb-btn[data-control=link]').click();
    await fillDialog(page, { href: 'https://example.com/c', target: '_blank' });
    await expect.poll(() => html(page)).toBe(
      '<p><a href="https://example.com/c" target="_blank" rel="noopener">abc</a></p>');
  });

  test('adresu nepřepisuje na relativní', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    await select(page, 0, 0, 3);
    await page.locator('.nb-toolbar .nb-btn[data-control=link]').click();
    // TinyMCE by z tohohle udělal '../neco' a odkaz v e-mailu by nikam nevedl.
    await fillDialog(page, { href: 'http://localhost:4321/neco' });
    await expect.poll(() => html(page)).toContain('href="http://localhost:4321/neco"');
  });

  test('zrušený dialog obsah nemění', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    await select(page, 0, 0, 3);
    await page.locator('.nb-toolbar .nb-btn[data-control=link]').click();
    await page.locator('.nb-dialog[open]').waitFor();
    await page.keyboard.press('Escape');
    await expect.poll(() => html(page)).toBe(
      '<p>abc</p>');
  });

  test('javascript: adresu odmítne', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    await select(page, 0, 0, 3);
    const ok = await page.evaluate(() =>
      (window as any).ed.exec('link', { href: 'javascript:alert(1)' }));
    expect(ok).toBe(false);
    expect(await html(page)).toBe('<p>abc</p>');
  });

  test('Ctrl+K otevře dialog', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    await select(page, 0, 0, 3);
    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.locator('.nb-dialog[open]')).toBeVisible();
  });
});

test.describe('úprava a zrušení odkazu', () => {
  test('kurzor v odkazu ukáže plovoucí lištu', async ({ page }) => {
    await mount(page, '<p><a href="https://example.com/a">odkaz</a></p>');
    await caret(page, 0, 2);
    await expect(page.locator('.nb-context')).toBeVisible();
    await expect(page.locator('.nb-context .nb-btn[data-control=unlink]')).toBeVisible();
  });

  test('mimo odkaz je plovoucí lišta schovaná', async ({ page }) => {
    await mount(page, '<p><a href="https://example.com/a">odkaz</a> mimo</p>');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      ed.selection.collapseTo(ed.root.querySelector('p')!.lastChild!, 3);
      ed.root.focus();
    });
    await expect(page.locator('.nb-context')).toBeHidden();
  });

  test('zrušení odkazu nechá text', async ({ page }) => {
    await mount(page, '<p><a href="https://example.com/a">odkaz</a></p>');
    await caret(page, 0, 2);
    await page.locator('.nb-context .nb-btn[data-control=unlink]').click();
    expect(await html(page)).toBe('<p>odkaz</p>');
  });

  test('dialog předvyplní stávající hodnoty', async ({ page }) => {
    await mount(page, '<p><a href="https://example.com/a" title="popis">odkaz</a></p>');
    await caret(page, 0, 2);
    await page.locator('.nb-context .nb-btn[data-control=link]').click();
    await page.locator('.nb-dialog[open]').waitFor();
    await expect(page.locator('.nb-dialog [name=href]')).toHaveValue('https://example.com/a');
    await expect(page.locator('.nb-dialog [name=title]')).toHaveValue('popis');
    await expect(page.locator('.nb-dialog [name=text]')).toHaveValue('odkaz');
  });

  test('úprava přepíše atributy, nevloží druhý odkaz', async ({ page }) => {
    await mount(page, '<p><a href="https://example.com/a">odkaz</a></p>');
    await caret(page, 0, 2);
    await page.locator('.nb-context .nb-btn[data-control=link]').click();
    await fillDialog(page, { href: 'https://example.com/zmena' });
    await expect.poll(() => html(page)).toBe(
      '<p><a href="https://example.com/zmena">odkaz</a></p>');
  });

  test('odkaz uvnitř odkazu nevznikne', async ({ page }) => {
    await mount(page, '<p>pred <a href="https://example.com/a">odkaz</a> po</p>');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      const p = ed.root.querySelector('p')!;
      const range = document.createRange();
      range.setStart(p.firstChild!, 0);
      range.setEnd(p.lastChild!, 3);
      ed.selection.setRange(range);
      ed.root.focus();
    });
    await page.evaluate(() =>
      (window as any).ed.exec('link', { href: 'https://example.com/vse' }));
    const out = await html(page);
    expect((out.match(/<a /g) ?? []).length).toBe(1);
    expect(out).toContain('https://example.com/vse');
  });
});

test.describe('dialog jako takový', () => {
  test('Escape zavře a vrátí null', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    const result = await page.evaluate(async () => {
      const ed = (window as any).ed;
      const promise = ed.ui.dialog({ title: 'Test', fields: [{ type: 'text', name: 'x' }] });
      await new Promise((r) => setTimeout(r, 50));
      document.querySelector('dialog')!.close();
      return await promise;
    });
    expect(result).toBeNull();
  });

  test('povinné pole brání odeslání', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    await caret(page, 0, 1);
    await page.locator('.nb-toolbar .nb-btn[data-control=link]').click();
    await page.locator('.nb-dialog[open]').waitFor();
    await page.locator('.nb-dialog-btn-primary').click();
    await expect(page.locator('.nb-dialog[open]')).toBeVisible();
  });

  test('fokus začíná v prvním poli', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    await caret(page, 0, 1);
    await page.locator('.nb-toolbar .nb-btn[data-control=link]').click();
    await page.locator('.nb-dialog[open]').waitFor();
    await expect.poll(() =>
      page.evaluate(() => (document.activeElement as HTMLInputElement)?.name),
    ).toBe('href');
  });
});
