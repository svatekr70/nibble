import { expect, test } from '@playwright/test';
import { CONTENT, caret, html, mount } from './helpers.js';

test.describe('placeholder', () => {
  test('prázdný editor ukáže nápovědu, text ji schová', async ({ page }) => {
    await mount(page, '', { placeholder: 'Text poznámky…' });
    await expect(page.locator(CONTENT)).toHaveClass(/nb-empty/);
    await expect(page.locator(CONTENT)).toHaveAttribute('data-placeholder', 'Text poznámky…');

    await caret(page, 0, 0);
    await page.keyboard.type('a');
    await expect(page.locator(CONTENT)).not.toHaveClass(/nb-empty/);
  });

  test('po smazání všeho se nápověda vrátí', async ({ page }) => {
    await mount(page, '<p>ab</p>', { placeholder: 'Piš' });
    await caret(page, 0, 2);
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await expect(page.locator(CONTENT)).toHaveClass(/nb-empty/);
  });

  test('nápověda není v uloženém HTML', async ({ page }) => {
    await mount(page, '', { placeholder: 'Piš' });
    expect(await html(page)).not.toContain('Piš');
  });

  test('převezme se z textarey', async ({ page }) => {
    await page.goto('/e2e.html');
    await page.waitForFunction(() => (window as any).ready === true);
    const value = await page.evaluate(async () => {
      const ta = document.createElement('textarea');
      ta.placeholder = 'Z textarey';
      document.getElementById('host')!.replaceChildren(ta);
      const { Nibble } = await import('/dist/core/src/index.js' as any);
      const ed = await Nibble.create({ target: ta, autosave: false });
      return ed.root.dataset.placeholder;
    });
    expect(value).toBe('Z textarey');
  });
});
