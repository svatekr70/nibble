import { expect, test } from '@playwright/test';
import { CONTENT, caret, html, mount } from './helpers.js';

const TASKS = '<ul data-type="taskList"><li data-type="taskItem" data-checked="true">a</li></ul>';

test.describe('úkoly', () => {
  test('tlačítko udělá z odstavce úkol', async ({ page }) => {
    await mount(page, '<p>koupit mléko</p>');
    await caret(page, 0, 3);
    await page.locator('.nb-toolbar .nb-btn[data-control=tasklist]').click();
    expect(await html(page)).toBe(
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="false">koupit mléko</li></ul>',
    );
  });

  test('klik do zaškrtávátka přepne stav a Ctrl+Z ho vrátí', async ({ page }) => {
    await mount(page, TASKS);
    // Fokus do editoru — klik do zaškrtávátka ho schválně nebere a Ctrl+Z
    // by jinak šlo mimo.
    await caret(page, 0, 1);
    const li = page.locator(`${CONTENT} li`).first();
    const box = (await li.boundingBox())!;
    await page.mouse.click(box.x + 6, box.y + box.height / 2);
    expect(await html(page)).toContain('data-checked="false"');

    await page.keyboard.press('ControlOrMeta+z');
    expect(await html(page)).toContain('data-checked="true"');
  });

  test('Enter na zaškrtnutém úkolu dá nezaškrtnutý', async ({ page }) => {
    await mount(page, TASKS);
    await caret(page, 0, 1);
    await page.keyboard.press('Enter');
    await page.keyboard.type('b');
    expect(await html(page)).toBe(
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="true">a</li>'
      + '<li data-type="taskItem" data-checked="false">b</li></ul>',
    );
  });

  test('Enter na prázdném úkolu ze seznamu vyskočí', async ({ page }) => {
    await mount(page, TASKS);
    await caret(page, 0, 1);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('x');
    expect(await html(page)).toMatch(/<\/ul><p>x<\/p>$/);
  });

  test('[x] při psaní a Ctrl+Z', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('[x] ');
    expect(await html(page)).toBe(
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><br></li></ul>',
    );
    await page.keyboard.press('ControlOrMeta+z');
    expect(await html(page)).toBe('<p>[x] </p>');
  });

  test('[ ] založí nezaškrtnutý úkol', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('[ ] koupit');
    expect(await html(page)).toBe(
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="false">koupit</li></ul>',
    );
  });

  test('úkoly z TipTapu projdou vložením', async ({ page }) => {
    await mount(page, '<p>x</p>');
    await caret(page, 0, 1);
    await page.evaluate(() => {
      const data = new DataTransfer();
      data.setData('text/html', '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>z TipTapu</p></li></ul>');
      (window as any).ed.root.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    });
    expect(await html(page)).toContain('data-checked="true"');
  });
});
