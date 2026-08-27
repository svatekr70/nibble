import { expect, test } from '@playwright/test';
import { caret, html, mount } from './helpers.js';

/** Vyvolá vložení se skutečnou událostí a daty schránky. */
async function paste(
  page: import('@playwright/test').Page,
  data: { html?: string; text?: string; image?: boolean },
): Promise<void> {
  await page.evaluate((payload) => {
    const dt = new DataTransfer();
    if (payload.html) dt.setData('text/html', payload.html);
    if (payload.text) dt.setData('text/plain', payload.text);
    // Tabulkové procesory dávají do schránky i náhled zkopírované oblasti.
    // Soubor musí být opravdový soubor — `files` se jinak nenaplní a test by
    // ověřoval něco jiného, než co se děje v prohlížeči.
    if (payload.image) {
      dt.items.add(new File([new Uint8Array([137, 80, 78, 71])], 'image.png', { type: 'image/png' }));
    }
    (window as any).ed.root.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, data);
}

test.describe('vkládání HTML', () => {
  test('do prázdného odstavce', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await paste(page, { html: '<p>vlozeny</p>' });
    await expect.poll(() => html(page)).toBe('<p>vlozeny</p>');
  });

  test('doprostřed věty ji neroztrhne na dva odstavce', async ({ page }) => {
    await mount(page, '<p>zacatekkonec</p>');
    await caret(page, 0, 7);
    await paste(page, { html: '<p>vlozeny</p>' });
    await expect.poll(() => html(page)).toBe('<p>zacatekvlozenykonec</p>');
  });

  test('víc odstavců se rozdělí kolem kurzoru', async ({ page }) => {
    await mount(page, '<p>zacatekkonec</p>');
    await caret(page, 0, 7);
    await paste(page, { html: '<p>prvni</p><p>druhy</p>' });
    await expect.poll(() => html(page)).toBe('<p>zacatekprvni</p><p>druhykonec</p>');
  });

  test('inline obsah zůstane v odstavci', async ({ page }) => {
    await mount(page, '<p>ab</p>');
    await caret(page, 0, 1);
    await paste(page, { html: '<strong>X</strong>' });
    await expect.poll(() => html(page)).toBe('<p>a<strong>X</strong>b</p>');
  });
});

test.describe('vkládání z Google Docs', () => {
  test('atributy zdrojové aplikace neprojdou', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await paste(page, {
      html: '<meta charset="utf-8"><b id="docs-internal-guid-1a2b" style="font-weight:normal">'
        + '<p dir="ltr" role="presentation"><span style="font-family:Arial;font-size:11pt;'
        + 'color:#000000;background-color:transparent">text z dokumentu</span></p></b>',
      text: 'text z dokumentu',
    });

    const out = await html(page);
    expect(out).not.toContain('docs-internal-guid');
    expect(out).not.toContain('dir=');
    expect(out).not.toContain('role=');
    expect(out).not.toContain('font-family');
    expect(out).toContain('text z dokumentu');
  });

  test('seznam z Docs přijde jako seznam', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await paste(page, {
      html: '<ul><li dir="ltr" aria-level="1"><p dir="ltr" role="presentation">'
        + '<span style="color:#000000">polozka</span></p></li></ul>',
    });
    await expect.poll(() => html(page)).toContain('<li>');
    expect(await html(page)).not.toContain('aria-level');
  });
});

