import { expect, test } from '@playwright/test';
import { html, mount } from './helpers.js';

/**
 * Přetečení lišty.
 *
 * Se zalomením zabrala lišta při větším počtu tlačítek klidně čtyři řádky
 * a z editoru zbyl proužek. Co se nevejde, jde pod trojtečku — řádky tak
 * zůstanou nejvýš dva, a to jsou ty dva, které si uživatel nastavil.
 */

const TOOLBAR = '.nb-toolbar';
const OVERFLOW = '.nb-overflow';
const PANEL = '.nb-overflow-panel';

/** Nastaví šířku editoru a počká, až se lišta přerovná. */
async function resize(page: import('@playwright/test').Page, width: string) {
  await page.evaluate((w) => {
    (document.querySelector('.nb') as HTMLElement).style.width = w as string;
  }, width);
  await page.waitForTimeout(250);
}

const stav = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const tb = document.querySelector('.nb-toolbar')!;
    return {
      inBar: tb.querySelectorAll(':scope > .nb-group').length,
      hidden: tb.querySelector('.nb-overflow-panel')!.querySelectorAll('.nb-group').length,
      overflowVisible: !(tb.querySelector('.nb-overflow') as HTMLElement).hidden,
      rows: Math.round(tb.getBoundingClientRect().height),
    };
  });

test.describe('lišta se nezalamuje', () => {
  test('v úzkém editoru zůstane jednořádková', async ({ page }) => {
    await mount(page, '<p>Text</p>');
    await resize(page, '1500px');
    const siroko = await stav(page);

    await resize(page, '400px');
    const uzko = await stav(page);

    // Výška lišty se nesmí měnit — to je celá pointa.
    expect(uzko.rows).toBe(siroko.rows);
    expect(uzko.overflowVisible).toBe(true);
    expect(uzko.hidden).toBeGreaterThan(0);
  });

  test('řádek, kterému se všechno vejde, trojtečku nemá', async ({ page }) => {
    // Druhý řádek mívá pár ikon a vešly se vždycky — přesto tam trojtečka
    // byla vidět a otevírala prázdný panel. `[hidden]` je jen `display: none`
    // s nejnižší specificitou, takže ho `.nb-btn { display: inline-flex }`
    // porazilo. Test proto měří skutečnou viditelnost, ne vlastnost `hidden`.
    await mount(page, '<p>Text</p>');
    await resize(page, '700px');

    const rows = await page.evaluate(() => [...document.querySelectorAll('.nb-toolbar')].map((tb) => {
      const ov = tb.querySelector('.nb-overflow') as HTMLElement;
      const panel = tb.querySelector('.nb-overflow-panel')!;
      return { seen: ov.offsetWidth > 0, hiddenGroups: panel.querySelectorAll('.nb-group').length };
    }));

    // Kde není co schovat, nesmí být ani trojtečka.
    for (const row of rows) {
      if (row.hiddenGroups === 0) expect(row.seen).toBe(false);
      else expect(row.seen).toBe(true);
    }
  });

  test('skrytá trojtečka opravdu nezabírá místo', async ({ page }) => {
    await mount(page, '<p>Text</p>');
    await resize(page, '1600px');

    const width = await page.evaluate(
      () => (document.querySelector('.nb-overflow') as HTMLElement).offsetWidth);
    expect(width).toBe(0);
  });

  test('v širokém editoru trojtečka není', async ({ page }) => {
    await mount(page, '<p>Text</p>');
    await resize(page, '1600px');

    const s = await stav(page);
    expect(s.overflowVisible).toBe(false);
    expect(s.hidden).toBe(0);
  });

  test('při rozšíření se tlačítka vrátí do lišty', async ({ page }) => {
    await mount(page, '<p>Text</p>');
    await resize(page, '400px');
    const uzko = await stav(page);

    await resize(page, '1600px');
    const siroko = await stav(page);

    expect(siroko.inBar).toBeGreaterThan(uzko.inBar);
    expect(siroko.hidden).toBe(0);
  });

  test('užší a zase širší se vrátí do původního stavu', async ({ page }) => {
    await mount(page, '<p>Text</p>');
    await resize(page, '900px');
    const pred = await stav(page);

    await resize(page, '400px');
    await resize(page, '900px');

    expect(await stav(page)).toEqual(pred);
  });
});

test.describe('panel s přetečenými tlačítky', () => {
  async function otevri(page: import('@playwright/test').Page) {
    await resize(page, '700px');
    await page.locator(TOOLBAR).first().locator(OVERFLOW).click();
  }

  test('panel je schovaný, dokud se na trojtečku neklikne', async ({ page }) => {
    await mount(page, '<p>Text</p>');
    await resize(page, '700px');

    await expect(page.locator(PANEL).first()).toBeHidden();
    await page.locator(TOOLBAR).first().locator(OVERFLOW).click();
    await expect(page.locator(PANEL).first()).toBeVisible();
  });

  test('tlačítko z panelu funguje a panel se pak zavře', async ({ page }) => {
    await mount(page, '<p>Text</p>');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      const t = ed.root.querySelector('p').firstChild;
      const r = document.createRange();
      r.setStart(t, 0);
      r.setEnd(t, 4);
      ed.root.focus();
      ed.selection.setRange(r);
    });

    await otevri(page);
    await page.locator(PANEL).first().locator('.nb-btn[data-control=bold]').click();

    await expect.poll(() => html(page)).toBe('<p><strong>Text</strong></p>');
    await expect(page.locator(PANEL).first()).toBeHidden();
  });

  test('klik mimo panel ho zavře', async ({ page }) => {
    await mount(page, '<p>Text</p>');
    await otevri(page);
    await expect(page.locator(PANEL).first()).toBeVisible();

    await page.locator('.nb-content').click();
    await expect(page.locator(PANEL).first()).toBeHidden();
  });

  test('Escape panel zavře', async ({ page }) => {
    await mount(page, '<p>Text</p>');
    await otevri(page);
    await page.keyboard.press('Escape');

    await expect(page.locator(PANEL).first()).toBeHidden();
  });

  test('trojtečka se hlásí čtečce', async ({ page }) => {
    await mount(page, '<p>Text</p>');
    await resize(page, '700px');

    const btn = page.locator(TOOLBAR).first().locator(OVERFLOW);
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await expect(btn).toHaveAttribute('aria-label', 'Další nástroje');

    await btn.click();
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
  });

  test('schované tlačítko drží stav se svým protějškem v liště', async ({ page }) => {
    // Do panelu se prvky přesouvají, neklonují — klon by měl vlastní stav.
    await mount(page, '<p><strong>Text</strong></p>');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      const t = ed.root.querySelector('strong').firstChild;
      const r = document.createRange();
      r.setStart(t, 0);
      r.setEnd(t, 4);
      ed.root.focus();
      ed.selection.setRange(r);
    });

    await otevri(page);
    await expect(page.locator(PANEL).first().locator('.nb-btn[data-control=bold]'))
      .toHaveAttribute('aria-pressed', 'true');
  });
});
