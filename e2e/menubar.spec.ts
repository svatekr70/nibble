import { expect, test } from '@playwright/test';
import { caret, html, mount, select } from './helpers.js';

async function openMenu(page: import('@playwright/test').Page, label: string) {
  await page.locator('.nb-menubar-item', { hasText: label }).click();
  await page.locator('.nb-panel').first().waitFor();
}

test.describe('nabídkový pruh', () => {
  test('má očekávané nabídky', async ({ page }) => {
    await mount(page, '<p>text</p>');
    const labels = await page.locator('.nb-menubar-item').allTextContents();
    expect(labels).toEqual(['Úpravy', 'Zobrazit', 'Vložit', 'Formát', 'Tabulka', 'Nástroje']);
  });

  test('kliknutí rozbalí a další zavře', async ({ page }) => {
    await mount(page, '<p>text</p>');
    const trigger = page.locator('.nb-menubar-item', { hasText: 'Formát' });

    await trigger.click();
    await expect(page.locator('.nb-panel')).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await trigger.click();
    await expect(page.locator('.nb-panel')).toHaveCount(0);
  });

  test('položka spustí příkaz', async ({ page }) => {
    await mount(page, '<p>abcdef</p>');
    await select(page, 0, 1, 4);
    await openMenu(page, 'Formát');
    await page.locator('.nb-panel-label', { hasText: /^Tučně$/ }).click();

    await expect.poll(() => html(page)).toBe('<p>a<strong>bcd</strong>ef</p>');
  });

  test('zkratka je vidět u položky', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await openMenu(page, 'Formát');

    const row = page.locator('.nb-panel-item', { hasText: 'Tučně' });
    await expect(row.locator('.nb-panel-hint')).toHaveText('Ctrl+B');
  });

  test('nedostupná položka je zšedlá a nic neudělá', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await caret(page, 0, 1);
    await openMenu(page, 'Úpravy');

    const row = page.locator('.nb-panel-item', { hasText: 'Zpět' });
    await expect(row).toHaveAttribute('aria-disabled', 'true');

    // Playwright na aria-disabled prvek neklikne, tak událost pošleme přímo —
    // jde o to ověřit, že položka opravdu nic neudělá.
    await row.dispatchEvent('click');
    expect(await html(page)).toBe('<p>text</p>');
  });

  test('kliknutí mimo nabídku ji zavře', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await openMenu(page, 'Vložit');
    await page.mouse.click(5, 400);
    await expect(page.locator('.nb-panel')).toHaveCount(0);
  });
});

test.describe('podnabídky', () => {
  test('šipka označuje položku s podnabídkou', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await openMenu(page, 'Formát');

    const row = page.locator('.nb-panel-item', { hasText: 'Zarovnání' });
    await expect(row).toHaveAttribute('aria-haspopup', 'true');
    await expect(row.locator('.nb-panel-hint')).toHaveText('›');
  });

  test('najetí myší podnabídku otevře', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await openMenu(page, 'Formát');
    await page.locator('.nb-panel-label', { hasText: 'Zarovnání' }).hover();

    await expect(page.locator('.nb-panel')).toHaveCount(2);
    await expect(page.locator('.nb-panel').nth(1).locator('.nb-panel-label').first())
      .toHaveText('Zarovnat vlevo');
  });

  test('položka z podnabídky funguje', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await caret(page, 0, 2);
    await openMenu(page, 'Formát');
    await page.locator('.nb-panel-label', { hasText: 'Zarovnání' }).hover();
    await page.locator('.nb-panel').nth(1)
      .locator('.nb-panel-label', { hasText: 'Zarovnat na střed' }).click();

    await expect.poll(() => html(page)).toBe('<p style="text-align: center;">text</p>');
  });

  test('tabulková podnabídka nabízí operace s řádkem', async ({ page }) => {
    await mount(page, '<table><tbody><tr><td>a</td></tr></tbody></table>');
    await openMenu(page, 'Tabulka');
    // Popisek, ne celá položka — ta nese ještě šipku podnabídky.
    await page.locator('.nb-panel-label', { hasText: /^Řádek$/ }).hover();

    const labels = await page.locator('.nb-panel').nth(1)
      .locator('.nb-panel-label').allTextContents();
    expect(labels).toContain('Přidat řádek pod');
    expect(labels).toContain('Smazat řádek');
  });
});

test.describe('nabídka nenabízí, co neexistuje', () => {
  test('bez pluginů zmizí i celé nabídky', async ({ page }) => {
    await page.goto('/e2e.html');
    await page.waitForFunction(() => (window as any).ready === true);
    await page.evaluate(() => (window as any).mount('<p>text</p>', { plugins: [] }));

    const labels = await page.locator('.nb-menubar-item').allTextContents();
    expect(labels).not.toContain('Tabulka');
    // Formát stojí na příkazech jádra, takže zůstane.
    expect(labels).toContain('Formát');
  });
});

test.describe('výběry si drží hodnotu', () => {
  test('druh bloku zůstane vidět i po odkliknutí z editoru', async ({ page }) => {
    await mount(page, '<h2>nadpis</h2>');
    await caret(page, 0, 2);
    await expect.poll(() => page.inputValue('.nb-select[data-control=blocks]')).toBe('h2');

    // Kliknutí mimo editor výběr zruší — hodnota má zůstat poslední známá.
    await page.mouse.click(5, 400);
    await expect.poll(() => page.inputValue('.nb-select[data-control=blocks]')).toBe('h2');
  });

  test('písmo zůstane vidět po odkliknutí', async ({ page }) => {
    await mount(page, '<p><span style="font-family: Georgia, serif;">abc</span></p>');
    await select(page, 0, 0, 3);
    await expect.poll(() =>
      page.locator('.nb-btn[data-control=fontfamily] .nb-btn-value').textContent()).toBe('Georgia');

    await page.mouse.click(5, 400);
    await expect.poll(() =>
      page.locator('.nb-btn[data-control=fontfamily] .nb-btn-value').textContent()).toBe('Georgia');
  });
});
