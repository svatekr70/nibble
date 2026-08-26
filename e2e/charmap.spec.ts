import { expect, test } from '@playwright/test';
import { caret, html, mount } from './helpers.js';

/**
 * Mřížka a klávesnice jsou společné s emotikony a testují se tam. Tady jde
 * o to, co je na mapě znaků jiné: sazba políček, kód pod mřížkou, neviditelné
 * znaky a tvar uloženého HTML.
 */

const DIALOG = '.nb-dialog[open]';
const TILE = '.nb-glyphs-tile';

async function openCharmap(page: import('@playwright/test').Page): Promise<void> {
  await mount(page, '<p>Ahoj</p>');
  await caret(page, 0, 4);
  await page.locator('.nb-toolbar .nb-btn[data-control=charmap]').click();
  await page.locator(DIALOG).waitFor();
}

test.describe('mapa znaků', () => {
  test('kliknutí vloží znak ke kurzoru', async ({ page }) => {
    await openCharmap(page);
    await page.locator('.nb-glyphs-search .nb-input').fill('copyright');
    await page.locator(TILE).first().click();

    await expect(page.locator(DIALOG)).toHaveCount(0);
    await expect.poll(() => html(page)).toContain('Ahoj©');
  });

  test('v dokumentu s entitami se z něj stane pojmenovaná entita', async ({ page }) => {
    // Cílový projekt má v uloženém obsahu entity a nový obsah má vypadat
    // stejně. Editor to pozná z dokumentu, který dostal — proto tenhle vstup.
    await page.goto('/e2e.html');
    await page.waitForFunction(() => (window as any).ready === true);
    await page.evaluate(() => (window as any).mount('<p>P&aacute;n</p>'));
    await caret(page, 0, 3);

    await page.evaluate(() => (window as any).ed.exec('charmap', 'copyright'));
    await expect.poll(() => html(page)).toContain('P&aacute;n&copy;');
  });

  test('pod mřížkou stojí název i kód znaku', async ({ page }) => {
    await openCharmap(page);
    await page.locator('.nb-glyphs-search .nb-input').fill('copyright');
    await expect(page.locator('.nb-glyphs-caption')).toHaveText('copyright · U+00A9');
  });

  test('pevná mezera má v mřížce náhradu, ale vloží se mezera', async ({ page }) => {
    await openCharmap(page);
    await page.locator('.nb-glyphs-search .nb-input').fill('pevna mezera');

    const tile = page.locator(TILE).first();
    await expect(tile).toHaveClass(/nb-glyphs-tile-stand-in/);
    await expect(tile).toHaveText('␣');

    await tile.click();
    // Pevná mezera se ukládá entitou vždycky — doslova zapsaná je k nerozeznání
    // od obyčejné mezery a nikdo by ji v obsahu nenašel.
    await expect.poll(() => html(page)).toContain('Ahoj&nbsp;');
  });

  test('znak jde najít podle kódu z dokumentace', async ({ page }) => {
    await openCharmap(page);
    await page.locator('.nb-glyphs-search .nb-input').fill('U+00BD');
    await expect(page.locator(TILE)).toHaveCount(1);
    await expect(page.locator(TILE)).toHaveText('½');
  });

  test('políčka se sázejí písmem obsahu, ne barevným písmem emoji', async ({ page }) => {
    await openCharmap(page);
    const font = await page.locator(TILE).first()
      .evaluate((el) => getComputedStyle(el).fontFamily);

    // V mapě znaků má být vidět přesně to, co se vloží do textu.
    expect(font).not.toContain('Emoji');
    expect(font).toContain('Georgia');
  });

  test('kategorie ukáže jen svoje', async ({ page }) => {
    await openCharmap(page);
    await page.locator('.nb-glyphs-cat', { hasText: 'Řecká abeceda' }).click();
    await expect(page.locator(TILE).first()).toHaveText('α');
  });

  test('typografické uvozovky jsou po ruce', async ({ page }) => {
    await openCharmap(page);
    await page.locator('.nb-glyphs-search .nb-input').fill('ceska uvozovka');
    await expect(page.locator(TILE).first()).toHaveText('„');
  });

  test('příkaz najde znak podle názvu', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.evaluate(() => (window as any).ed.exec('charmap', 'promile'));
    await expect.poll(() => html(page)).toContain('‰');
  });
});
