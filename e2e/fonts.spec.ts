import { expect, test } from '@playwright/test';
import { caret, html, mount, select } from './helpers.js';

async function openFontMenu(page: import('@playwright/test').Page, which: 'fontfamily' | 'fontsize') {
  await page.locator(`.nb-toolbar .nb-btn[data-control=${which}]`).click();
  await page.locator('.nb-menu').waitFor();
}

test.describe('výběr písma', () => {
  test('nabídka má obecné rodiny, klasiky i Google písma', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    await select(page, 0, 0, 3);
    await openFontMenu(page, 'fontfamily');

    const labels = await page.locator('.nb-menu-label').allTextContents();
    expect(labels).toContain('Bezpatkové');
    expect(labels).toContain('Arial');
    expect(labels).toContain('Times New Roman');
    expect(labels).toContain('Roboto');
  });

  test('každá položka je vysázená svým písmem', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    await select(page, 0, 0, 3);
    await openFontMenu(page, 'fontfamily');

    const georgia = page.locator('.nb-menu-item', { hasText: 'Georgia' }).locator('.nb-menu-label');
    await expect(georgia).toHaveCSS('font-family', /Georgia/);
  });

  test('obecná rodina se zapíše beze změny', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    await select(page, 0, 0, 3);
    await openFontMenu(page, 'fontfamily');
    await page.locator('.nb-menu-item', { hasText: /^Patkové$/ }).click();

    await expect.poll(() => html(page)).toBe('<p><span style="font-family: serif;">abc</span></p>');
  });

  test('klasika se zapíše celým zásobníkem', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    await select(page, 0, 0, 3);
    await page.evaluate(() =>
      (window as any).ed.exec('fontfamily', 'Arial, Helvetica, sans-serif'));

    await expect.poll(() => html(page)).toContain('font-family: Arial, Helvetica, sans-serif');
  });

  test('spouštěč ukazuje písmo pod kurzorem', async ({ page }) => {
    await mount(page, '<p><span style="font-family: Georgia, serif;">abc</span> jinak</p>');
    await select(page, 0, 0, 2);

    await expect.poll(() =>
      page.locator('.nb-btn[data-control=fontfamily] .nb-btn-value').textContent(),
    ).toBe('Georgia');
  });

  test('neznámé písmo z obsahu se ukáže tak, jak je', async ({ page }) => {
    await mount(page, '<p><span style="font-family: Comic Sans MS;">abc</span></p>');
    await select(page, 0, 0, 3);

    await expect.poll(() =>
      page.locator('.nb-btn[data-control=fontfamily] .nb-btn-value').textContent(),
    ).toContain('Comic Sans');
  });

  test('bez výběru je nabídka nedostupná', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    await caret(page, 0, 1);
    await expect.poll(() =>
      page.locator('.nb-btn[data-control=fontfamily]').getAttribute('aria-disabled'),
    ).toBe('true');
  });
});

test.describe('velikost písma', () => {
  test('nastaví font-size', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    await select(page, 0, 0, 3);
    await openFontMenu(page, 'fontsize');
    await page.locator('.nb-menu-label', { hasText: /^24px$/ }).click();

    await expect.poll(() => html(page)).toBe('<p><span style="font-size: 24px;">abc</span></p>');
  });

  test('velikost mimo řadu se v nabídce objeví', async ({ page }) => {
    // V reálném obsahu je `small` i `11pt` — tvrdit, že nastavená není,
    // by bylo nepoctivé.
    await mount(page, '<p><span style="font-size: small;">abc</span></p>');
    await select(page, 0, 0, 3);
    await openFontMenu(page, 'fontsize');

    // Popisek, ne celá položka — vybraná položka nese ještě fajfku.
    await expect(page.locator('.nb-menu-label', { hasText: /^small$/ })).toBeVisible();
  });

  test('přenastavení nevnoří druhý span', async ({ page }) => {
    await mount(page, '<p><span style="font-size: 12px;">abc</span></p>');
    await select(page, 0, 0, 3);
    await page.evaluate(() => (window as any).ed.exec('fontsize', '18px'));

    const out = await html(page);
    expect((out.match(/<span/g) ?? []).length).toBe(1);
    expect(out).toContain('font-size: 18px');
  });

  test('písmo a velikost se nepřebíjejí', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    await select(page, 0, 0, 3);
    await page.evaluate(() => (window as any).ed.exec('fontfamily', 'Georgia, serif'));
    await select(page, 0, 0, 3);
    await page.evaluate(() => (window as any).ed.exec('fontsize', '20px'));

    const out = await html(page);
    expect(out).toContain('font-family: Georgia, serif');
    expect(out).toContain('font-size: 20px');
  });
});

test.describe('Google Fonts', () => {
  test('při výběru se stáhne stylopis', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    await select(page, 0, 0, 3);
    await openFontMenu(page, 'fontfamily');

    await expect.poll(() => page.evaluate(() =>
      document.querySelectorAll('link[data-nibble-fonts]').length)).toBeGreaterThan(0);

    const href = await page.evaluate(() =>
      document.querySelector('link[data-nibble-fonts]')?.getAttribute('href'));
    expect(href).toContain('fonts.googleapis.com');
    expect(href).toContain('display=swap');
  });

  test('obsah s Robotem si písmo vyžádá sám', async ({ page }) => {
    // Bez toho by se stará stránka vykreslila náhradním písmem jen proto,
    // že si ho čtenář nenainstaloval.
    await mount(page, '<p><span style="font-family: Roboto, sans-serif;">abc</span></p>');

    await expect.poll(() => page.evaluate(() =>
      document.querySelector('link[data-nibble-fonts]')?.getAttribute('href') ?? '',
    )).toContain('Roboto');
  });

  test('obyčejný obsah nic nestahuje', async ({ page }) => {
    await mount(page, '<p>bez písma</p>');
    expect(await page.evaluate(() =>
      document.querySelectorAll('link[data-nibble-fonts]').length)).toBe(0);
  });
});

