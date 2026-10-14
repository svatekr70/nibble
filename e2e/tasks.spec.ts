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

  test('Enter na prázdném úkolu uprostřed rozdělí seznam, zbytek zůstane úkoly', async ({ page }) => {
    await mount(page,
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="false">a</li>'
      + '<li data-type="taskItem" data-checked="false">b</li>'
      + '<li data-type="taskItem" data-checked="true">c</li></ul>');
    await caret(page, 0, 1);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    expect(await html(page)).toBe(
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="false">a</li></ul>'
      + '<p><br></p>'
      + '<ul data-type="taskList"><li data-type="taskItem" data-checked="false">b</li>'
      + '<li data-type="taskItem" data-checked="true">c</li></ul>',
    );
  });

  test('odštěpený seznam nepřevezme id ani start', async ({ page }) => {
    await mount(page, '<ol id="kroky" start="3" class="x"><li>a</li><li>b</li><li>c</li></ol>');
    await caret(page, 0, 1);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    expect(await html(page)).toBe(
      '<ol id="kroky" start="3" class="x"><li>a</li></ol><p><br></p>'
      + '<ol class="x"><li>b</li><li>c</li></ol>',
    );
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
    const out = await html(page);
    expect(out).toContain('<ul data-type="taskList">');
    expect(out).toContain('<li data-type="taskItem" data-checked="true">');
  });

  test('úkol hned za obyčejným seznamem zůstane samostatný', async ({ page }) => {
    await mount(page, '<ul><li>a</li><li>b</li></ul><p>c</p>');
    await caret(page, 1, 1);
    await page.locator('.nb-toolbar .nb-btn[data-control=tasklist]').click();
    expect(await html(page)).toBe(
      '<ul><li>a</li><li>b</li></ul>'
      + '<ul data-type="taskList"><li data-type="taskItem" data-checked="false">c</li></ul>',
    );
  });

  test('[ ] hned za obyčejným seznamem založí samostatný úkol', async ({ page }) => {
    await mount(page, '<ul><li>a</li></ul><p><br></p>');
    await caret(page, 1, 0);
    await page.keyboard.type('[ ] x');
    expect(await html(page)).toBe(
      '<ul><li>a</li></ul>'
      + '<ul data-type="taskList"><li data-type="taskItem" data-checked="false">x</li></ul>',
    );
  });

  test('úkol hned za úkoly se k nim přidá', async ({ page }) => {
    await mount(page, TASKS + '<p>b</p>');
    await caret(page, 1, 1);
    await page.locator('.nb-toolbar .nb-btn[data-control=tasklist]').click();
    expect(await html(page)).toBe(
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="true">a</li>'
      + '<li data-type="taskItem" data-checked="false">b</li></ul>',
    );
  });

  test('odrážka hned za úkoly zůstane samostatná', async ({ page }) => {
    await mount(page, TASKS + '<p><br></p>');
    await caret(page, 1, 0);
    await page.keyboard.type('- x');
    expect(await html(page)).toBe(TASKS + '<ul><li>x</li></ul>');
  });

  test('tlačítko odrážek hned za úkoly založí samostatný seznam', async ({ page }) => {
    await mount(page, TASKS + '<p>x</p>');
    await caret(page, 1, 1);
    await page.locator('.nb-toolbar .nb-btn[data-control=bullist]').click();
    expect(await html(page)).toBe(TASKS + '<ul><li>x</li></ul>');
  });

  test('číslování z úkolů udělá obyčejný <ol> a Ctrl+Z vrátí úkoly', async ({ page }) => {
    const before = '<ul data-type="taskList"><li data-type="taskItem" data-checked="true">a</li>'
      + '<li data-type="taskItem" data-checked="false">b</li></ul>';
    await mount(page, before);
    await caret(page, 0, 1);
    await page.locator('.nb-toolbar .nb-btn[data-control=numlist]').click();
    expect(await html(page)).toBe('<ol><li>a</li><li>b</li></ol>');
    await page.keyboard.press('ControlOrMeta+z');
    expect(await html(page)).toBe(before);
  });
});
