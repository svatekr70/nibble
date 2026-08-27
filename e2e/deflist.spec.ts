import { expect, test } from '@playwright/test';
import { caret, html, mount } from './helpers.js';

/**
 * Seznam definic.
 *
 * Testy po každé operaci píšou, ne jen kontrolují strukturu. U seznamů se
 * ukázalo, že výsledné HTML může být v pořádku i tehdy, když kurzor skončil
 * mimo něj — a uživateli se to projeví tím, že se do seznamu nedá psát.
 */

/** Postaví kurzor do n-tého `<dt>`/`<dd>` v pořadí dokumentu. */
async function caretInItem(page: import('@playwright/test').Page, index: number, offset = 0) {
  await page.evaluate(([i, o]) => {
    const ed = (window as any).ed;
    const item = ed.root.querySelectorAll('dt, dd')[i as number];
    const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
    const text = walker.nextNode() ?? item;
    ed.selection.collapseTo(text, o as number);
    ed.root.focus();
  }, [index, offset] as const);
}

/**
 * Zapne seznam definic z nabídky.
 *
 * Ve výchozí liště tlačítko není — definiční seznamy jsou málo časté a lišta
 * je plná. Do registru se ale hlásí, takže si ho jde přidat v nastavení
 * a v nabídce *Formát → Seznam* je vždycky.
 */
async function clickDefList(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('.nb-menubar-item', { hasText: 'Formát' }).click();
  await page.locator('.nb-panel').first().waitFor();
  await page.locator('.nb-panel-label', { hasText: /^Seznam$/ }).click();
  await page.locator('.nb-panel-label', { hasText: /^Seznam definic$/ }).click();
}

/** Je tlačítko rozsvícené? Čte se z registru, ne z lišty — tam není. */
const pressed = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const ed = (window as any).ed;
    return !!ed.ui.get('deflist').active(ed);
  });

test.describe('zapnutí a vypnutí', () => {
  test('z odstavce udělá termín', async ({ page }) => {
    await mount(page, '<p>pojem</p>');
    await caret(page, 0, 3);
    await page.evaluate(() => (window as any).ed.exec('deflist'));
    expect(await html(page)).toBe('<dl><dt>pojem</dt></dl>');
  });

  test('víc odstavců se střídá termín – vysvětlení', async ({ page }) => {
    await mount(page, '<p>a</p><p>b</p><p>c</p><p>d</p>');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      const range = document.createRange();
      range.setStart(ed.root.children[0], 0);
      range.setEnd(ed.root.children[3], 1);
      ed.selection.setRange(range);
      ed.root.focus();
    });
    await page.evaluate(() => (window as any).ed.exec('deflist'));

    expect(await html(page)).toBe(
      '<dl><dt>a</dt><dd>b</dd><dt>c</dt><dd>d</dd></dl>');
  });

  test('opakovaný stisk seznam zase rozpustí', async ({ page }) => {
    await mount(page, '<dl><dt>a</dt><dd>b</dd></dl>');
    await caretInItem(page, 0, 1);
    await page.evaluate(() => (window as any).ed.exec('deflist'));
    expect(await html(page)).toBe('<p>a</p><p>b</p>');
  });

  test('nový seznam se slije se sousedním', async ({ page }) => {
    await mount(page, '<dl><dt>a</dt></dl><p>b</p>');
    await caret(page, 1, 1);
    await page.evaluate(() => (window as any).ed.exec('deflist'));
    expect(await html(page)).toBe('<dl><dt>a</dt><dt>b</dt></dl>');
  });

  test('psaní pokračuje v novém prvku', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await clickDefList(page);
    await page.keyboard.type('pojem');
    expect(await html(page)).toBe('<dl><dt>pojem</dt></dl>');
  });

  test('psaní pokračuje v odstavci, když se seznam rozpustí', async ({ page }) => {
    await mount(page, '<dl><dt></dt></dl>');
    await caretInItem(page, 0, 0);
    await clickDefList(page);
    await page.keyboard.type('ven');
    expect(await html(page)).toBe('<p>ven</p>');
  });
});

