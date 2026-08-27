import { expect, test } from '@playwright/test';
import { caret, html, mount, select } from './helpers.js';

test.describe('vložené médium', () => {
  test('YouTube odkaz se převede na vkládací rámec', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.locator('.nb-toolbar .nb-btn[data-control=media]').click();
    await page.locator('.nb-dialog[open]').waitFor();
    await page.locator('.nb-dialog [name=src]').fill('https://www.youtube.com/watch?v=abc123');
    await page.locator('.nb-dialog-btn-primary').click();

    await expect.poll(() => html(page))
      .toContain('src="https://www.youtube-nocookie.com/embed/abc123"');
  });

  test('přímý odkaz na soubor dá <video>', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.evaluate(() =>
      (window as any).ed.exec('media', { src: 'https://example.com/klip.mp4' }));
    await expect.poll(() => html(page)).toContain('<video');
  });

  test('neznámý zdroj se odmítne s vysvětlením', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    const ok = await page.evaluate(() =>
      (window as any).ed.exec('media', { src: 'https://zlo.example/video' }));

    expect(ok).toBe(false);
    await expect(page.locator('.nb-note-error')).toBeVisible();
    expect(await html(page)).toBe('<p><br></p>');
  });

  test('rámec z nepovoleného zdroje se při načtení zahodí', async ({ page }) => {
    await mount(page, '<p>a</p><iframe src="https://zlo.example/x"></iframe>');
    expect(await html(page)).toBe('<p>a</p>');
  });

  test('rámec z povoleného zdroje se při načtení zachová', async ({ page }) => {
    const original = '<p><iframe src="https://www.youtube-nocookie.com/embed/x" '
      + 'width="560" height="315"></iframe></p>';
    await mount(page, original);
    expect(await html(page)).toBe(original);
  });
});

test.describe('zdrojový kód', () => {
  test('otevření a zavření beze změny obsah nezmění', async ({ page }) => {
    const original = '<p class=a>&iacute;text</p>';
    await mount(page, original);
    await caret(page, 0, 1);

    await page.locator('.nb-toolbar .nb-btn[data-control=code]').click();
    await page.locator('.nb-dialog[open]').waitFor();
    await page.locator('.nb-dialog-btn-primary').click();
    await page.locator('.nb-dialog').waitFor({ state: 'detached' });

    // Pouhé nahlédnutí do zdroje nesmí dokument přeformátovat.
    expect(await html(page)).toBe(original);
  });

  test('dialog ukazuje výstup getHTML, ne innerHTML', async ({ page }) => {
    await mount(page, '<p class=a>&iacute;text</p>');
    await caret(page, 0, 1);
    await page.locator('.nb-toolbar .nb-btn[data-control=code]').click();
    await page.locator('.nb-dialog[open]').waitFor();
    await expect(page.locator('.nb-code-input')).toHaveValue('<p class=a>&iacute;text</p>');
  });

  test('úprava zdroje se projeví', async ({ page }) => {
    await mount(page, '<p>puvodni</p>');
    await caret(page, 0, 1);
    await page.locator('.nb-toolbar .nb-btn[data-control=code]').click();
    await page.locator('.nb-dialog[open]').waitFor();
    await page.locator('.nb-code-input').fill('<h2>novy</h2>');
    await page.locator('.nb-dialog-btn-primary').click();

    await expect.poll(() => html(page)).toBe('<h2>novy</h2>');
  });
});

test.describe('psaní do jednoho textového uzlu', () => {
  /**
   * Vypadá to jako optimalizace, ale je to podmínka funkčnosti. Kdyby každý
   * úhoz zakládal vlastní textový uzel, mělo by napsané slovo tolik uzlů kolik
   * písmen — a cokoli, co se dívá na `text.data` (automatické odkazy,
   * typografie, hledání), by vidělo vždycky jen poslední znak.
   */
  test('napsané slovo je jeden uzel, ne jeden na písmeno', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('ahoj svete');

    const uzlu = await page.evaluate(() => {
      const p = (window as any).ed.root.querySelector('p')!;
      return [...p.childNodes].filter((n) => n.nodeType === 3).length;
    });
    expect(uzlu).toBe(1);
  });

  test('hledání najde slovo napsané po písmenech', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('kocka');

    await page.evaluate(() => (window as any).ed.exec('searchreplace'));
    await page.locator('.nb-dialog[open]').waitFor();
    await page.locator('.nb-dialog [name=find]').fill('kocka');
    await page.locator('.nb-dialog [name=replace]').fill('pes');
    await page.locator('.nb-dialog-btn-primary').click();

    await expect.poll(() => html(page)).toBe('<p>pes</p>');
  });
});

