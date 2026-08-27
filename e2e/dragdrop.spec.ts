import { expect, test } from '@playwright/test';
import { html, mount } from './helpers.js';

/**
 * Přetahování obsahu.
 *
 * Dřív se vložilo tam, kde náhodou stál kurzor — ne tam, kam uživatel pustil
 * myš — a originál zůstal, takže z přesunu byla kopie. Kurzor jde teď za myší
 * už při `dragover`, což platí i pro obrázky, které si vkládá plugin sám.
 */

/**
 * Přetáhne úsek textu na jiné místo.
 *
 * Tažení se skládá z událostí; skutečné držení myši se přes automatizaci
 * spustit nedá, takže se posílají tak, jak by je poslal prohlížeč.
 */
async function drag(
  page: import('@playwright/test').Page,
  from: number, to: number,
  targetBlock: number, targetOffset: number,
  options: { copy?: boolean } = {},
) {
  await page.evaluate(([a, b, tb, to2, copy]) => {
    const ed = (window as any).ed;
    const walker = document.createTreeWalker(ed.root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let n: Node | null;
    while ((n = walker.nextNode())) nodes.push(n as Text);

    const at = (off: number): [Text, number] => {
      let pos = 0;
      for (const t of nodes) {
        if (off <= pos + t.data.length) return [t, off - pos];
        pos += t.data.length;
      }
      const last = nodes[nodes.length - 1]!;
      return [last, last.data.length];
    };

    const source = document.createRange();
    const [sn, so] = at(a as number);
    const [en, eo] = at(b as number);
    source.setStart(sn, so);
    source.setEnd(en, eo);
    ed.selection.setRange(source);
    ed.root.focus();

    const dt = new DataTransfer();
    ed.root.dispatchEvent(new DragEvent('dragstart', {
      dataTransfer: dt, bubbles: true, cancelable: true,
    }));

    // `dragover` posouvá kurzor za myší; tady se cíl nastaví rovnou.
    const block = ed.root.children[tb as number];
    const w2 = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const target = document.createRange();
    target.setStart(w2.nextNode() ?? block, to2 as number);
    target.collapse(true);
    ed.selection.setRange(target);

    ed.root.dispatchEvent(new DragEvent('drop', {
      dataTransfer: dt, bubbles: true, cancelable: true, altKey: !!copy,
    }));
  }, [from, to, targetBlock, targetOffset, options.copy ?? false] as const);

  await page.waitForTimeout(80);
}

test.describe('přetažení uvnitř editoru', () => {
  test('text se přesune, originál zmizí', async ({ page }) => {
    await mount(page, '<p>Prvni odstavec.</p><p>Druhy.</p>');
    await drag(page, 0, 5, 1, 6);

    expect(await html(page)).toBe('<p> odstavec.</p><p>Druhy.Prvni</p>');
  });

  test('přesun dozadu nevyrobí odstavec navíc', async ({ page }) => {
    // Výběr tažený myší běžně začíná na konci předchozího bloku — klon pak
    // nesl prázdnou slupku, ze které při vložení vznikl prázdný odstavec.
    await mount(page, '<p>Prvni.</p><p>Druhy odstavec.</p>');
    await drag(page, 6, 11, 0, 0);

    expect(await html(page)).toBe('<p>DruhyPrvni.</p><p> odstavec.</p>');
  });

  test('s Altem se kopíruje, originál zůstane', async ({ page }) => {
    await mount(page, '<p>Prvni odstavec.</p><p>Druhy.</p>');
    await drag(page, 0, 5, 1, 6, { copy: true });

    expect(await html(page)).toBe('<p>Prvni odstavec.</p><p>Druhy.Prvni</p>');
  });

  test('formátování se přenese', async ({ page }) => {
    await mount(page, '<p>a<strong>tucne</strong>b</p><p>cil.</p>');
    await drag(page, 1, 6, 1, 4);

    expect(await html(page)).toBe('<p>ab</p><p>cil.<strong>tucne</strong></p>');
  });

  test('puštění doprostřed vlastního výběru nic neudělá', async ({ page }) => {
    const original = '<p>Prvni odstavec.</p>';
    await mount(page, original);
    await drag(page, 0, 15, 0, 5);

    expect(await html(page)).toBe(original);
  });

  test('přetažení do položky seznamu skončí uvnitř ní', async ({ page }) => {
    await mount(page, '<p>slovo</p><ul><li>polozka</li></ul>');
    await drag(page, 0, 5, 1, 7);

    expect(await html(page)).toBe('<p><br></p><ul><li><p>polozkaslovo</p></li></ul>');
  });

  test('do schránky tažení nedá spočítané styly', async ({ page }) => {
    await mount(page, '<p>abc <strong>tucne</strong></p>');

    const carried = await page.evaluate(() => {
      const ed = (window as any).ed;
      const r = document.createRange();
      r.selectNodeContents(ed.root.querySelector('strong'));
      ed.selection.setRange(r);
      ed.root.focus();

      const dt = new DataTransfer();
      ed.root.dispatchEvent(new DragEvent('dragstart', {
        dataTransfer: dt, bubbles: true, cancelable: true,
      }));
      return dt.getData('text/html');
    });

    expect(carried).toBe('<strong>tucne</strong>');
  });
});

/**
 * Vložení na místo kurzoru.
 *
 * `ensureBlock` umí obsah položky nebo buňky zabalit do odstavce, čímž
 * přeskládá uzly — a vložený text pak přistál vedle nově vzniklého odstavce
 * místo do něj.
 */
test.describe('vložení do struktury jde na místo kurzoru', () => {
  const insertAt = (page: import('@playwright/test').Page, sel: string, off: number, what: string) =>
    page.evaluate(([s, o, w]) => {
      const ed = (window as any).ed;
      const el = ed.root.querySelector(s as string);
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      ed.selection.collapseTo(walker.nextNode() ?? el, o as number);
      ed.root.focus();
      ed.insertHTML(w as string);
    }, [sel, off, what] as const);

  test('doprostřed položky seznamu', async ({ page }) => {
    await mount(page, '<ul><li>polozka</li></ul>');
    await insertAt(page, 'li', 3, 'X');
    expect(await html(page)).toBe('<ul><li><p>polXozka</p></li></ul>');
  });

  test('doprostřed buňky tabulky', async ({ page }) => {
    await mount(page, '<table><tbody><tr><td>bunka</td></tr></tbody></table>');
    await insertAt(page, 'td', 3, 'X');
    expect(await html(page)).toBe(
      '<table><tbody><tr><td><p>bunXka</p></td></tr></tbody></table>');
  });

  test('doprostřed vysvětlení v seznamu definic', async ({ page }) => {
    await mount(page, '<dl><dt>a</dt><dd>bcd</dd></dl>');
    await insertAt(page, 'dd', 2, 'X');
    expect(await html(page)).toBe('<dl><dt>a</dt><dd><p>bcXd</p></dd></dl>');
  });

  test('do obyčejného odstavce jako dřív', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await insertAt(page, 'p', 2, 'X');
    expect(await html(page)).toBe('<p>teXxt</p>');
  });
});
