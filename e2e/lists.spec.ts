import { expect, test } from '@playwright/test';
import { caret, html, mount, select } from './helpers.js';

/** Postaví kurzor do n-té položky seznamu (v pořadí dokumentu). */
async function caretInItem(page: import('@playwright/test').Page, index: number, offset = 0) {
  await page.evaluate(([i, o]) => {
    const ed = (window as any).ed;
    const li = ed.root.querySelectorAll('li')[i as number];
    const walker = document.createTreeWalker(li, NodeFilter.SHOW_TEXT);
    const text = walker.nextNode() ?? li;
    ed.selection.collapseTo(text, o as number);
    ed.root.focus();
  }, [index, offset] as const);
}

test.describe('zapnutí a vypnutí seznamu', () => {
  test('z odstavce udělá odrážkový seznam', async ({ page }) => {
    await mount(page, '<p>polozka</p>');
    await caret(page, 0, 3);
    await page.locator('.nb-btn[data-control=bullist]').click();
    expect(await html(page)).toBe('<ul><li>polozka</li></ul>');
  });

  test('opakovaný stisk seznam zase zruší', async ({ page }) => {
    await mount(page, '<ul><li>polozka</li></ul>');
    await caretInItem(page, 0, 3);
    await page.locator('.nb-btn[data-control=bullist]').click();
    expect(await html(page)).toBe('<p>polozka</p>');
  });

  test('přepne odrážky na čísla', async ({ page }) => {
    await mount(page, '<ul><li>a</li><li>b</li></ul>');
    await caretInItem(page, 0, 1);
    await page.locator('.nb-btn[data-control=numlist]').click();
    expect(await html(page)).toBe('<ol><li>a</li><li>b</li></ol>');
  });

  test('víc odstavců naráz se spojí do jednoho seznamu', async ({ page }) => {
    await mount(page, '<p>a</p><p>b</p><p>c</p>');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      const range = document.createRange();
      range.setStart(ed.root.children[0], 0);
      range.setEnd(ed.root.children[2], 1);
      ed.selection.setRange(range);
      ed.root.focus();
    });
    await page.locator('.nb-btn[data-control=bullist]').click();
    expect(await html(page)).toBe('<ul><li>a</li><li>b</li><li>c</li></ul>');
  });

  test('nový seznam se slije se sousedním stejného druhu', async ({ page }) => {
    await mount(page, '<ul><li>a</li></ul><p>b</p>');
    await caret(page, 1, 1);
    await page.locator('.nb-btn[data-control=bullist]').click();
    expect(await html(page)).toBe('<ul><li>a</li><li>b</li></ul>');
  });
});

test.describe('zanořování', () => {
  test('Tab zanoří položku pod předchozí', async ({ page }) => {
    await mount(page, '<ul><li>a</li><li>b</li></ul>');
    await caretInItem(page, 1, 1);
    await page.keyboard.press('Tab');
    expect(await html(page)).toBe('<ul><li>a<ul><li>b</li></ul></li></ul>');
  });

  test('první položku zanořit nejde', async ({ page }) => {
    await mount(page, '<ul><li>a</li><li>b</li></ul>');
    await caretInItem(page, 0, 1);
    await page.keyboard.press('Tab');
    expect(await html(page)).toBe('<ul><li>a</li><li>b</li></ul>');
  });

  test('Shift+Tab položku zase vysune', async ({ page }) => {
    await mount(page, '<ul><li>a<ul><li>b</li></ul></li></ul>');
    await caretInItem(page, 1, 1);
    await page.keyboard.press('Shift+Tab');
    expect(await html(page)).toBe('<ul><li>a</li><li>b</li></ul>');
  });

  test('vysunutí na nejvyšší úrovni udělá odstavec', async ({ page }) => {
    await mount(page, '<ul><li>a</li></ul>');
    await caretInItem(page, 0, 1);
    await page.keyboard.press('Shift+Tab');
    expect(await html(page)).toBe('<p>a</p>');
  });

  test('při vysunutí zůstanou následující položky pod tou vysunutou', async ({ page }) => {
    await mount(page, '<ul><li>a<ul><li>b</li><li>c</li></ul></li></ul>');
    await caretInItem(page, 1, 1);
    await page.keyboard.press('Shift+Tab');
    expect(await html(page)).toBe('<ul><li>a</li><li>b<ul><li>c</li></ul></li></ul>');
  });

  test('Tab mimo seznam obsah nemění', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await caret(page, 0, 2);
    await page.keyboard.press('Tab');
    expect(await html(page)).toBe('<p>text</p>');
  });
});