test.describe('vkládání z Wordu', () => {
  test('hlavička dokumentu a mso styly neprojdou', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await paste(page, {
      html: '<html xmlns:o="urn:schemas-microsoft-com:office:office"><head>'
        + '<meta name=Generator content="Microsoft Word 15"><style>p.MsoNormal{margin:0}</style>'
        + '</head><body><!--StartFragment--><p class="MsoNormal" '
        + 'style="margin:0cm;font-family:Calibri;color:windowtext">odstavec z Wordu<o:p></o:p></p>'
        + '<!--EndFragment--></body></html>',
      text: 'odstavec z Wordu',
    });

    const out = await html(page);
    expect(out).toBe('<p>odstavec z Wordu</p>');
  });

  test('odrážky z Wordu se poskládají do seznamu', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await paste(page, {
      html: '<!--StartFragment-->'
        + '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">· prvni</p>'
        + '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">· druhy</p>'
        + '<!--EndFragment-->',
    });
    await expect.poll(() => html(page)).toBe('<ul><li>prvni</li><li>druhy</li></ul>');
  });
});

test.describe('bezpečnost při vkládání', () => {
  test('skript ze schránky neprojde', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await paste(page, { html: '<p>text</p><script>window.__zlo = 1;</script>' });

    await expect.poll(() => html(page)).toBe('<p>text</p>');
    expect(await page.evaluate(() => (window as any).__zlo)).toBeUndefined();
  });

  test('on* atribut ze schránky neprojde', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await paste(page, { html: '<p onmouseover="window.__zlo=1">text</p>' });
    await expect.poll(() => html(page)).toBe('<p>text</p>');
  });

  test('javascript: odkaz ze schránky přijde bez adresy', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await paste(page, { html: '<p><a href="javascript:alert(1)">klik</a></p>' });
    const out = await html(page);
    expect(out).not.toContain('javascript:');
    expect(out).toContain('klik');
  });

  test('událost pasteclean ohlásí, co se zahodilo', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await page.evaluate(() => {
      (window as any).ohlaseno = [];
      (window as any).ed.on('pasteclean',
        (e: any) => (window as any).ohlaseno.push(e));
    });
    await caret(page, 0, 0);
    await paste(page, { html: '<p>t</p><script>x</script>' });

    await expect.poll(() => page.evaluate(() => (window as any).ohlaseno.length))
      .toBeGreaterThan(0);
  });
});

test.describe('vkládání čistého textu', () => {
  test('prázdný řádek dělí odstavce', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await paste(page, { text: 'prvni\n\ndruhy' });
    await expect.poll(() => html(page)).toBe('<p>prvni</p><p>druhy</p>');
  });

  test('Markdown se převede, když má výrazný znak', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await paste(page, { text: '# Nadpis\n\nText s **tučným** slovem.' });
    await expect.poll(() => html(page))
      .toBe('<h1>Nadpis</h1><p>Text s <strong>tučným</strong> slovem.</p>');
  });

  test('obyčejná věta s pomlčkou se za Markdown nepovažuje', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await paste(page, { text: '- jediná odrážka' });
    await expect.poll(() => html(page)).toBe('<p>- jediná odrážka</p>');
  });

  test('Ctrl+Shift+V vloží HTML jako text', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.press('ControlOrMeta+Shift+v');
    await paste(page, { html: '<p><strong>tučně</strong></p>', text: 'tučně' });
    await expect.poll(() => html(page)).toBe('<p>tučně</p>');
  });
});

test.describe('vkládání z tabulkového procesoru', () => {
  test('tabulka má přednost před náhledem ve schránce', async ({ page }) => {
    // Excel posílá tabulku i její obrázek zároveň. Bez rozlišení by v obsahu
    // skončil obrázek a s tabulkou by už nikdo nic neudělal.
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await paste(page, {
      html: '<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>',
      text: 'a\tb',
      image: true,
    });
    await expect.poll(() => html(page)).toContain('<td>a</td>');
    await expect.poll(() => html(page)).not.toContain('<img');
  });

  test('samotný obrázek si dál bere plugin obrázků', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await paste(page, { html: '<img src="file:///C:/tmp/x.png">', image: true });
    await expect.poll(() => html(page)).not.toContain('file:///');
  });

  test('sloučené buňky a šířky sloupců projdou', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await paste(page, {
      html: '<table><colgroup><col width="300"><col width="33"></colgroup><tbody>'
        + '<tr><td colspan="2" style="background-color:#1f497d">nadpis</td></tr>'
        + '<tr><td>a</td><td>b</td></tr></tbody></table>',
    });
    const out = await html(page);
    expect(out).toContain('colspan="2"');
    expect(out).toContain('width="300"');
    expect(out).toContain('background-color: #1f497d');
  });
});