test.describe('automatické odkazy', () => {
  test('adresa se po mezeře stane odkazem', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('https://example.com ');
    await expect.poll(() => html(page)).toContain('<a href="https://example.com">');
  });

  test('e-mail dostane mailto:', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('nekdo@example.com ');
    await expect.poll(() => html(page)).toContain('href="mailto:nekdo@example.com"');
  });

  test('obyčejné slovo se odkazem nestane', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('normalni text ');
    expect(await html(page)).not.toContain('<a ');
  });

  test('uvnitř existujícího odkazu se nic nepřepisuje', async ({ page }) => {
    await mount(page, '<p><a href="/x">https://example.com</a></p>');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      const a = ed.root.querySelector('a')!;
      ed.selection.collapseTo(a.firstChild!, a.textContent!.length);
      ed.root.focus();
    });
    await page.keyboard.type(' ');
    expect((await html(page)).match(/<a /g)).toHaveLength(1);
  });
});

test.describe('stavový řádek', () => {
  test('ukazuje počet slov a znaků', async ({ page }) => {
    await mount(page, '<p>jedno dve tri</p>');
    await expect(page.locator('.nb-status[data-status=wordcount]'))
      .toContainText('3 slov');
  });

  test('po napsání se přepočítá', async ({ page }) => {
    await mount(page, '<p>jedno</p>');
    await caret(page, 0, 5);
    await page.keyboard.type(' dve');
    await expect(page.locator('.nb-status[data-status=wordcount]'))
      .toContainText('2 slov');
  });
});

test.describe('celá obrazovka', () => {
  test('přepnutí a návrat Escapem', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await caret(page, 0, 1);

    await page.locator('.nb-toolbar .nb-btn[data-control=fullscreen]').click();
    await expect(page.locator('.nb.nb-fullscreen')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.nb.nb-fullscreen')).toHaveCount(0);
  });
});

test.describe('hledání a nahrazování', () => {
  test('nahradí všechny výskyty', async ({ page }) => {
    await mount(page, '<p>kocka a kocka</p>');
    await caret(page, 0, 1);
    await page.locator('.nb-toolbar .nb-btn[data-control=searchreplace]').click();
    await page.locator('.nb-dialog[open]').waitFor();
    await page.locator('.nb-dialog [name=find]').fill('kocka');
    await page.locator('.nb-dialog [name=replace]').fill('pes');
    await page.locator('.nb-dialog-btn-primary').click();

    await expect.poll(() => html(page)).toBe('<p>pes a pes</p>');
  });

  test('nenalezeno se ohlásí', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await caret(page, 0, 1);
    await page.locator('.nb-toolbar .nb-btn[data-control=searchreplace]').click();
    await page.locator('.nb-dialog[open]').waitFor();
    await page.locator('.nb-dialog [name=find]').fill('neexistuje');
    await page.locator('.nb-dialog-btn-primary').click();

    await expect(page.locator('.nb-note-warn')).toBeVisible();
  });

  test('nesáhne na značky, jen na text', async ({ page }) => {
    await mount(page, '<p class="kocka">kocka</p>');
    await caret(page, 0, 1);
    await page.evaluate(() => (window as any).ed.exec('searchreplace'));
    await page.locator('.nb-dialog[open]').waitFor();
    await page.locator('.nb-dialog [name=find]').fill('kocka');
    await page.locator('.nb-dialog [name=replace]').fill('pes');
    await page.locator('.nb-dialog-btn-primary').click();

    await expect.poll(() => html(page)).toBe('<p class="kocka">pes</p>');
  });
});

