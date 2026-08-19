import { expect, test } from '@playwright/test';
import { caret, html, mount, select } from './helpers.js';

test.describe('formátování', () => {
  test('Ctrl+B obalí výběr', async ({ page }) => {
    await mount(page, '<p>abcdef</p>');
    await select(page, 0, 1, 4);
    await page.keyboard.press('ControlOrMeta+b');
    expect(await html(page)).toBe('<p>a<strong>bcd</strong>ef</p>');
  });

  test('opakované Ctrl+B formát zase sundá', async ({ page }) => {
    await mount(page, '<p>a<strong>bcd</strong>ef</p>');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      const strong = ed.root.querySelector('strong')!;
      const range = document.createRange();
      range.selectNodeContents(strong);
      ed.selection.setRange(range);
      ed.root.focus();
    });
    await page.keyboard.press('ControlOrMeta+b');
    expect(await html(page)).toBe('<p>abcdef</p>');
  });

  test('formát bez výběru se předepíše dalšímu znaku', async ({ page }) => {
    await mount(page, '<p>ab</p>');
    await caret(page, 0, 2);
    await page.keyboard.press('ControlOrMeta+b');
    await page.keyboard.type('c');
    expect(await html(page)).toBe('<p>ab<strong>c</strong></p>');
  });

  test('tlačítko v liště formátuje stejně jako zkratka', async ({ page }) => {
    await mount(page, '<p>abcdef</p>');
    await select(page, 0, 0, 3);
    await page.locator('.nb-btn[data-control=italic]').click();
    expect(await html(page)).toBe('<p><em>abc</em>def</p>');
  });
});

test.describe('stav lišty', () => {
  test('aria-pressed sleduje formát pod kurzorem', async ({ page }) => {
    await mount(page, '<p><strong>tučné</strong> běžné</p>');
    const bold = page.locator('.nb-btn[data-control=bold]');

    await caret(page, 0, 2);
    await expect.poll(() => bold.getAttribute('aria-pressed')).toBe('true');

    await page.evaluate(() => {
      const ed = (window as any).ed;
      const last = ed.root.children[0].lastChild!;
      ed.selection.collapseTo(last, 3);
      ed.root.focus();
    });
    await expect.poll(() => bold.getAttribute('aria-pressed')).toBe('false');
  });

  test('zpět je nedostupné, dokud není co vracet — ale zůstává dosažitelné', async ({ page }) => {
    await mount(page, '<p>text</p>');
    const undo = page.locator('.nb-btn[data-control=undo]');

    await expect(undo).toHaveAttribute('aria-disabled', 'true');

    // Podstatné je, že se na něj dá dostat klávesnicí. Playwright bere
    // aria-disabled jako vypnuto, takže se ptáme přímo na fokus.
    await page.evaluate(() => {
      (document.querySelector('.nb-btn[data-control=undo]') as HTMLElement).focus();
    });
    await expect.poll(() =>
      page.evaluate(() => (document.activeElement as HTMLElement)?.dataset.control),
    ).toBe('undo');

    await caret(page, 0, 4);
    await page.keyboard.type('!');
    await expect(undo).toHaveAttribute('aria-disabled', 'false');
  });

  test('nedostupné tlačítko po stisku nic neudělá', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await page.evaluate(() => {
      (document.querySelector('.nb-btn[data-control=undo]') as HTMLElement).focus();
    });
    await page.keyboard.press('Enter');
    expect(await html(page)).toBe('<p>text</p>');
  });

  test('v režimu jen pro čtení jsou prvky vypnuté', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await page.evaluate(() => (window as any).ed.setMode('readonly'));
    await expect(page.locator('.nb-btn[data-control=bold]')).toBeDisabled();
    await expect(page.locator('.nb-select[data-control=blocks]')).toBeDisabled();
  });
});

test.describe('ovládání klávesnicí', () => {
  test('lišta má jediné zastavení tabem', async ({ page }) => {
    await mount(page, '<p>text</p>');
    const tabbable = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.nb-toolbar [data-control]'))
        .filter((el) => (el as HTMLElement).tabIndex === 0).length);
    expect(tabbable).toBe(1);
  });

  test('šipky posouvají fokus mezi prvky lišty', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await page.locator('.nb-btn[data-control=undo]').focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() =>
      page.evaluate(() => (document.activeElement as HTMLElement)?.dataset.control),
    ).toBe('redo');

    await page.keyboard.press('ArrowLeft');
    await expect.poll(() =>
      page.evaluate(() => (document.activeElement as HTMLElement)?.dataset.control),
    ).toBe('undo');
  });
});

test.describe('bezpečnost', () => {
  test('skript a on* atributy se při načtení zahodí', async ({ page }) => {
    await mount(page, '<p onclick="zlo()">text</p><script>zlo()</script>');
    const out = await html(page);
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('<script');
  });

  test('javascript: v odkazu se zahodí, odkaz zůstane', async ({ page }) => {
    await mount(page, '<p><a href="javascript:zlo()">odkaz</a></p>');
    const out = await html(page);
    expect(out).not.toContain('javascript:');
    expect(out).toContain('odkaz');
  });
});
