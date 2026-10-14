import { expect, test } from '@playwright/test';
import { caret, html, mount, select } from './helpers.js';

const MENU = '.nb-caret-menu:not([hidden])';

test.describe('lomítkové příkazy', () => {
  test('/ na prázdném řádku otevře nabídku a fokus zůstane v editoru', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('/');
    await expect(page.locator(MENU)).toBeVisible();
    expect(await page.evaluate(() => document.activeElement === (window as any).ed.root)).toBe(true);
  });

  test('psaní filtruje, Enter vybere', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('/nad');
    await expect(page.locator(`${MENU} .nb-menu-item`)).toHaveCount(3);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Titulek');
    expect(await html(page)).toBe('<h2>Titulek</h2>');
  });

  test('Enter při otevřené nabídce nezaloží odstavec ani čáru', async ({ page }) => {
    // Enter poslouchají i markdownové zkratky (`---` + Enter) a jádro.
    // Nabídka ho musí dostat první a dál ho nepustit.
    await mount(page, '<p>---</p><p><br></p>');
    await caret(page, 1, 0);
    await page.keyboard.type('/cit');
    await page.keyboard.press('Enter');
    await expect(page.locator(MENU)).toHaveCount(0);
    await page.keyboard.type('x');
    expect(await html(page)).toBe('<p>---</p><blockquote><p>x</p></blockquote>');
  });

  test('Ctrl+Z po výběru vrátí /dotaz jedním krokem', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('/cit');
    await page.keyboard.press('Enter');
    await page.keyboard.press('ControlOrMeta+z');
    expect(await html(page)).toBe('<p>/cit</p>');
  });

  test('položka s dialogem zapíše smazání /dotazu jako vlastní krok', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('/obr');
    await page.keyboard.press('Enter');
    await expect(page.locator('.nb-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.nb-dialog')).toHaveCount(0);
    expect(await html(page)).toBe('<p><br></p>');
    await page.keyboard.press('ControlOrMeta+z');
    expect(await html(page)).toBe('<p>/obr</p>');
  });

  test('Escape zavře nabídku a text nechá', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('/nad');
    await page.keyboard.press('Escape');
    await expect(page.locator(MENU)).toHaveCount(0);
    await page.keyboard.type('x');
    await expect(page.locator(MENU)).toHaveCount(0);
    expect(await html(page)).toBe('<p>/nadx</p>');
  });

  test('víceslovný popisek se dá dopsat i s mezerou', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('/nadpis 2');
    await expect(page.locator(`${MENU} .nb-menu-item`)).toHaveCount(1);
    await page.keyboard.press('Enter');
    await page.keyboard.type('T');
    expect(await html(page)).toBe('<h2>T</h2>');
  });

  test('mezera za dotazem bez shody nabídku zavře', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('/xyz');
    await expect(page.locator(MENU)).toHaveCount(0);
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await expect(page.locator(MENU)).toBeVisible();
    await page.keyboard.type('xyz ');
    await expect(page.locator(MENU)).toHaveCount(0);
    expect(await html(page)).toBe('<p>/xyz </p>');
  });

  test('mezera hned za lomítkem nabídku zavře', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('/');
    await expect(page.locator(MENU)).toBeVisible();
    await page.keyboard.type(' ');
    await expect(page.locator(MENU)).toHaveCount(0);
  });

  test('mezera bez shody nabídku zavře', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('/a b');
    await expect(page.locator(MENU)).toHaveCount(0);
  });

  test('lomítko uprostřed textu nic neotevře', async ({ page }) => {
    await mount(page, '<p>a</p>');
    await caret(page, 0, 1);
    await page.keyboard.type('/');
    await expect(page.locator(MENU)).toHaveCount(0);
  });

  test('v nadpisu rozbalovacího bloku se nabídka neotevře', async ({ page }) => {
    // Blokové příkazy nadpis odmítnou — výběr by jen smazal `/dotaz`.
    await mount(page, '<details open><summary>a</summary><p>b</p></details>');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      ed.selection.collapseTo(ed.root.querySelector('summary').firstChild, 0);
      ed.root.focus();
    });
    await page.keyboard.type('/');
    await expect(page.locator(MENU)).toHaveCount(0);
    expect(await html(page)).toBe('<details open=""><summary>/a</summary><p>b</p></details>');
  });

  test('klik myší vybere položku', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('/');
    await page.locator(`${MENU} .nb-menu-item`, { hasText: 'Odrážky' }).click();
    await page.keyboard.type('a');
    expect(await html(page)).toBe('<ul><li>a</li></ul>');
  });

  test('otevřená rozbalovací nabídka v liště nabídku u kurzoru nesmaže', async ({ page }) => {
    // `openMenu` maže všechny `.nb-menu` v dokumentu; nabídka u kurzoru
    // proto tu třídu nenosí a musí přežít.
    await mount(page, '<p>abc</p><p><br></p>');
    await select(page, 0, 0, 3);
    await page.locator('.nb-toolbar .nb-btn[data-control=fontfamily]').click();
    await page.locator('.nb-menu').waitFor();
    await page.keyboard.press('Escape');
    await caret(page, 1, 0);
    await page.keyboard.type('/');
    await expect(page.locator(MENU)).toBeVisible();
  });

  test('destroy nabídku odstraní ze stránky', async ({ page }) => {
    await mount(page, '<p><br></p>');
    expect(await page.locator('.nb-caret-menu').count()).toBe(1);
    await page.evaluate(() => (window as any).tb.destroy());
    expect(await page.locator('.nb-caret-menu').count()).toBe(0);
  });

  test('bez pluginu tabulek není v nabídce Tabulka', async ({ page }) => {
    await page.goto('/e2e.html');
    await page.waitForFunction(() => (window as any).ready === true);
    await page.evaluate(async () => {
      const { slash } = await import('/dist/plugins/src/index.js' as any);
      await (window as any).mount('<p><br></p>', { plugins: [slash] });
    });
    await caret(page, 0, 0);
    await page.keyboard.type('/');
    // Nabídka je otevřená (jinak by test prošel naprázdno), jen bez tabulky.
    await expect(page.locator(MENU)).toBeVisible();
    await expect(page.locator(`${MENU} .nb-menu-item`).first()).toBeVisible();
    await expect(page.locator(`${MENU} [data-value=table]`)).toHaveCount(0);
  });
});