/**
 * Panel hledání.
 *
 * Nemodální schválně — nález se ukazuje v obsahu, takže na obsah musí být
 * vidět a musí se v něm dát dál pracovat. Testy proto kontrolují i to,
 * že panel po akci zůstane otevřený.
 */
test.describe('krokování nálezů', () => {
  const panel = '.nb-dialog-modeless';
  const btn = (page: import('@playwright/test').Page, label: string) =>
    page.locator(`${panel} .nb-dialog-btn`, { hasText: new RegExp(`^${label}$`) });

  /** Co je právě zvýrazněné. Panel nesahá do DOMu, kreslí přes CSS.highlights. */
  const zvyrazneno = (page: import('@playwright/test').Page) =>
    page.evaluate(() => {
      const hl = (window as any).CSS?.highlights?.get('nb-find');
      return hl ? [...hl][0].toString() : null;
    });

  const stav = (page: import('@playwright/test').Page) =>
    page.evaluate(() => (window as any).ed.ui.getStatus().get('find') ?? null);

  async function otevri(page: import('@playwright/test').Page, obsah: string, hledat: string) {
    await mount(page, obsah);
    await caret(page, 0, 0);
    await page.evaluate(() => (window as any).ed.exec('searchreplace'));
    await page.locator(`${panel}[open]`).waitFor();
    await page.locator(`${panel} [name=find]`).fill(hledat);
  }

  test('panel je nemodální, aby bylo na obsah vidět', async ({ page }) => {
    await otevri(page, '<p>alfa</p>', 'alfa');
    // `showModal()` by přidal backdrop a editor znepřístupnil.
    expect(await page.locator(panel).evaluate((el) => (el as HTMLDialogElement).matches(':modal')))
      .toBe(false);
  });

  test('Najít další prochází nálezy a počítá je', async ({ page }) => {
    await otevri(page, '<p>alfa beta alfa</p><p>alfa</p>', 'alfa');

    await btn(page, 'Najít další').click();
    await expect.poll(() => stav(page)).toBe('1 z 3');
    expect(await zvyrazneno(page)).toBe('alfa');

    await btn(page, 'Najít další').click();
    await expect.poll(() => stav(page)).toBe('2 z 3');
  });

  test('za posledním nálezem se pokračuje od prvního', async ({ page }) => {
    await otevri(page, '<p>alfa beta alfa</p>', 'alfa');
    for (let i = 0; i < 3; i++) await btn(page, 'Najít další').click();
    await expect.poll(() => stav(page)).toBe('1 z 2');
  });

  test('nálezy se hledají bez ohledu na velikost písmen', async ({ page }) => {
    await otevri(page, '<p>Alfa a ALFA a alfa</p>', 'alfa');
    await btn(page, 'Najít další').click();
    await expect.poll(() => stav(page)).toBe('1 z 3');
    expect(await zvyrazneno(page)).toBe('Alfa');
  });

  test('Rozlišovat velikost písmen zúží nálezy', async ({ page }) => {
    await otevri(page, '<p>Alfa a ALFA a alfa</p>', 'alfa');
    await page.locator(`${panel} [name=matchCase]`).check();
    await btn(page, 'Najít další').click();
    await expect.poll(() => stav(page)).toBe('1 z 1');
    expect(await zvyrazneno(page)).toBe('alfa');
  });

  test('Nahradit vymění jen ten jeden nález', async ({ page }) => {
    await otevri(page, '<p>alfa beta alfa</p>', 'alfa');
    await page.locator(`${panel} [name=replace]`).fill('gama');
    await btn(page, 'Najít další').click();
    await btn(page, 'Nahradit').click();

    await expect.poll(() => html(page)).toBe('<p>gama beta alfa</p>');
  });

  test('po nahrazení se rovnou stojí na dalším nálezu', async ({ page }) => {
    await otevri(page, '<p>alfa beta alfa</p>', 'alfa');
    await page.locator(`${panel} [name=replace]`).fill('gama');
    await btn(page, 'Najít další').click();
    await btn(page, 'Nahradit').click();

    // Zbyl jediný nález a panel na něm stojí — další Nahradit vymění právě jeho.
    await expect.poll(() => stav(page)).toBe('1 z 1');
    await btn(page, 'Nahradit').click();
    await expect.poll(() => html(page)).toBe('<p>gama beta gama</p>');
  });

  test('Nahradit bez předchozího hledání vezme první nález', async ({ page }) => {
    await otevri(page, '<p>alfa beta alfa</p>', 'alfa');
    await page.locator(`${panel} [name=replace]`).fill('gama');
    await btn(page, 'Nahradit').click();

    await expect.poll(() => html(page)).toBe('<p>gama beta alfa</p>');
  });

  test('panel po Najít další i Nahradit zůstane otevřený', async ({ page }) => {
    await otevri(page, '<p>alfa alfa</p>', 'alfa');
    await page.locator(`${panel} [name=replace]`).fill('gama');
    await btn(page, 'Najít další').click();
    await expect(page.locator(`${panel}[open]`)).toBeVisible();
    await btn(page, 'Nahradit').click();
    await expect(page.locator(`${panel}[open]`)).toBeVisible();
  });

  test('změna hledaného textu začne počítat znovu od prvního', async ({ page }) => {
    await otevri(page, '<p>alfa beta alfa beta</p>', 'alfa');
    await btn(page, 'Najít další').click();
    await btn(page, 'Najít další').click();
    await expect.poll(() => stav(page)).toBe('2 z 2');

    await page.locator(`${panel} [name=find]`).fill('beta');
    await btn(page, 'Najít další').click();
    await expect.poll(() => stav(page)).toBe('1 z 2');
    expect(await zvyrazneno(page)).toBe('beta');
  });

  test('Nahradit vše dodělá zbytek a panel zavře', async ({ page }) => {
    await otevri(page, '<p>alfa beta alfa</p>', 'alfa');
    await page.locator(`${panel} [name=replace]`).fill('gama');
    await btn(page, 'Najít další').click();
    await page.locator(`${panel} .nb-dialog-btn-primary`).click();

    await expect.poll(() => html(page)).toBe('<p>gama beta gama</p>');
    await expect(page.locator(panel)).toHaveCount(0);
  });

  test('zavření panelu uklidí zvýraznění i počítadlo', async ({ page }) => {
    await otevri(page, '<p>alfa beta</p>', 'alfa');
    await btn(page, 'Najít další').click();
    await btn(page, 'Zavřít').click();
    await page.locator(panel).waitFor({ state: 'detached' });

    expect(await zvyrazneno(page)).toBe(null);
    expect(await stav(page)).toBe(null);
  });

  test('po zavření zůstane kurzor na posledním nálezu', async ({ page }) => {
    await otevri(page, '<p>alfa beta alfa</p>', 'beta');
    await btn(page, 'Najít další').click();
    await btn(page, 'Zavřít').click();
    await page.locator(panel).waitFor({ state: 'detached' });

    // Obnova výběru se odkládá o tik, protože prohlížeč po zavření dialogu
    // vrací fokus asynchronně.
    await expect.poll(() => page.evaluate(() => (window as any).ed.selection.getText()))
      .toBe('beta');
  });

  test('hledání nesáhne do obsahu, dokud se nenahrazuje', async ({ page }) => {
    const original = '<p>alfa <strong>beta</strong> alfa</p>';
    await otevri(page, original, 'alfa');
    await btn(page, 'Najít další').click();
    await btn(page, 'Najít další').click();

    expect(await html(page)).toBe(original);
  });
});

