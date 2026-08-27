import { expect, test } from '@playwright/test';
import { html, mount } from './helpers.js';

/**
 * Záloha rozepsaného textu.
 *
 * Scénář, kvůli kterému featura vznikla: uživatel píše dvacet minut, omylem
 * obnoví stránku a přijde o všechno. Tady se to celé projde — od psaní přes
 * obnovení stránky po vrácení textu.
 */

const DRAFT_BAR = '.nb-draft';

/** Vyprázdní zálohy, ať test nezačíná v cizím stavu. */
async function clearDrafts(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('nibble:draft:')) localStorage.removeItem(key);
    }
  });
}

/** Napíše text a počká, až se stihne uložit. */
async function pisAPockej(page: import('@playwright/test').Page, text: string) {
  await page.evaluate(() => {
    const ed = (window as any).ed;
    const block = ed.root.children[0];
    ed.selection.collapseTo(block.firstChild ?? block, (block.textContent ?? '').length);
    ed.root.focus();
  });
  await page.keyboard.type(text);
  await expect.poll(() => page.evaluate(
    () => Object.keys(localStorage).filter((k) => k.startsWith('nibble:draft:')).length,
  )).toBeGreaterThan(0);
}

test.describe('záloha rozepsaného', () => {
  test('psaní se uloží do localStorage', async ({ page }) => {
    await mount(page, '<p>Z databaze.</p>');
    await clearDrafts(page);
    await pisAPockej(page, ' Rozepsane.');

    const saved = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.startsWith('nibble:draft:'))!;
      return JSON.parse(localStorage.getItem(key)!).html;
    });
    expect(saved).toBe('<p>Z databaze. Rozepsane.</p>');
  });

  test('po znovunačtení se nabídne obnova a obsah zůstane z databáze', async ({ page }) => {
    await mount(page, '<p>Z databaze.</p>');
    await clearDrafts(page);
    await pisAPockej(page, ' Rozepsane.');

    // Tohle je ten refresh, kvůli kterému featura vznikla.
    await mount(page, '<p>Z databaze.</p>');

    await expect(page.locator(DRAFT_BAR)).toBeVisible();
    await expect(page.locator(DRAFT_BAR)).toContainText('rozepsanou verzi');
    // Nabízí, neobnovuje — text z databáze zůstává, dokud uživatel nerozhodne.
    expect(await html(page)).toBe('<p>Z databaze.</p>');
  });

  test('Obnovit vrátí rozepsaný text', async ({ page }) => {
    await mount(page, '<p>Z databaze.</p>');
    await clearDrafts(page);
    await pisAPockej(page, ' Rozepsane.');
    await mount(page, '<p>Z databaze.</p>');

    await page.locator(DRAFT_BAR).getByText('Obnovit').click();

    expect(await html(page)).toBe('<p>Z databaze. Rozepsane.</p>');
    await expect(page.locator(DRAFT_BAR)).toHaveCount(0);
  });

  test('obnovení se dá vzít zpět', async ({ page }) => {
    await mount(page, '<p>Z databaze.</p>');
    await clearDrafts(page);
    await pisAPockej(page, ' Rozepsane.');
    await mount(page, '<p>Z databaze.</p>');
    await page.locator(DRAFT_BAR).getByText('Obnovit').click();

    await page.evaluate(() => (window as any).ed.exec('undo'));
    expect(await html(page)).toBe('<p>Z databaze.</p>');
  });

  test('Zahodit zálohu smaže a znovu se nenabídne', async ({ page }) => {
    await mount(page, '<p>Z databaze.</p>');
    await clearDrafts(page);
    await pisAPockej(page, ' Rozepsane.');
    await mount(page, '<p>Z databaze.</p>');

    await page.locator(DRAFT_BAR).getByText('Zahodit').click();
    await expect(page.locator(DRAFT_BAR)).toHaveCount(0);

    expect(await page.evaluate(
      () => Object.keys(localStorage).filter((k) => k.startsWith('nibble:draft:')).length,
    )).toBe(0);

    await mount(page, '<p>Z databaze.</p>');
    await expect(page.locator(DRAFT_BAR)).toHaveCount(0);
  });

  test('bez psaní se nenabízí nic', async ({ page }) => {
    await mount(page, '<p>Z databaze.</p>');
    await clearDrafts(page);
    await mount(page, '<p>Z databaze.</p>');

    await expect(page.locator(DRAFT_BAR)).toHaveCount(0);
  });

  test('vrácení změn zpět zálohu zase smaže', async ({ page }) => {
    await mount(page, '<p>Z databaze.</p>');
    await clearDrafts(page);
    await pisAPockej(page, ' Rozepsane.');

    await page.evaluate(() => (window as any).ed.exec('undo'));
    await expect.poll(() => page.evaluate(
      () => Object.keys(localStorage).filter((k) => k.startsWith('nibble:draft:')).length,
    )).toBe(0);
  });

  test('autosave: false zálohování vypne', async ({ page }) => {
    await page.goto('/e2e.html');
    await page.waitForFunction(() => (window as any).ready === true);
    await page.evaluate(() => (window as any).mount('<p>Z databaze.</p>', { autosave: false }));
    await clearDrafts(page);
    await pisAPockej(page, ' Rozepsane.').catch(() => { /* nic se neuloží, čekání vyprší */ });

    expect(await page.evaluate(() => (window as any).ed.autosave)).toBe(null);
    expect(await page.evaluate(
      () => Object.keys(localStorage).filter((k) => k.startsWith('nibble:draft:')).length,
    )).toBe(0);
  });

  test('vypnutí v Nastavení editoru zálohování zastaví', async ({ page }) => {
    await mount(page, '<p>Z databaze.</p>');
    await clearDrafts(page);

    await page.evaluate(() => (window as any).ed.ui.get('settings').onAction((window as any).ed));
    await page.locator('.nb-dialog[open]').waitFor();
    await page.locator('.nb-dialog label', { hasText: 'Pamatovat si rozepsané' })
      .locator('input[type=checkbox]').uncheck();
    await page.locator('.nb-dialog .nb-dialog-btn-primary').click();
    await page.locator('.nb-dialog').waitFor({ state: 'detached' });

    await page.evaluate(() => {
      const ed = (window as any).ed;
      const block = ed.root.children[0];
      ed.selection.collapseTo(block.firstChild, (block.textContent ?? '').length);
      ed.root.focus();
    });
    await page.keyboard.type(' Rozepsane.');
    await page.waitForTimeout(1200);

    expect(await page.evaluate(
      () => Object.keys(localStorage).filter((k) => k.startsWith('nibble:draft:')).length,
    )).toBe(0);
  });

  test('vypnutí zahodí i zálohu, která už byla uložená', async ({ page }) => {
    await mount(page, '<p>Z databaze.</p>');
    await clearDrafts(page);
    await pisAPockej(page, ' Rozepsane.');

    await page.evaluate(() => (window as any).ed.ui.get('settings').onAction((window as any).ed));
    await page.locator('.nb-dialog[open]').waitFor();
    await page.locator('.nb-dialog label', { hasText: 'Pamatovat si rozepsané' })
      .locator('input[type=checkbox]').uncheck();
    await page.locator('.nb-dialog .nb-dialog-btn-primary').click();

    await expect.poll(() => page.evaluate(
      () => Object.keys(localStorage).filter((k) => k.startsWith('nibble:draft:')).length,
    )).toBe(0);
  });

  test('vypnuté konfigurací se v nastavení nedá zapnout', async ({ page }) => {
    await page.goto('/e2e.html');
    await page.waitForFunction(() => (window as any).ready === true);
    await page.evaluate(() => (window as any).mount('<p>Text</p>', { autosave: false }));

    await page.evaluate(() => (window as any).ed.ui.get('settings').onAction((window as any).ed));
    await page.locator('.nb-dialog[open]').waitFor();

    const box = page.locator('.nb-dialog label', { hasText: 'Pamatovat si rozepsané' })
      .locator('input[type=checkbox]');
    await expect(box).toBeDisabled();
    await expect(box).not.toBeChecked();
  });
});

test.describe('verze v nastavení', () => {
  test('dialog ukazuje verzi', async ({ page }) => {
    await mount(page, '<p>Text</p>');
    await page.evaluate(() => (window as any).ed.ui.get('settings').onAction((window as any).ed));
    await page.locator('.nb-dialog[open]').waitFor();

    const version = page.locator('.nb-dialog-version');
    await expect(version).toBeVisible();
    // Verzi dosazuje bundler z package.json, takže se nemá kde rozejít.
    await expect(version).toHaveText(/^Nibble \d+\.\d+\.\d+/);
  });

  test('verze sedí s package.json', async ({ page }) => {
    await mount(page, '<p>Text</p>');
    const version = await page.evaluate(async () => {
      const core = await import('/dist/core/src/index.js');
      return (core as { VERSION: string }).VERSION;
    });

    expect(version).toBe(process.env.npm_package_version ?? version);
    expect(version).not.toBe('dev');
  });
});
