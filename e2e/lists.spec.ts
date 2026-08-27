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

/**
 * Kurzor po operaci se seznamem.
 *
 * Testy výš kontrolují jen výslednou strukturu, a ta bývala v pořádku i tehdy,
 * když kurzor skončil mimo ni. Uživateli se to projevilo tak, že po zapnutí
 * číslovaného seznamu zůstala v editoru osamocená „1." a první napsané písmeno
 * spadlo za seznam. Tyhle testy proto po každé operaci píšou.
 */
test.describe('kurzor po operaci se seznamem', () => {
  for (const kind of ['bullist', 'numlist'] as const) {
    test(`psaní pokračuje v nové položce (${kind})`, async ({ page }) => {
      await mount(page, '<p><br></p>');
      await caret(page, 0, 0);
      await page.locator(`.nb-btn[data-control=${kind}]`).click();
      await page.keyboard.type('polozka');
      const tag = kind === 'bullist' ? 'ul' : 'ol';
      expect(await html(page)).toBe(`<${tag}><li>polozka</li></${tag}>`);
    });
  }

  test('psaní pokračuje v položce i u neprázdného odstavce', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await caret(page, 0, 4);
    await page.locator('.nb-btn[data-control=numlist]').click();
    await page.keyboard.type('!');
    expect(await html(page)).toBe('<ol><li>text!</li></ol>');
  });

  test('psaní pokračuje v odstavci, když seznam vypne tlačítko', async ({ page }) => {
    await mount(page, '<ul><li>a</li><li></li></ul>');
    await caretInItem(page, 1, 0);
    await page.locator('.nb-btn[data-control=bullist]').click();
    await page.keyboard.type('ven');
    expect(await html(page)).toBe('<ul><li>a</li></ul><p>ven</p>');
  });

  test('psaní pokračuje za seznamem po Enteru v prázdné položce', async ({ page }) => {
    await mount(page, '<ul><li>a</li><li></li></ul>');
    await caretInItem(page, 1, 0);
    await page.keyboard.press('Enter');
    await page.keyboard.type('za seznamem');
    expect(await html(page)).toBe('<ul><li>a</li></ul><p>za seznamem</p>');
  });

  test('psaní pokračuje v položce po Enteru v prázdné zanořené položce', async ({ page }) => {
    await mount(page, '<ul><li>a<ul><li></li></ul></li></ul>');
    await caretInItem(page, 1, 0);
    await page.keyboard.press('Enter');
    await page.keyboard.type('vys');
    expect(await html(page)).toBe('<ul><li>a</li><li>vys</li></ul>');
  });

  test('psaní pokračuje v odstavci po Backspace v prázdné první položce', async ({ page }) => {
    await mount(page, '<ul><li></li><li>b</li></ul>');
    await caretInItem(page, 0, 0);
    await page.keyboard.press('Backspace');
    await page.keyboard.type('ven');
    expect(await html(page)).toBe('<p>ven</p><ul><li>b</li></ul>');
  });

  test('obalení holého textu seznam vedle sebe nespolkne', async ({ page }) => {
    // Holý text v kořeni dostane odstavec až při první úpravě. Seznam není
    // `isBlock`, takže bez vlastní hranice by se do toho odstavce svezl s ním.
    await mount(page, '<ol><li>a</li></ol>holy text');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      ed.selection.collapseTo(ed.root.lastChild, 4);
      ed.root.focus();
    });
    await page.keyboard.type('!');
    expect(await html(page)).toBe('<ol><li>a</li></ol><p>holy! text</p>');
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

/**
 * Vlastnosti seznamu — druh značky, odsazení, počáteční číslo.
 *
 * Zapisuje se atribut i styl současně, aby zvolený druh přečetl i renderer,
 * který inline styly seznamu nedodrží. Testy proto hlídají obojí.
 */
test.describe('vlastnosti seznamu', () => {
  async function openProps(page: import('@playwright/test').Page, item = 0) {
    await caretInItem(page, item, 1);
    await page.evaluate(() => (window as any).ed.ui.get('listprops').onAction((window as any).ed));
    await page.locator('.nb-dialog[open]').waitFor();
  }

  const apply = (page: import('@playwright/test').Page) =>
    page.locator('.nb-dialog-btn-primary').click();

  /**
   * Zavře dialog a počká, až zmizí z DOMu.
   *
   * Bez toho čekání by `openProps` v témže testu uviděl ještě ten zavírající se
   * a četl pole z něj — projde to samostatně, ale ne v plném běhu.
   */
  async function cancel(page: import('@playwright/test').Page): Promise<void> {
    await page.locator('.nb-dialog-btn', { hasText: 'Zrušit' }).click();
    await page.locator('.nb-dialog').waitFor({ state: 'detached' });
  }

  test('dialog předvyplní, co seznam má', async ({ page }) => {
    await mount(page, '<ol type="a" start="3" style="list-style-position: inside;"><li>a</li></ol>');
    await openProps(page);

    await expect(page.locator('.nb-dialog [name=marker0]')).toHaveValue('lower-alpha');
    await expect(page.locator('.nb-dialog [name=start0]')).toHaveValue('3');
    await expect(page.locator('.nb-dialog [name=position0]')).toHaveValue('inside');
  });

  test('druh značky se zapíše atributem i stylem', async ({ page }) => {
    await mount(page, '<ol><li>a</li></ol>');
    await openProps(page);
    await page.locator('.nb-dialog [name=marker0]').selectOption('upper-roman');
    await apply(page);

    await expect.poll(() => html(page)).toContain('type="I"');
    expect(await html(page)).toContain('list-style-type: upper-roman');
  });

  test('odrážky nabízejí své druhy, ne čísla', async ({ page }) => {
    await mount(page, '<ul><li>a</li></ul>');
    await openProps(page);

    const values = await page.locator('.nb-dialog [name=marker0] option')
      .evaluateAll((els) => els.map((el) => (el as HTMLOptionElement).value));
    expect(values).toEqual(['', 'disc', 'circle', 'square', '"– "', '"→ "', '"✓ "', 'none']);
  });

  /**
   * Znaková odrážka. `list-style-type` bere i řetězec, takže se obejde bez
   * stylopisu u obsahu — na rozdíl od oddělovače za číslem, který Nibble
   * proto nenabízí.
   */
  test('znaková odrážka se uloží jako řetězec', async ({ page }) => {
    await mount(page, '<ul><li>a</li></ul>');
    await openProps(page);
    await page.locator('.nb-dialog [name=marker0]').selectOption('"– "');
    await apply(page);

    // Uvozovky uvnitř `style` se serializují jako `&quot;` — v atributu je to
    // tak správně a prohlížeč to přečte zpátky, viz test níž.
    await expect.poll(() => html(page)).toContain('list-style-type: &quot;– &quot;');
    expect(await html(page)).not.toContain('type=');
  });

  test('znaková odrážka se v dialogu pozná zpátky', async ({ page }) => {
    await mount(page, '<ul style=\'list-style-type: "→ "\'><li>a</li></ul>');
    await openProps(page);
    await expect(page.locator('.nb-dialog [name=marker0]')).toHaveValue('"→ "');
  });

  test('uložená znaková odrážka se načte a prohlížeč ji vykreslí', async ({ page }) => {
    await mount(page, '<ul style="list-style-type: &quot;– &quot;;"><li>a</li></ul>');
    const marker = await page.locator('.nb-content ul').evaluate(
      (el) => getComputedStyle(el).listStyleType);
    expect(marker).toBe('"– "');
  });

  test('„bez značky" zapíše jen styl — atribut na to není', async ({ page }) => {
    await mount(page, '<ul><li>a</li></ul>');
    await openProps(page);
    await page.locator('.nb-dialog [name=marker0]').selectOption('none');
    await apply(page);

    await expect.poll(() => html(page)).toContain('list-style-type: none');
    expect(await html(page)).not.toContain('type=');
  });

  test('start se nabízí u čísel, u odrážek ne', async ({ page }) => {
    await mount(page, '<ol><li>a</li></ol>');
    await openProps(page);
    await expect(page.locator('.nb-dialog [name=start0]')).toBeVisible();
    await cancel(page);

    await mount(page, '<ul><li>a</li></ul>');
    await openProps(page);
    await expect(page.locator('.nb-dialog [name=start0]')).toHaveCount(0);
  });

  test('každá úroveň se nastaví nezávisle', async ({ page }) => {
    await mount(page, '<ul><li>a<ol><li>b</li></ol></li></ul>');
    await openProps(page, 1);

    await page.locator('.nb-dialog [name=marker0]').selectOption('square');
    await page.locator('.nb-dialog [name=marker1]').selectOption('upper-alpha');
    await apply(page);

    await expect.poll(() => html(page)).toContain(
      '<ul type="square" style="list-style-type: square;">');
    expect(await html(page)).toContain('<ol type="A" style="list-style-type: upper-alpha;">');
  });

  test('dialog ukáže tolik úrovní, kolik jich nad kurzorem je', async ({ page }) => {
    await mount(page, '<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul></li></ul>');

    await openProps(page, 0);
    await expect(page.locator('.nb-dialog [name^=marker]')).toHaveCount(1);
    await cancel(page);

    await openProps(page, 2);
    await expect(page.locator('.nb-dialog [name^=marker]')).toHaveCount(3);
  });

  test('sourozenecký seznam zůstane nedotčený', async ({ page }) => {
    await mount(page, '<ol><li>a</li></ol><ol><li>b</li></ol>');
    await openProps(page, 0);
    await page.locator('.nb-dialog [name=marker0]').selectOption('lower-alpha');
    await apply(page);

    await expect.poll(() => html(page)).toBe(
      '<ol type="a" style="list-style-type: lower-alpha;"><li>a</li></ol>'
      + '<ol><li>b</li></ol>');
  });

  /**
   * Záruka zachování obsahu. Zápis do `style` jde přes CSSOM, který atribut
   * přepíše kanonickým tvarem — kdo dialog jen otevře a potvrdí, tím jinak
   * přeformátuje blok, kterého se nedotkl.
   */
  test('otevřít a potvrdit beze změny nic nepřepíše', async ({ page }) => {
    const original = '<ol type="a" style="list-style-type:lower-alpha" start="3"><li>a</li></ol>';
    await mount(page, original);
    await openProps(page);
    await apply(page);
    await page.locator('.nb-dialog').waitFor({ state: 'detached' });

    expect(await html(page)).toBe(original);
  });

  test('zrušení dialogu nic nemění', async ({ page }) => {
    const original = '<ul><li>a</li></ul>';
    await mount(page, original);
    await openProps(page);
    await cancel(page);

    expect(await html(page)).toBe(original);
  });

  test('tlačítko se nabízí v seznamu, jinde ne', async ({ page }) => {
    await mount(page, '<p>mimo</p><ul><li>a</li></ul>');

    await caret(page, 0, 1);
    await expect(page.locator('.nb-context .nb-btn[data-control=listprops]')).toBeHidden();

    await caretInItem(page, 0, 1);
    await expect(page.locator('.nb-context .nb-btn[data-control=listprops]')).toBeVisible();
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