test.describe('česká typografie', () => {
  test('uvozovky se sázejí česky', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('rekl "ahoj"');
    await expect.poll(() => html(page)).toBe('<p>rekl „ahoj“</p>');
  });

  test('tři tečky se stanou výpustkou', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('a tak dale...');
    await expect.poll(() => html(page)).toContain('…');
  });

  test('dvě pomlčky se stanou pomlčkou', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('slovo -- druhe');
    await expect.poll(() => html(page)).toContain('–');
  });
});

test.describe('vzhled dialogu', () => {
  test('pole má stejné odsazení vlevo i vpravo', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await caret(page, 0, 1);
    await page.locator('.nb-toolbar .nb-btn[data-control=code]').click();
    await page.locator('.nb-dialog[open]').waitFor();

    // Bez box-sizing: border-box přeteče `width: 100%` o odsazení a rámeček.
    const mezery = await page.evaluate(() => {
      const dialog = document.querySelector('dialog.nb-dialog')!.getBoundingClientRect();
      const field = document.querySelector('.nb-dialog .nb-input')!.getBoundingClientRect();
      return {
        vlevo: Math.round(field.left - dialog.left),
        vpravo: Math.round(dialog.right - field.right),
      };
    });

    expect(mezery.vlevo).toBe(mezery.vpravo);
    expect(mezery.vlevo).toBeGreaterThan(10);
  });

  test('okno se zdrojovým kódem jde zvětšit', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await caret(page, 0, 1);
    await page.locator('.nb-toolbar .nb-btn[data-control=code]').click();
    await page.locator('.nb-dialog[open]').waitFor();

    // `resize` bez `overflow: auto` je bez účinku — obojí musí sedět.
    const style = await page.evaluate(() => {
      const dialog = document.querySelector('.nb-dialog')!;
      const computed = getComputedStyle(dialog);
      return { resize: computed.resize, overflow: computed.overflow };
    });
    expect(style.resize).toBe('both');
    expect(style.overflow).not.toBe('visible');
  });

  test('okno je podstatně větší než běžný dialog', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await caret(page, 0, 1);
    await page.locator('.nb-toolbar .nb-btn[data-control=code]').click();
    await page.locator('.nb-dialog[open]').waitFor();

    const size = await page.locator('.nb-dialog').boundingBox();
    expect(size!.width).toBeGreaterThan(700);
    expect(size!.height).toBeGreaterThan(450);
  });
});