/**
 * Kopírování uvnitř editoru.
 *
 * Chrome do `text/html` přibalí spočítané styly — `color`, `background-color`,
 * `text-align: start` — a vložení zpátky do editoru je přinese, přestože je
 * nikdo nenastavil. Nibble proto schránku plní sám.
 */
test.describe('kopírování uvnitř editoru', () => {
  /** Vyvolá `copy` s vlastní schránkou a vrátí, co do ní editor zapsal. */
  const copied = (page: import('@playwright/test').Page) =>
    page.evaluate(() => {
      const ed = (window as any).ed;
      const dt = new DataTransfer();
      ed.root.dispatchEvent(new ClipboardEvent('copy', {
        clipboardData: dt, bubbles: true, cancelable: true,
      }));
      return { html: dt.getData('text/html'), text: dt.getData('text/plain') };
    });

  async function selectInside(page: import('@playwright/test').Page, selector: string) {
    await page.evaluate((sel) => {
      const ed = (window as any).ed;
      const el = ed.root.querySelector(sel);
      const r = document.createRange();
      r.selectNodeContents(el);
      ed.selection.setRange(r);
      ed.root.focus();
    }, selector);
  }

  test('do schránky jde čisté HTML bez spočítaných stylů', async ({ page }) => {
    await mount(page, '<p>abc <strong>tucne</strong> def</p>');
    await selectInside(page, 'strong');

    const out = await copied(page);
    expect(out.html).toBe('<strong>tucne</strong>');
    expect(out.text).toBe('tucne');
    expect(out.html).not.toContain('style=');
  });

  test('obal nad výběrem se do schránky přenese', async ({ page }) => {
    // `cloneContents` sám vrátí jen holý text — tučnost by se ztratila.
    await mount(page, '<p><em><strong>abc</strong></em></p>');
    await selectInside(page, 'strong');

    expect(await copied(page)).toMatchObject({ html: '<em><strong>abc</strong></em>' });
  });

  test('barva zadaná uživatelem se zachová', async ({ page }) => {
    await mount(page, '<p><span style="color: rgb(255, 0, 0);">abc</span></p>');
    await selectInside(page, 'span');

    expect((await copied(page)).html).toContain('color: rgb(255, 0, 0)');
  });

  test('vyjmutí nenechá prázdný obal ani pevnou mezeru', async ({ page }) => {
    await mount(page, '<p>abc <strong>tucne</strong> def</p>');
    await selectInside(page, 'strong');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      const dt = new DataTransfer();
      ed.root.dispatchEvent(new ClipboardEvent('cut', {
        clipboardData: dt, bubbles: true, cancelable: true,
      }));
    });

    const out = await html(page);
    expect(out).not.toContain('<strong>');
    expect(out).not.toContain('&nbsp;');
  });
});

/**
 * Google Docs kolem zkopírovaného úseku dává
 * `<b style="font-weight:normal" id="docs-internal-guid-…">` — kontejner, ne
 * formátování. `<b>` kolem `<p>` je navíc neplatné HTML.
 */
