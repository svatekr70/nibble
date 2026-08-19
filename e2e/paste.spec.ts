import { expect, test } from '@playwright/test';
import { caret, html, mount } from './helpers.js';

/** Vyvolá vložení se skutečnou událostí a daty schránky. */
async function paste(
  page: import('@playwright/test').Page,
  data: { html?: string; text?: string },
): Promise<void> {
  await page.evaluate((payload) => {
    const dt = new DataTransfer();
    if (payload.html) dt.setData('text/html', payload.html);
    if (payload.text) dt.setData('text/plain', payload.text);
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