/**
 * Kdo si otevře zdroj, chce pokračovat tam, kde byl — ne hledat v pěti
 * kilobajtech HTML odstavec, na kterém stál.
 */
test.describe('zdrojový kód si pamatuje, kde jste byli', () => {
  async function openSource(page: import('@playwright/test').Page) {
    await page.locator('.nb-toolbar .nb-btn[data-control=code]').click();
    await page.locator('.nb-code-input').waitFor();
  }

  test('kurzor skočí na odpovídající místo ve zdroji', async ({ page }) => {
    await mount(page, '<p>prvni</p><h2>druhy</h2><p>treti</p>');
    // Kurzor doprostřed nadpisu.
    await caret(page, 1, 3);
    await openSource(page);

    const around = await page.evaluate(() => {
      const area = document.querySelector('.nb-code-input') as HTMLTextAreaElement;
      return area.value.slice(area.selectionStart - 8, area.selectionStart + 4);
    });
    expect(around).toContain('dru');
  });

  test('označený text zůstane označený', async ({ page }) => {
    await mount(page, '<p>abcdef</p><p>ghijkl</p>');
    await select(page, 1, 1, 4);
    await openSource(page);

    const selected = await page.evaluate(() => {
      const area = document.querySelector('.nb-code-input') as HTMLTextAreaElement;
      return area.value.slice(area.selectionStart, area.selectionEnd);
    });
    expect(selected).toBe('hij');
  });

  test('entity se počítají po jednom znaku', async ({ page }) => {
    // `&iacute;` je v HTML osm znaků, pro čtenáře jedno písmeno.
    await mount(page, '<p>a&iacute;&iacute;b</p><p>CIL</p>');
    await caret(page, 1, 3);
    await openSource(page);

    const before = await page.evaluate(() => {
      const area = document.querySelector('.nb-code-input') as HTMLTextAreaElement;
      return area.value.slice(0, area.selectionStart);
    });
    expect(before.endsWith('CIL')).toBe(true);
  });

  test('kurzor se ze zdroje vrátí zpátky do obsahu', async ({ page }) => {
    await mount(page, '<p>prvni</p><p>druhy</p>');
    await caret(page, 0, 0);
    await openSource(page);

    // Přepsat obsah a postavit kurzor do druhého odstavce.
    await page.evaluate(() => {
      const area = document.querySelector('.nb-code-input') as HTMLTextAreaElement;
      area.value = '<p>prvni</p><p>zmeneny</p>';
      const at = area.value.indexOf('zmeneny') + 3;
      area.setSelectionRange(at, at);
    });
    await page.locator('.nb-dialog-btn-primary').click();

    await expect.poll(() => page.evaluate(() => {
      const range = (window as any).ed.selection.getRange();
      return range?.startContainer.nodeValue;
    })).toBe('zmeneny');
  });
});