test.describe('Enter střídá termín a vysvětlení', () => {
  test('za termínem vznikne vysvětlení', async ({ page }) => {
    await mount(page, '<dl><dt>pojem</dt></dl>');
    await caretInItem(page, 0, 5);
    await page.keyboard.press('Enter');
    await page.keyboard.type('vysvetleni');
    expect(await html(page)).toBe('<dl><dt>pojem</dt><dd>vysvetleni</dd></dl>');
  });

  test('za vysvětlením vznikne další termín', async ({ page }) => {
    await mount(page, '<dl><dt>a</dt><dd>b</dd></dl>');
    await caretInItem(page, 1, 1);
    await page.keyboard.press('Enter');
    await page.keyboard.type('dalsi');
    expect(await html(page)).toBe('<dl><dt>a</dt><dd>b</dd><dt>dalsi</dt></dl>');
  });

  test('uprostřed textu přejde druhá půlka na druhý druh', async ({ page }) => {
    await mount(page, '<dl><dt>pojemvyklad</dt></dl>');
    await caretInItem(page, 0, 5);
    await page.keyboard.press('Enter');
    expect(await html(page)).toBe('<dl><dt>pojem</dt><dd>vyklad</dd></dl>');
  });

  test('v prázdném prvku se ze seznamu vystoupí', async ({ page }) => {
    await mount(page, '<dl><dt>a</dt><dd></dd></dl>');
    await caretInItem(page, 1, 0);
    await page.keyboard.press('Enter');
    await page.keyboard.type('za seznamem');
    expect(await html(page)).toBe('<dl><dt>a</dt></dl><p>za seznamem</p>');
  });

  test('celý průchod psaním od prázdného odstavce', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await clickDefList(page);

    await page.keyboard.type('HTML');
    await page.keyboard.press('Enter');
    await page.keyboard.type('znackovaci jazyk');
    await page.keyboard.press('Enter');
    await page.keyboard.type('CSS');
    await page.keyboard.press('Enter');
    await page.keyboard.type('kaskadove styly');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('za seznamem');

    expect(await html(page)).toBe(
      '<dl><dt>HTML</dt><dd>znackovaci jazyk</dd>'
      + '<dt>CSS</dt><dd>kaskadove styly</dd></dl><p>za seznamem</p>');
  });
});

test.describe('Backspace', () => {
  test('na začátku spojí s předchozím prvkem', async ({ page }) => {
    await mount(page, '<dl><dt>pojem</dt><dd>vyklad</dd></dl>');
    await caretInItem(page, 1, 0);
    await page.keyboard.press('Backspace');
    expect(await html(page)).toBe('<dl><dt>pojemvyklad</dt></dl>');
  });

  test('na začátku prvního prvku se ze seznamu vystoupí', async ({ page }) => {
    await mount(page, '<dl><dt>a</dt><dd>b</dd></dl>');
    await caretInItem(page, 0, 0);
    await page.keyboard.press('Backspace');
    await page.keyboard.type('X');
    expect(await html(page)).toBe('<p>Xa</p><dl><dd>b</dd></dl>');
  });

  test('psaní po spojení pokračuje na místě spoje', async ({ page }) => {
    await mount(page, '<dl><dt>ab</dt><dd>cd</dd></dl>');
    await caretInItem(page, 1, 0);
    await page.keyboard.press('Backspace');
    await page.keyboard.type('-');
    expect(await html(page)).toBe('<dl><dt>ab-cd</dt></dl>');
  });
});

test.describe('Tab v seznamu definic needituje', () => {
  test('obsah zůstane, jak byl', async ({ page }) => {
    // Zanořování `<dl>` by znamenalo rozhodnout, jestli se zanořuje termín,
    // vysvětlení, nebo obojí. Tab proto zůstává na fokusu.
    await mount(page, '<dl><dt>a</dt><dd>b</dd></dl>');
    await caretInItem(page, 1, 1);
    await page.keyboard.press('Tab');
    expect(await html(page)).toBe('<dl><dt>a</dt><dd>b</dd></dl>');
  });
});

test.describe('načtený obsah', () => {
  test('při načtení se struktura nesrovnává', async ({ page }) => {
    const broken = '<dl>holy text<dt>a</dt></dl>';
    await mount(page, broken);
    expect(await html(page)).toBe(broken);
  });

  test('srovná se, až když se s ní pracuje', async ({ page }) => {
    await mount(page, '<dl>holy text<dt>a</dt></dl>');
    await caretInItem(page, 0, 1);
    await page.evaluate(() => (window as any).ed.exec('deflist'));
    expect(await html(page)).toBe('<p>holy text</p><p>a</p>');
  });

  test('seznam definic přežije uložení beze změny', async ({ page }) => {
    const original = '<dl>\n<dt>a</dt>\n<dd>b</dd>\n</dl>';
    await mount(page, original);
    expect(await html(page)).toBe(original);
  });
});

test.describe('stav tlačítka', () => {
  test('hlásí, že kurzor je v seznamu definic', async ({ page }) => {
    await mount(page, '<p>mimo</p><dl><dt>a</dt></dl>');

    await caret(page, 0, 1);
    expect(await pressed(page)).toBe(false);

    await caretInItem(page, 0, 1);
    expect(await pressed(page)).toBe(true);
  });

  test('v nabídce Formát je pod Seznamem', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await page.locator('.nb-menubar-item', { hasText: 'Formát' }).click();
    await page.locator('.nb-panel').first().waitFor();
    await page.locator('.nb-panel-label', { hasText: /^Seznam$/ }).click();

    await expect(page.locator('.nb-panel-label', { hasText: /^Seznam definic$/ }))
      .toBeVisible();
  });
});