test.describe('inline obal kolem bloku', () => {
  const vloz = (page: import('@playwright/test').Page, source: string) =>
    page.evaluate((src) => {
      const ed = (window as any).ed;
      ed.selection.collapseTo(ed.root.children[0].firstChild, 1);
      ed.root.focus();
      const dt = new DataTransfer();
      dt.setData('text/html', src);
      ed.root.dispatchEvent(new ClipboardEvent('paste', {
        clipboardData: dt, bubbles: true, cancelable: true,
      }));
    }, source);

  test('obalovací <b> z Google Docs se rozbalí', async ({ page }) => {
    await mount(page, '<p>X</p>');
    await vloz(page, '<b style="font-weight:normal" id="docs-internal-guid-1">'
      + '<p dir="ltr"><span style="font-size:11pt">Docs text</span></p></b>');

    await expect.poll(() => html(page)).toBe('<p>XDocs text</p>');
  });

  test('<span> kolem tabulky se rozbalí, tabulka zůstane', async ({ page }) => {
    await mount(page, '<p>X</p>');
    await vloz(page, '<span><table><tbody><tr><td>a</td></tr></tbody></table></span>');

    await expect.poll(() => html(page)).toContain('<table>');
    expect(await html(page)).not.toContain('<span>');
  });

  test('tučné kolem obyčejného textu zůstane tučné', async ({ page }) => {
    // Pravidlo platí jen na obal kolem bloku — běžné formátování se nesmí ztratit.
    await mount(page, '<p>X</p>');
    await vloz(page, '<b>tucny text</b>');

    await expect.poll(() => html(page)).toContain('tucny text');
    expect(await html(page)).toMatch(/<(b|strong)>/);
  });
});

/**
 * Číslování z Wordu.
 *
 * Word posílá seznamy jako odstavce se značkou v textu. Kdo psal římskými
 * číslicemi, chtěl římské číslice — sem se to dostane až přes celý řetěz
 * čištění, takže to stojí za ověření i v prohlížeči.
 */
test.describe('seznam z Wordu si nechá druh číslování', () => {
  const item = (marker: string, text: string) =>
    '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">'
    + `<span style="mso-list:Ignore">${marker}<span style="font:7.0pt">&nbsp;&nbsp; </span></span>`
    + `${text}</p>`;

  const vloz = (page: import('@playwright/test').Page, source: string) =>
    page.evaluate((src) => {
      const ed = (window as any).ed;
      ed.selection.collapseTo(ed.root.children[0].firstChild, 1);
      ed.root.focus();
      const dt = new DataTransfer();
      dt.setData('text/html', src);
      ed.root.dispatchEvent(new ClipboardEvent('paste', {
        clipboardData: dt, bubbles: true, cancelable: true,
      }));
    }, source);

  test('římské číslice přežijí vložení', async ({ page }) => {
    await mount(page, '<p>X</p>');
    await vloz(page, item('i.', 'Prvni') + item('ii.', 'Druhy'));

    await expect.poll(() => html(page)).toContain('type="i"');
    const out = await html(page);
    expect(out).toContain('list-style-type: lower-roman');
    expect(out).toContain('<li>Prvni</li>');
    expect(out).not.toContain('i.&nbsp;');
  });

  test('písmena taky', async ({ page }) => {
    await mount(page, '<p>X</p>');
    await vloz(page, item('a.', 'Prvni') + item('b.', 'Druhy'));

    await expect.poll(() => html(page)).toContain('type="a"');
    expect(await html(page)).toContain('<li>Prvni</li>');
  });

  test('vložený seznam se dá dál upravovat', async ({ page }) => {
    await mount(page, '<p>X</p>');
    await vloz(page, item('i.', 'Prvni') + item('ii.', 'Druhy'));
    await expect.poll(() => html(page)).toContain('<ol');

    // Enter na konci poslední položky přidá další — druh číslování zůstane.
    await page.evaluate(() => {
      const ed = (window as any).ed;
      const last = [...ed.root.querySelectorAll('li')].pop()!;
      ed.selection.collapseTo(last.firstChild, (last.textContent ?? '').length);
      ed.root.focus();
      ed.exec('insertParagraph');
    });
    await page.keyboard.type('Treti');

    const out = await html(page);
    expect(out).toContain('type="i"');
    expect(out).toContain('<li>Treti</li>');
  });
});