test.describe('zvýraznění syntaxe', () => {
  test('značky a atributy jsou obarvené', async ({ page }) => {
    await mount(page, '<p class="x">text</p>');
    await caret(page, 0, 1);
    await page.locator('.nb-toolbar .nb-btn[data-control=code]').click();
    await page.locator('.nb-code-input').waitFor();

    await expect(page.locator('.nb-hl-tag').first()).toHaveText('p');
    await expect(page.locator('.nb-hl-attr').first()).toHaveText('class');
    await expect(page.locator('.nb-hl-value').first()).toHaveText('"x"');
  });

  test('obarvená kopie sedí s textem znak na znak', async ({ page }) => {
    await mount(page, '<p>a&iacute;b</p><h2>nadpis</h2>');
    await caret(page, 0, 1);
    await page.locator('.nb-toolbar .nb-btn[data-control=code]').click();
    await page.locator('.nb-code-input').waitFor();

    // Kdyby se rozešly, kurzor by stál jinde, než co je vidět.
    const same = await page.evaluate(() => {
      const area = document.querySelector('.nb-code-input') as HTMLTextAreaElement;
      const pre = document.querySelector('.nb-code-hl')!;
      return pre.textContent!.replace(/\n$/, '') === area.value;
    });
    expect(same).toBe(true);
  });

  test('zvýraznění se přepočítá při psaní', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await caret(page, 0, 1);
    await page.locator('.nb-toolbar .nb-btn[data-control=code]').click();
    await page.locator('.nb-code-input').waitFor();

    await page.locator('.nb-code-input').fill('<h3 id="novy">obsah</h3>');
    await expect(page.locator('.nb-hl-attr').first()).toHaveText('id');
  });
});

test.describe('vrstvy zdrojového kódu sedí na sobě', () => {
  test('obarvená kopie má stejný obdélník jako text', async ({ page }) => {
    await mount(page, '<p>a</p>' + '<p>vypln vypln vypln</p>'.repeat(60));
    await caret(page, 0, 1);
    await page.locator('.nb-toolbar .nb-btn[data-control=code]').click();
    await page.locator('.nb-code-input').waitFor();

    // Různě vysoké vrstvy = obarvení se roluje jinak než text a část
    // dokumentu zmizí. Ukotvení na stejný obdélník to hlídá.
    const boxes = await page.evaluate(() => {
      const area = document.querySelector('.nb-code-input')!;
      const pre = document.querySelector('.nb-code-hl')!;
      const a = area.getBoundingClientRect();
      const p = pre.getBoundingClientRect();
      const sa = getComputedStyle(area);
      const sp = getComputedStyle(pre);
      return {
        stejnyVrsek: Math.round(a.top) === Math.round(p.top),
        stejnyLevyOkraj: Math.round(a.left) === Math.round(p.left),
        stejnaTypografie: sa.fontFamily === sp.fontFamily
          && sa.fontSize === sp.fontSize
          && sa.lineHeight === sp.lineHeight
          && sa.padding === sp.padding,
        vyska: Math.round(p.height),
      };
    });

    // Rozhoduje, že řádky leží na sobě: stejný začátek a stejná typografie.
    // Rozdíl v celkové výšce o pruh posuvníku sazbu neovlivní.
    expect(boxes.stejnyVrsek).toBe(true);
    expect(boxes.stejnyLevyOkraj).toBe(true);
    expect(boxes.stejnaTypografie).toBe(true);
    expect(boxes.vyska).toBeGreaterThan(300);
  });

  test('rolování drží obě vrstvy v zákrytu', async ({ page }) => {
    await mount(page, '<p>a</p>' + '<p>vypln</p>'.repeat(80));
    await caret(page, 0, 1);
    await page.locator('.nb-toolbar .nb-btn[data-control=code]').click();
    await page.locator('.nb-code-input').waitFor();

    await page.evaluate(() => {
      const area = document.querySelector('.nb-code-input') as HTMLTextAreaElement;
      area.scrollTop = 400;
      area.dispatchEvent(new Event('scroll'));
    });

    expect(await page.evaluate(() => {
      const area = document.querySelector('.nb-code-input') as HTMLTextAreaElement;
      const pre = document.querySelector('.nb-code-hl')!;
      return area.scrollTop === pre.scrollTop;
    })).toBe(true);
  });
});

