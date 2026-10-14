import { expect, test, type Page } from '@playwright/test';
import { CONTENT, html, mount, mountFixture, original } from './helpers.js';

async function drag(page: Page, fromIndex: number, toY: (boxes: { y: number; height: number }[]) => number) {
  const blocks = page.locator(`${CONTENT} > *`);
  const box = (await blocks.nth(fromIndex).boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + box.height / 2);
  const handle = page.locator('.nb-drag-handle:not([hidden])');
  await expect(handle).toBeVisible();
  const h = (await handle.boundingBox())!;
  const boxes = await Promise.all(Array.from({ length: await blocks.count() }, (_, i) => blocks.nth(i).boundingBox()));
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2, toY(boxes as { y: number; height: number }[]), { steps: 6 });
  await page.mouse.up();
}

test.describe('úchyt bloku', () => {
  test('přesun prvního bloku na konec', async ({ page }) => {
    await mount(page, '<p>a</p><p>b</p><p>c</p>');
    await drag(page, 0, (b) => b[2]!.y + b[2]!.height + 5);
    expect(await html(page)).toBe('<p>b</p><p>c</p><p>a</p>');
  });

  test('přesun posledního bloku na začátek a Ctrl+Z', async ({ page }) => {
    await mount(page, '<p>a</p><p>b</p><p>c</p>');
    await drag(page, 2, (b) => b[0]!.y + 2);
    expect(await html(page)).toBe('<p>c</p><p>a</p><p>b</p>');
    await page.keyboard.press('ControlOrMeta+z');
    expect(await html(page)).toBe('<p>a</p><p>b</p><p>c</p>');
  });

  test('puštění na stejné místo nic nezapíše', async ({ page }) => {
    await mount(page, '<p>a</p><p>b</p>');
    await drag(page, 0, (b) => b[0]!.y + 3);
    expect(await page.evaluate(() => (window as any).ed.history.canUndo)).toBe(false);
  });

  test('skrytý <style> mezi bloky nepočítá — puštění pod sebe nic nezapíše', async ({ page }) => {
    const before = '<p>a</p><style>p{}</style><p>b</p>';
    await mount(page, before);
    // Těsně nad b je pořád hned pod a, tedy na původním místě.
    await drag(page, 0, (b) => b[2]!.y + 2);
    expect(await html(page)).toBe(before);
    expect(await page.evaluate(() => (window as any).ed.history.canUndo)).toBe(false);
  });

  test('úchyt ani čára nejsou v HTML', async ({ page }) => {
    await mount(page, '<p>a</p>');
    const box = (await page.locator(`${CONTENT} p`).boundingBox())!;
    await page.mouse.move(box.x + 5, box.y + 5);
    expect(await html(page)).toBe('<p>a</p>');
  });

  test('klik na úchyt označí celý blok', async ({ page }) => {
    await mount(page, '<p>a</p><p>bcd</p>');
    const box = (await page.locator(`${CONTENT} > *`).nth(1).boundingBox())!;
    await page.mouse.move(box.x + 10, box.y + box.height / 2);
    await page.locator('.nb-drag-handle:not([hidden])').click();
    expect(await page.evaluate(() => window.getSelection()!.toString())).toBe('bcd');
    expect(await page.evaluate(() => (window as any).ed.history.canUndo)).toBe(false);
  });

  for (const focused of [false, true]) {
    test(`Escape tažení zruší (editor ${focused ? 's fokusem' : 'bez fokusu'})`, async ({ page }) => {
      await mount(page, '<p>a</p><p>b</p><p>c</p>');
      await page.evaluate((f) => {
        const ed = (window as any).ed;
        if (f) ed.root.focus();
        else { ed.root.blur(); (document.activeElement as HTMLElement | null)?.blur?.(); }
      }, focused);
      expect(await page.evaluate(() => document.activeElement === (window as any).ed.root)).toBe(focused);

      const blocks = page.locator(`${CONTENT} > *`);
      const first = (await blocks.nth(0).boundingBox())!;
      const last = (await blocks.nth(2).boundingBox())!;
      await page.mouse.move(first.x + 10, first.y + first.height / 2);
      const h = (await page.locator('.nb-drag-handle:not([hidden])').boundingBox())!;
      await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
      await page.mouse.down();
      await page.mouse.move(h.x + h.width / 2, last.y + last.height + 5, { steps: 6 });
      await expect(page.locator('.nb-drop-line')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('.nb-drop-line')).toBeHidden();
      await page.mouse.up();

      expect(await html(page)).toBe('<p>a</p><p>b</p><p>c</p>');
      expect(await page.evaluate(() => (window as any).ed.history.canUndo)).toBe(false);
      await expect(page.locator('.nb-drop-line')).toBeHidden();
    });
  }

  test('řádkový prvek přímo v kořeni úchyt nemá', async ({ page }) => {
    await mount(page, 'text <b>x</b> more<p>a</p>');
    expect(await page.evaluate(() => (window as any).ed.root.querySelector(':scope > b') !== null)).toBe(true);
    const b = (await page.locator(`${CONTENT} > b`).boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await expect(page.locator('.nb-drag-handle:not([hidden])')).toHaveCount(0);
    const p = (await page.locator(`${CONTENT} > p`).boundingBox())!;
    await page.mouse.move(p.x + 10, p.y + p.height / 2);
    await expect(page.locator('.nb-drag-handle:not([hidden])')).toBeVisible();
  });

  test('přepnutí do režimu jen pro čtení úchyt schová', async ({ page }) => {
    await mount(page, '<p>a</p><p>b</p>');
    const box = (await page.locator(`${CONTENT} > p`).first().boundingBox())!;
    await page.mouse.move(box.x + 10, box.y + box.height / 2);
    await expect(page.locator('.nb-drag-handle:not([hidden])')).toBeVisible();
    await page.evaluate(() => (window as any).ed.setMode('readonly'));
    await expect(page.locator('.nb-drag-handle:not([hidden])')).toHaveCount(0);
  });

  test('na reálném dokumentu změní přesun jen pořadí', async ({ page }) => {
    // První blok fixture je odstavec jen s plovoucím obrázkem, má nulovou
    // výšku a nad něj se pustit nedá. Přesouvá se proto čtvrtý blok
    // (odstavec „(Ametconse)“) před druhý (prázdný nadpis).
    await mountFixture(page, '001.html');
    const before = await original(page);
    await drag(page, 3, (b) => b[1]!.y + 2);
    const after = await html(page);
    // Stejné znaky, jiné pořadí: setříděné znaky se musí shodovat.
    expect([...after].sort().join('')).toBe([...before].sort().join(''));
    expect(after).not.toBe(before);
    // Přesně: blok se přenese znak po znaku a zalomení řádků mezi bloky
    // zůstanou na svých místech.
    const lines = before.split('\n');
    const moved = lines[3]!;
    expect(moved).toBe('<p style="text-align: center;">(Ametconse)</p>');
    const expected = before.replace(moved, '').replace(lines[1]!, moved + lines[1]!);
    expect(after).toBe(expected);
  });
});
