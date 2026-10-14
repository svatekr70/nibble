import { expect, test } from '@playwright/test';
import { caret, html, mount } from './helpers.js';

const undo = (page: import('@playwright/test').Page) => page.keyboard.press('ControlOrMeta+z');

test.describe('Markdown zkratky', () => {
  test('## a mezera udělá nadpis', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('## Nadpis');
    expect(await html(page)).toBe('<h2>Nadpis</h2>');
  });

  test('Ctrl+Z vrátí doslovný text', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('## ');
    await undo(page);
    expect(await html(page)).toBe('<p>## </p>');
  });

  test('- udělá odrážky, 3. číslovaný seznam od tří', async ({ page }) => {
    await mount(page, '<p><br></p><p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('- a');
    expect(await html(page)).toContain('<ul><li>a</li></ul>');

    await caret(page, 1, 0);
    await page.keyboard.type('3. b');
    expect(await html(page)).toContain('<ol start="3"><li>b</li></ol>');
  });

  test('> udělá citaci', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('> c');
    expect(await html(page)).toBe('<blockquote><p>c</p></blockquote>');
  });

  test('# uprostřed textu nic nedělá', async ({ page }) => {
    await mount(page, '<p>Text</p>');
    await caret(page, 0, 4);
    await page.keyboard.type(' # x');
    expect(await html(page)).toBe('<p>Text # x</p>');
  });

  test('**tučně** a další psaní už tučné není', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('a **b** c');
    expect(await html(page)).toBe('<p>a <strong>b</strong> c</p>');
  });

  test('`kód`, _kurzíva_, ~~pryč~~', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('`k` _i_ ~~s~~');
    expect(await html(page)).toBe('<p><code>k</code> <em>i</em> <s>s</s></p>');
  });

  test('snake_case_name zůstane textem', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('snake_case_name');
    expect(await html(page)).toBe('<p>snake_case_name</p>');
  });

  test('--- a Enter udělá čáru', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('---');
    await page.keyboard.press('Enter');
    await page.keyboard.type('dál');
    expect(await html(page)).toBe('<hr><p>dál</p>');
  });

  test('``` a Enter udělá blok kódu, zkratky v něm neplatí', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('```');
    await page.keyboard.press('Enter');
    await page.keyboard.type('**x** ');
    expect(await html(page)).toBe('<pre>**x** </pre>');
  });

  test('--- a Enter před dalším odstavcem založí nový odstavec', async ({ page }) => {
    await mount(page, '<p>---</p><p>dál</p>');
    await caret(page, 0, 3);
    await page.keyboard.press('Enter');
    await page.keyboard.type('x');
    expect(await html(page)).toBe('<hr><p>x</p><p>dál</p>');
  });

  // Zkratka do formátu, ve kterém blok už je, nesmí formát vypnout.
  test('> v citaci nic nedělá', async ({ page }) => {
    await mount(page, '<blockquote><p><br></p></blockquote>');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      ed.selection.collapseTo(ed.root.querySelector('p'), 0);
      ed.root.focus();
    });
    await page.keyboard.type('> c');
    expect(await html(page)).toBe('<blockquote><p>&gt; c</p></blockquote>');
  });

  test('- v položce seznamu nic nedělá', async ({ page }) => {
    await mount(page, '<ul><li><p><br></p></li></ul>');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      ed.selection.collapseTo(ed.root.querySelector('p'), 0);
      ed.root.focus();
    });
    await page.keyboard.type('- a');
    expect(await html(page)).toBe('<ul><li><p>- a</p></li></ul>');
  });

  test('1. v odrážkovém seznamu nic nedělá', async ({ page }) => {
    await mount(page, '<ul><li><p><br></p></li></ul>');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      ed.selection.collapseTo(ed.root.querySelector('p'), 0);
      ed.root.focus();
    });
    await page.keyboard.type('1. a');
    expect(await html(page)).toBe('<ul><li><p>1. a</p></li></ul>');
  });

  test('- v citaci udělá seznam v citaci', async ({ page }) => {
    await mount(page, '<blockquote><p><br></p></blockquote>');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      ed.selection.collapseTo(ed.root.querySelector('p'), 0);
      ed.root.focus();
    });
    await page.keyboard.type('- a');
    expect(await html(page)).toContain('<li>a</li>');
    expect(await html(page)).toMatch(/^<blockquote>/);
  });

  test('Ctrl+Enter na --- čáru nedělá', async ({ page }) => {
    await mount(page, '<p>---</p>');
    await caret(page, 0, 3);
    await page.keyboard.press('Control+Enter');
    expect(await html(page)).not.toContain('<hr>');
  });

  test('5. za existujícím číslováním seznam nepřečísluje', async ({ page }) => {
    await mount(page, '<ol><li>a</li><li>b</li></ol><p><br></p>');
    await caret(page, 1, 0);
    await page.keyboard.type('5. x');
    expect(await html(page)).toBe('<ol><li>a</li><li>b</li><li>x</li></ol>');
  });

  test('5. v prázdném dokumentu začne od pěti', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('5. x');
    expect(await html(page)).toBe('<ol start="5"><li>x</li></ol>');
  });
});

// Sem, ne do vitestu: linkedom nemá `Range.setStart`.
test('textBeforeCaret sečte text přes inline značky', async ({ page }) => {
  await mount(page, '<p><br></p>');
  const text = await page.evaluate(async () => {
    const { textBeforeCaret } = await import('/dist/core/src/index.js' as string);
    const p = document.createElement('p');
    p.innerHTML = 'a<strong>b</strong>cd';
    const range = document.createRange();
    range.setStart(p.lastChild!, 1);
    return textBeforeCaret(p, range) as string;
  });
  expect(text).toBe('abc');
});