/**
 * `<pre>` a `<textarea>` jsou běžné značky, na které má hostitelská stránka
 * často vlastní pravidla. Stačilo `pre { max-height: 260px }` kvůli výpisu
 * jinde na stránce a půlka zdrojového kódu v dialogu zmizela — `max-height`
 * přebije i výšku nastavenou inline.
 */
test.describe('styly hostitelské stránky editoru nerozbijí kód', () => {
  test('cizí max-height na <pre> nezkrátí obarvenou vrstvu', async ({ page }) => {
    await mount(page, '<p>a</p>' + '<p>vypln</p>'.repeat(60));

    await page.addStyleTag({ content: `
      pre { max-height: 120px; max-width: 200px; padding: 40px; }
      textarea { max-height: 90px; }
    ` });

    await caret(page, 0, 1);
    await page.locator('.nb-toolbar .nb-btn[data-control=code]').click();
    await page.locator('.nb-code-input').waitFor();

    const boxes = await page.evaluate(() => {
      const area = document.querySelector('.nb-code-input')!.getBoundingClientRect();
      const pre = document.querySelector('.nb-code-hl')!.getBoundingClientRect();
      return {
        area: Math.round(area.height), pre: Math.round(pre.height),
        stejnyVrsek: Math.round(area.top) === Math.round(pre.top),
      };
    });

    // Obarvená vrstva nesmí být nižší než text — přesně to dělalo cizí
    // `max-height` a půlka kódu zmizela. Rozdíl na výšku posuvníku je v pořádku.
    expect(boxes.pre).toBeGreaterThanOrEqual(boxes.area);
    expect(boxes.stejnyVrsek).toBe(true);
    expect(boxes.pre).toBeGreaterThan(300);
  });

  test('cizí písmo na <pre> vrstvy nerozejde', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await page.addStyleTag({ content: 'pre { font-size: 22px; line-height: 3; }' });

    await caret(page, 0, 1);
    await page.locator('.nb-toolbar .nb-btn[data-control=code]').click();
    await page.locator('.nb-code-input').waitFor();

    const same = await page.evaluate(() => {
      const area = getComputedStyle(document.querySelector('.nb-code-input')!);
      const pre = getComputedStyle(document.querySelector('.nb-code-hl')!);
      return area.fontSize === pre.fontSize && area.lineHeight === pre.lineHeight;
    });
    expect(same).toBe(true);
  });
});

test.describe('označený úsek ve zdroji je čitelný', () => {
  test('pozadí výběru je průsvitné', async ({ page }) => {
    await mount(page, '<p>abcdef</p>');
    await select(page, 0, 1, 4);
    await page.locator('.nb-toolbar .nb-btn[data-control=code]').click();
    await page.locator('.nb-code-input').waitFor();

    // Krycí pozadí by zakrylo obarvenou kopii pod textareou a z označeného
    // úseku by zbyl prázdný obdélník.
    const background = await page.evaluate(() => {
      const style = getComputedStyle(
        document.querySelector('.nb-code-input')!, '::selection');
      return style.backgroundColor;
    });

    expect(background).toMatch(/^rgba\(/);
    const alpha = Number(/rgba\([^)]*,\s*([\d.]+)\)/.exec(background)?.[1] ?? '1');
    expect(alpha).toBeLessThan(0.6);
    expect(alpha).toBeGreaterThan(0);
  });
});

