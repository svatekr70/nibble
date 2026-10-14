import { expect, test, type Page } from '@playwright/test';
import { CONTENT, caret, html, mount } from './helpers.js';

const BLOCK = '<details><summary>Otázka</summary><p>Odpověď</p></details>';

/** Kurzor do textu nadpisu na zadaný offset. */
async function atSummary(page: Page, offset: number): Promise<void> {
  await page.evaluate((o) => {
    const ed = (window as any).ed;
    ed.selection.collapseTo(ed.root.querySelector('summary').firstChild, o);
    ed.root.focus();
  }, offset);
}

test.describe('rozbalovací blok', () => {
  test('obsah sbaleného bloku je v editoru vidět', async ({ page }) => {
    await mount(page, BLOCK);
    await expect(page.locator(`${CONTENT} details p`)).toBeVisible();
  });

  test('klik na nadpis nezmění HTML', async ({ page }) => {
    // Rozbalený blok: bez zábrany by ho klik prohlížeče sbalil a `open` zmizel.
    const open = '<details open=""><summary>Otázka</summary><p>Odpověď</p></details>';
    await mount(page, open);
    await page.locator(`${CONTENT} summary`).click();
    expect(await page.evaluate(() => (window as any).ed.root.querySelector('details').open)).toBe(true);
    expect(await html(page)).toBe(open);
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

  test('Delete na konci nadpisu nevlije obsah do nadpisu', async ({ page }) => {
    await mount(page, BLOCK);
    await atSummary(page, 6);
    await page.keyboard.press('Delete');
    expect(await html(page)).toBe(BLOCK);
  });

  test('Enter v nadpisu nad seznamem skočí do první položky', async ({ page }) => {
    await mount(page, '<details><summary>N</summary><ul><li>a</li></ul></details>');
    await atSummary(page, 1);
    await page.keyboard.press('Enter');
    await page.keyboard.type('Z');
    expect(await html(page)).toBe('<details><summary>N</summary><ul><li>Za</li></ul></details>');
  });

  test('výběr od nadpisu do obsahu nepřestěhuje nadpis do nového bloku', async ({ page }) => {
    await mount(page, BLOCK);
    await page.evaluate(() => {
      const ed = (window as any).ed;
      const range = document.createRange();
      range.setStart(ed.root.querySelector('summary').firstChild, 2);
      range.setEnd(ed.root.querySelector('details p').firstChild, 3);
      ed.selection.setRange(range);
      ed.root.focus();
      ed.exec('details');
    });
    expect(await html(page)).toBe(
      '<details><summary>Otázka</summary><details><summary>Nadpis</summary><p>Odpověď</p></details></details>',
    );
  });

  test('po zrušení načteného bloku je kurzor v prvním odstavci', async ({ page }) => {
    await mount(page, '<details>\n<summary>Otázka</summary>\n<p>Odpověď</p>\n</details>');
    await caret(page, 0, 1);
    await page.locator('.nb-context .nb-btn[data-control=undetails]').click();
    await page.keyboard.type('Z');
    expect(await html(page)).toBe('\n<p>ZOtázka</p>\n<p>Odpověď</p>\n');
  });
});

test.describe('blokové příkazy nadpis rozbalovacího bloku nechají být', () => {
  for (const [label, command, arg] of [
    ['nadpis h2', 'formatBlock', 'h2'],
    ['citace přes formatBlock', 'formatBlock', 'blockquote'],
    ['citace', 'blockquote', undefined],
    ['odrážky', 'bullist', undefined],
    ['číslování', 'numlist', undefined],
    ['úkoly', 'tasklist', undefined],
    ['oddělovač', 'hr', undefined],
  ] as const) {
    test(label, async ({ page }) => {
      await mount(page, BLOCK);
      await atSummary(page, 2);
      const done = await page.evaluate(([c, a]) => (window as any).ed.exec(c, a), [command, arg] as const);
      expect(done).toBe(false);
      expect(await html(page)).toBe(BLOCK);
    });
  }
});