test.describe('Enter v seznamu', () => {
  test('rozdělí položku', async ({ page }) => {
    await mount(page, '<ul><li>prvnidruhy</li></ul>');
    await caretInItem(page, 0, 5);
    await page.keyboard.press('Enter');
    expect(await html(page)).toBe('<ul><li>prvni</li><li>druhy</li></ul>');
  });

  test('v prázdné položce vysune o úroveň', async ({ page }) => {
    await mount(page, '<ul><li>a<ul><li></li></ul></li></ul>');
    await caretInItem(page, 1, 0);
    await page.keyboard.press('Enter');
    expect(await html(page)).toBe('<ul><li>a</li><li><br></li></ul>');
  });

  test('v prázdné položce nejvyšší úrovně vystoupí ze seznamu', async ({ page }) => {
    await mount(page, '<ul><li>a</li><li></li></ul>');
    await caretInItem(page, 1, 0);
    await page.keyboard.press('Enter');
    expect(await html(page)).toBe('<ul><li>a</li></ul><p><br></p>');
  });

  test('zanořený seznam zůstane u původní položky', async ({ page }) => {
    await mount(page, '<ul><li>prvnidruhy<ul><li>pod</li></ul></li></ul>');
    await caretInItem(page, 0, 5);
    await page.keyboard.press('Enter');
    expect(await html(page)).toBe('<ul><li>prvni<ul><li>pod</li></ul></li><li>druhy</li></ul>');
  });
});

test.describe('Backspace v seznamu', () => {
  test('na začátku spojí s předchozí položkou', async ({ page }) => {
    await mount(page, '<ul><li>prvni</li><li>druhy</li></ul>');
    await caretInItem(page, 1, 0);
    await page.keyboard.press('Backspace');
    expect(await html(page)).toBe('<ul><li>prvnidruhy</li></ul>');
  });

  test('na začátku první položky vystoupí ze seznamu', async ({ page }) => {
    await mount(page, '<ul><li>a</li><li>b</li></ul>');
    await caretInItem(page, 0, 0);
    await page.keyboard.press('Backspace');
    expect(await html(page)).toBe('<p>a</p><ul><li>b</li></ul>');
  });

  test('zanořená položka se vysune, nespojí', async ({ page }) => {
    await mount(page, '<ul><li>a<ul><li>b</li></ul></li></ul>');
    await caretInItem(page, 1, 0);
    await page.keyboard.press('Backspace');
    expect(await html(page)).toBe('<ul><li>a</li><li>b</li></ul>');
  });
});

/**
 * Struktura z Google Docs — seznam visí jako sourozenec `<li>` místo uvnitř něj.
 * Ze 72 dokumentů se seznamem má tuhle formu 11.
 */
test.describe('neplatná struktura z Google Docs', () => {
  test('při načtení se nesrovnává', async ({ page }) => {
    const broken = '<ul><li>a</li><ul><li>b</li></ul></ul>';
    await mount(page, broken);
    expect(await html(page)).toBe(broken);
  });

  test('srovná se, až když se s ní pracuje', async ({ page }) => {
    await mount(page, '<ul><li>a</li><ul><li>b</li></ul></ul>');
    await caretInItem(page, 1, 1);
    await page.keyboard.press('Shift+Tab');
    expect(await html(page)).toBe('<ul><li>a</li><li>b</li></ul>');
  });
});

test.describe('aria-level', () => {
  test('se srovná podle skutečné hloubky', async ({ page }) => {
    await mount(page, '<ul><li aria-level="1">a</li><li aria-level="1">b</li></ul>');
    await caretInItem(page, 1, 1);
    await page.keyboard.press('Tab');
    expect(await html(page)).toBe(
      '<ul><li aria-level="1">a<ul><li aria-level="2">b</li></ul></li></ul>');
  });

  test('do seznamu, který ho nemá, se nedoplňuje', async ({ page }) => {
    await mount(page, '<ul><li>a</li><li>b</li></ul>');
    await caretInItem(page, 1, 1);
    await page.keyboard.press('Tab');
    expect(await html(page)).not.toContain('aria-level');
  });
});

test.describe('stav tlačítek', () => {
  test('sledují druh seznamu pod kurzorem', async ({ page }) => {
    await mount(page, '<ul><li>a</li></ul><ol><li>b</li></ol>');
    const bullist = page.locator('.nb-btn[data-control=bullist]');
    const numlist = page.locator('.nb-btn[data-control=numlist]');

    await caretInItem(page, 0, 1);
    await expect.poll(() => bullist.getAttribute('aria-pressed')).toBe('true');
    await expect.poll(() => numlist.getAttribute('aria-pressed')).toBe('false');

    await caretInItem(page, 1, 1);
    await expect.poll(() => numlist.getAttribute('aria-pressed')).toBe('true');
  });

  test('zanoření se nabídne v seznamu, jinde ne', async ({ page }) => {
    await mount(page, '<p>mimo</p><ul><li>a</li><li>b</li></ul>');

    await caret(page, 0, 1);
    await expect(page.locator('.nb-context .nb-btn[data-control=indent]')).toBeHidden();

    await caretInItem(page, 1, 1);
    await expect(page.locator('.nb-context .nb-btn[data-control=indent]')).toBeVisible();
  });

  test('první položku zanořit nejde, tlačítko to hlásí', async ({ page }) => {
    await mount(page, '<ul><li>a</li><li>b</li></ul>');
    await caretInItem(page, 0, 1);
    await expect.poll(() =>
      page.locator('.nb-context .nb-btn[data-control=indent]').getAttribute('aria-disabled'),
    ).toBe('true');
  });
});