test.describe('zalamování ve zdrojovém kódu', () => {
  async function openSource(page: import('@playwright/test').Page) {
    await page.locator('.nb-toolbar .nb-btn[data-control=code]').click();
    await page.locator('.nb-code-input').waitFor();
  }

  test('je zapnuté a vodorovný posuvník není potřeba', async ({ page }) => {
    await mount(page, '<p>' + 'dlouhy text bez zalomeni '.repeat(40) + '</p>');
    await caret(page, 0, 1);
    await openSource(page);

    const stav = await page.evaluate(() => {
      const area = document.querySelector('.nb-code-input') as HTMLTextAreaElement;
      return {
        zaskrtnuto: (document.querySelector('.nb-code-wrap input') as HTMLInputElement).checked,
        posuvnik: area.scrollWidth > area.clientWidth,
        zalomeni: getComputedStyle(area).whiteSpace,
      };
    });

    expect(stav.zaskrtnuto).toBe(true);
    expect(stav.zalomeni).toBe('pre-wrap');
    expect(stav.posuvnik).toBe(false);
  });

  test('vypnutí zalamování přepne obě vrstvy naráz', async ({ page }) => {
    await mount(page, '<p>' + 'dlouhy text '.repeat(40) + '</p>');
    await caret(page, 0, 1);
    await openSource(page);

    await page.locator('.nb-code-wrap input').uncheck();

    // Kdyby zalamovala jen jedna vrstva, rozešly by se řádky a obarvení by
    // přestalo sedět na textu.
    const styly = await page.evaluate(() => {
      const area = getComputedStyle(document.querySelector('.nb-code-input')!);
      const pre = getComputedStyle(document.querySelector('.nb-code-hl')!);
      return { area: area.whiteSpace, pre: pre.whiteSpace };
    });

    expect(styly.area).toBe('pre');
    expect(styly.pre).toBe('pre');
  });

  test('zapnuté zalamování drží obě vrstvy taky', async ({ page }) => {
    await mount(page, '<p>' + 'dlouhy text '.repeat(40) + '</p>');
    await caret(page, 0, 1);
    await openSource(page);

    const styly = await page.evaluate(() => ({
      area: getComputedStyle(document.querySelector('.nb-code-input')!).whiteSpace,
      pre: getComputedStyle(document.querySelector('.nb-code-hl')!).whiteSpace,
    }));

    expect(styly.area).toBe('pre-wrap');
    expect(styly.pre).toBe('pre-wrap');
  });

  test('volba se pamatuje na příště', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await caret(page, 0, 1);
    await openSource(page);
    await page.locator('.nb-code-wrap input').uncheck();
    await page.locator('.nb-dialog-btn', { hasText: 'Zrušit' }).click();

    await caret(page, 0, 1);
    await openSource(page);
    await expect(page.locator('.nb-code-wrap input')).not.toBeChecked();

    // Uklidit, ať další testy začínají s výchozím stavem.
    await page.locator('.nb-code-wrap input').check();
  });

  test('kurzor najde své místo i se zalamováním', async ({ page }) => {
    // Řádky se nedají počítat podle `\n` — jeden logický zabírá několik
    // vizuálních. Měří se proto výška textu ke kurzoru.
    // Dost dlouhé na to, aby se rolovat muselo i se zalamováním.
    await mount(page, '<p>vypln vypln vypln</p>'.repeat(200) + '<p>CILOVY ODSTAVEC</p>');
    await caret(page, 200, 3);
    await openSource(page);

    const stav = await page.evaluate(() => {
      const area = document.querySelector('.nb-code-input') as HTMLTextAreaElement;
      return {
        odrolovano: area.scrollTop > 0,
        naKonci: area.scrollTop + area.clientHeight >= area.scrollHeight - 40,
        okoli: area.value.slice(area.selectionStart - 6, area.selectionStart + 4),
      };
    });

    expect(stav.odrolovano).toBe(true);
    expect(stav.naKonci).toBe(true);
    expect(stav.okoli).toContain('CIL');
  });
});