test.describe('ovládání nabídky', () => {
  test('šipky posouvají a Enter vybere', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    await select(page, 0, 0, 3);
    await openFontMenu(page, 'fontsize');

    await page.keyboard.press('ArrowDown');
    const focused = await page.evaluate(() =>
      (document.activeElement as HTMLElement)?.dataset.value);
    await page.keyboard.press('Enter');

    await expect.poll(() => html(page)).toContain('font-size: ' + focused);
  });

  test('Escape zavře bez změny', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    await select(page, 0, 0, 3);
    await openFontMenu(page, 'fontfamily');
    await page.keyboard.press('Escape');

    await expect(page.locator('.nb-menu')).toHaveCount(0);
    expect(await html(page)).toBe('<p>abc</p>');
  });

  test('vybraná položka má fajfku', async ({ page }) => {
    await mount(page, '<p><span style="font-size: 24px;">abc</span></p>');
    await select(page, 0, 0, 3);
    await openFontMenu(page, 'fontsize');

    await expect(page.locator('.nb-menu-item[aria-selected="true"] .nb-menu-label'))
      .toHaveText('24px');
  });
});

test.describe('nabídka nehýbe stránkou', () => {
  test('otevření neodroluje dokument', async ({ page }) => {
    await mount(page, '<p>abc</p>' + '<p>vypln</p>'.repeat(40));
    await select(page, 0, 0, 3);

    const before = await page.evaluate(() => window.scrollY);
    await page.locator('.nb-toolbar .nb-btn[data-control=fontfamily]').click();
    await page.locator('.nb-menu').waitFor();

    // Nabídka visí v <body>; focus() a scrollIntoView() by odrolovaly stránku
    // a uživateli by se pod rukama posunul dokument.
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });

  test('šipky rolují nabídkou, ne stránkou', async ({ page }) => {
    await mount(page, '<p>abc</p>' + '<p>vypln</p>'.repeat(40));
    await select(page, 0, 0, 3);
    await page.locator('.nb-toolbar .nb-btn[data-control=fontfamily]').click();
    await page.locator('.nb-menu').waitFor();

    const before = await page.evaluate(() => window.scrollY);
    for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowDown');

    expect(await page.evaluate(() => window.scrollY)).toBe(before);
    expect(await page.evaluate(() =>
      document.querySelector('.nb-menu')!.scrollTop)).toBeGreaterThan(0);
  });
});

test.describe('lišta si drží nastavenou hodnotu', () => {
  /**
   * Po obarvení vrací příkaz rozsah kolem nově vzniklého <span>, takže jeho
   * startContainer je rodičovský odstavec — a ten o písmu nic neví. Bez sestupu
   * dovnitř by lišta hned po nastavení tvrdila, že nastavené nic není.
   */
  test('po nastavení písma zůstane písmo vidět', async ({ page }) => {
    await mount(page, '<p>abcdef</p>');
    await select(page, 0, 0, 6);
    await openFontMenu(page, 'fontfamily');
    await page.locator('.nb-menu-label', { hasText: /^Georgia$/ }).click();

    await expect.poll(() =>
      page.locator('.nb-btn[data-control=fontfamily] .nb-btn-value').textContent(),
    ).toBe('Georgia');
  });

  test('po nastavení velikosti zůstane velikost vidět', async ({ page }) => {
    await mount(page, '<p>abcdef</p>');
    await select(page, 0, 0, 6);
    await openFontMenu(page, 'fontsize');
    await page.locator('.nb-menu-label', { hasText: /^24px$/ }).click();

    await expect.poll(() =>
      page.locator('.nb-btn[data-control=fontsize] .nb-btn-value').textContent(),
    ).toBe('24px');
  });

  test('po obarvení zůstane barva vidět na proužku', async ({ page }) => {
    await mount(page, '<p>abcdef</p>');
    await select(page, 0, 0, 6);
    await page.evaluate(() => (window as any).ed.exec('forecolor', '#dc3545'));

    await expect.poll(() => page.evaluate(() => {
      const bar = document.querySelector('.nb-btn[data-control=forecolor] .nb-btn-bar');
      return (bar as HTMLElement)?.style.background;
    })).toBe('rgb(220, 53, 69)');
  });

  test('písmo i velikost naráz zůstanou obě', async ({ page }) => {
    await mount(page, '<p>abcdef</p>');
    await select(page, 0, 0, 6);
    await page.evaluate(() => (window as any).ed.exec('fontfamily', 'Georgia, serif'));
    await select(page, 0, 0, 6);
    await page.evaluate(() => (window as any).ed.exec('fontsize', '18px'));

    await expect.poll(() =>
      page.locator('.nb-btn[data-control=fontsize] .nb-btn-value').textContent(),
    ).toBe('18px');
    await expect.poll(() =>
      page.locator('.nb-btn[data-control=fontfamily] .nb-btn-value').textContent(),
    ).toBe('Georgia');
  });
});
