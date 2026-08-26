import { expect, test } from '@playwright/test';
import { caret, html, mount } from './helpers.js';

/**
 * Mřížka, kategorie a klávesnice. Hledání samo se testuje ve vitestu —
 * tady jde o to, že se vybrané opravdu dostane do obsahu.
 */

const DIALOG = '.nb-dialog[open]';
const GRID = '.nb-glyphs-grid';
const TILE = '.nb-glyphs-tile';

async function openPicker(page: import('@playwright/test').Page): Promise<void> {
  await mount(page, '<p>Ahoj</p>');
  await caret(page, 0, 4);
  await page.locator('.nb-toolbar .nb-btn[data-control=emoji]').click();
  await page.locator(DIALOG).waitFor();
}

test.describe('emotikony', () => {
  test('kliknutí na políčko vloží znak ke kurzoru', async ({ page }) => {
    await openPicker(page);
    await page.locator(TILE, { hasText: '🍕' }).click();

    await expect(page.locator(DIALOG)).toHaveCount(0);
    await expect.poll(() => html(page)).toContain('Ahoj🍕');
  });

  test('hledání zúží mřížku a Enter vloží první nález', async ({ page }) => {
    await openPicker(page);
    await page.locator('.nb-glyphs-search .nb-input').fill('pivo');

    await expect(page.locator(`${GRID} ${TILE}`)).toHaveCount(1);
    await page.locator('.nb-glyphs-search .nb-input').press('Enter');

    await expect.poll(() => html(page)).toContain('Ahoj🍺');
  });

  test('hledání funguje i bez diakritiky', async ({ page }) => {
    await openPicker(page);
    await page.locator('.nb-glyphs-search .nb-input').fill('zirafa');
    await expect(page.locator(`${GRID} ${TILE}`).first()).toHaveText('🦒');
  });

  test('kategorie ukáže jen svoje a zahodí dotaz', async ({ page }) => {
    await openPicker(page);
    await page.locator('.nb-glyphs-search .nb-input').fill('pivo');

    await page.locator('.nb-glyphs-cat', { hasText: 'Vlajky' }).click();
    await expect(page.locator('.nb-glyphs-search .nb-input')).toHaveValue('');

    const tiles = page.locator(`${GRID} ${TILE}`);
    await expect(tiles.first()).toHaveText('🏳️');
    await expect(tiles).toHaveCount(40);
  });

  test('hledání přepne kategorii zpátky na Vše', async ({ page }) => {
    await openPicker(page);
    await page.locator('.nb-glyphs-cat', { hasText: 'Vlajky' }).click();
    await page.locator('.nb-glyphs-search .nb-input').fill('pizza');

    // Zvýrazněná kategorie, ve které výsledky nejsou, by lhala.
    await expect(page.locator('.nb-glyphs-cat[aria-selected=true]')).toHaveText('Vše');
  });

  test('nenajde-li se nic, řekne to', async ({ page }) => {
    await openPicker(page);
    await page.locator('.nb-glyphs-search .nb-input').fill('qwertzuiop');

    await expect(page.locator(`${GRID} ${TILE}`)).toHaveCount(0);
    await expect(page.locator('.nb-glyphs-empty')).toBeVisible();
  });

  test('šipkou dolů se z hledání vejde do mřížky a Enter vloží', async ({ page }) => {
    await openPicker(page);
    const search = page.locator('.nb-glyphs-search .nb-input');
    await search.fill('pizza');
    await search.press('ArrowDown');

    await expect(page.locator(`${TILE}[aria-selected=true]`)).toBeFocused();
    await page.keyboard.press('Enter');

    await expect.poll(() => html(page)).toContain('Ahoj🍕');
  });

  test('pod mřížkou stojí, co je vybrané', async ({ page }) => {
    await openPicker(page);
    await page.locator('.nb-glyphs-search .nb-input').fill('zirafa');
    await expect(page.locator('.nb-glyphs-caption')).toHaveText('žirafa');
  });

  test('Zavřít nevloží nic', async ({ page }) => {
    await openPicker(page);
    await page.locator('.nb-dialog-btn', { hasText: 'Zavřít' }).click();

    await expect(page.locator(DIALOG)).toHaveCount(0);
    await expect.poll(() => html(page)).toBe('<p>Ahoj</p>');
  });

  test('vložený emotikon přežije uložení v celku', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    // Vlajka je dva kódové body a rodina čtyři — serializér po nich prochází
    // po kódových bodech, takže se nesmí rozpadnout.
    await page.evaluate(() => (window as any).ed.exec('emoji', { char: '🇨🇿' }));
    await page.evaluate(() => (window as any).ed.exec('emoji', { char: '👩‍💻' }));

    await expect.poll(() => html(page)).toContain('🇨🇿👩‍💻');
  });

  test('příkaz najde emotikon i podle názvu', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.evaluate(() => (window as any).ed.exec('emoji', 'jednorozec'));
    await expect.poll(() => html(page)).toContain('🦄');
  });

  test('neznámý název nevloží nic', async ({ page }) => {
    await mount(page, '<p>Ahoj</p>');
    await caret(page, 0, 4);
    const ok = await page.evaluate(() =>
      (window as any).ed.exec('emoji', 'qwertzuiop'));

    expect(ok).toBe(false);
    await expect.poll(() => html(page)).toBe('<p>Ahoj</p>');
  });
});
