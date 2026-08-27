import { expect, test } from '@playwright/test';
import { html, mount } from './helpers.js';

/**
 * Inline formátování nad výběrem.
 *
 * Musí to být e2e: linkedom `Range` neimplementuje, takže se Formatter
 * v jednotkových testech spustit nedá.
 */

/** Vybere text podle znakových offsetů počítaných napříč celým obsahem. */
async function select(page: import('@playwright/test').Page, from: number, to: number) {
  await page.evaluate(([a, b]) => {
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

    const r = document.createRange();
    const [sn, so] = at(a as number);
    const [en, eo] = at(b as number);
    r.setStart(sn, so);
    r.setEnd(en, eo);
    ed.selection.setRange(r);
    ed.root.focus();
  }, [from, to] as const);
}

const exec = (page: import('@playwright/test').Page, cmd: string, arg?: unknown) =>
  page.evaluate(([c, a]) => {
    const ed = (window as any).ed;
    ed.focus();
    ed.exec(c, a);
  }, [cmd, arg] as const);

test.describe('zapnutí a vypnutí formátu', () => {
  test('obalí vybraný text', async ({ page }) => {
    await mount(page, '<p>abcdef</p>');
    await select(page, 1, 4);
    await exec(page, 'bold');
    expect(await html(page)).toBe('<p>a<strong>bcd</strong>ef</p>');
  });

  test('vnořené formáty se skládají', async ({ page }) => {
    await mount(page, '<p>a<strong>bcd</strong>e</p>');
    await select(page, 2, 3);
    await exec(page, 'italic');
    expect(await html(page)).toBe('<p>a<strong>b<em>c</em>d</strong>e</p>');
  });

  test('výběr přes hranici stávajícího obalu ho rozšíří, nezdvojí', async ({ page }) => {
    await mount(page, '<p>a<strong>bc</strong>def</p>');
    await select(page, 2, 5);
    await exec(page, 'bold');
    expect(await html(page)).toBe('<p>a<strong>bcde</strong>f</p>');
  });

  test('zruší obal nad celým výběrem', async ({ page }) => {
    await mount(page, '<p>a<strong>bcd</strong>ef</p>');
    await select(page, 1, 4);
    await exec(page, 'bold');
    expect(await html(page)).toBe('<p>abcdef</p>');
  });
});

/**
 * Odformátování prostředka.
 *
 * `intersectsNode` bral i uzly, které se rozsahu jen dotýkaly hranicí, takže
 * odtučnění „c" sáhlo i na „b" — formát zmizel i tam, kde ho nikdo nevybral.
 */
test.describe('odformátování části úseku', () => {
  test('prostředek se odformátuje a okraje si formát nechají', async ({ page }) => {
    await mount(page, '<p>a<strong>bcd</strong>ef</p>');
    await select(page, 2, 3);
    await exec(page, 'bold');
    expect(await html(page)).toBe('<p>a<strong>b</strong>c<strong>d</strong>ef</p>');
  });

  test('začátek tučného úseku nechá zbytek tučný', async ({ page }) => {
    await mount(page, '<p><strong>abcd</strong></p>');
    await select(page, 0, 2);
    await exec(page, 'bold');
    expect(await html(page)).toBe('<p>ab<strong>cd</strong></p>');
  });

  test('konec tučného úseku nechá začátek tučný', async ({ page }) => {
    await mount(page, '<p><strong>abcd</strong></p>');
    await select(page, 2, 4);
    await exec(page, 'bold');
    expect(await html(page)).toBe('<p><strong>ab</strong>cd</p>');
  });
});

/**
 * Hranice bloků.
 *
 * Dřív se zapínalo přes `extractContents()` a rozsah přes dva odstavce z nich
 * udělal čtyři: vyjmuté kusy se vložily jako sourozenci. Formátování nesmí
 * měnit strukturu, jen obalit text tam, kde je.
 */
test.describe('formátování přes hranici bloků', () => {
  test('dva odstavce zůstanou dva', async ({ page }) => {
    await mount(page, '<p>abc</p><p>def</p>');
    await select(page, 1, 5);
    await exec(page, 'bold');
    expect(await html(page)).toBe('<p>a<strong>bc</strong></p><p><strong>de</strong>f</p>');
  });

  test('tři odstavce zůstanou tři a prostřední je celý', async ({ page }) => {
    await mount(page, '<p>abc</p><p>def</p><p>ghi</p>');
    await select(page, 2, 8);
    await exec(page, 'italic');
    expect(await html(page)).toBe('<p>ab<em>c</em></p><p><em>def</em></p><p><em>gh</em>i</p>');
  });

  test('položky seznamu zůstanou dvě', async ({ page }) => {
    await mount(page, '<ul><li>abc</li><li>def</li></ul>');
    await select(page, 1, 5);
    await exec(page, 'italic');
    expect(await html(page)).toBe('<ul><li>a<em>bc</em></li><li><em>de</em>f</li></ul>');
  });

  test('nadpis a odstavec si nechají své značky', async ({ page }) => {
    await mount(page, '<h2>abc</h2><p>def</p>');
    await select(page, 1, 5);
    await exec(page, 'bold');
    expect(await html(page)).toBe('<h2>a<strong>bc</strong></h2><p><strong>de</strong>f</p>');
  });

  test('buňky tabulky zůstanou buňkami', async ({ page }) => {
    await mount(page, '<table><tbody><tr><td>abc</td><td>def</td></tr></tbody></table>');
    await select(page, 1, 5);
    await exec(page, 'bold');
    expect(await html(page)).toBe(
      '<table><tbody><tr><td>a<strong>bc</strong></td>'
      + '<td><strong>de</strong>f</td></tr></tbody></table>');
  });

  test('vypnutí přes dva odstavce je nechá dva', async ({ page }) => {
    await mount(page, '<p><strong>abc</strong></p><p><strong>def</strong></p>');
    await select(page, 1, 5);
    await exec(page, 'bold');
    expect(await html(page)).toBe('<p><strong>a</strong>bc</p><p>de<strong>f</strong></p>');
  });
});

test.describe('barvy a písmo přes hranici bloků', () => {
  test('barva nechá odstavce být', async ({ page }) => {
    await mount(page, '<p>abc</p><p>def</p>');
    await select(page, 1, 5);
    await exec(page, 'forecolor', '#ff0000');

    const out = await html(page);
    expect(out).toContain('<p>a<span style="color: rgb(255, 0, 0);">bc</span></p>');
    expect(out).toContain('<p><span style="color: rgb(255, 0, 0);">de</span>f</p>');
  });

  test('písmo nechá položky seznamu být', async ({ page }) => {
    await mount(page, '<ul><li>abc</li><li>def</li></ul>');
    await select(page, 1, 5);
    await exec(page, 'fontfamily', 'Georgia, serif');

    const out = await html(page);
    expect(out).toMatch(/^<ul><li>a<span[^>]*>bc<\/span><\/li><li><span[^>]*>de<\/span>f<\/li><\/ul>$/);
  });

  test('nová barva přepíše starou, nevnořuje se', async ({ page }) => {
    await mount(page, '<p><span style="color: red;">abc</span></p>');
    await select(page, 0, 3);
    await exec(page, 'forecolor', '#0000ff');

    expect(await html(page)).toBe('<p><span style="color: rgb(0, 0, 255);">abc</span></p>');
  });

  test('barva na prostředku nechá okraje původní', async ({ page }) => {
    await mount(page, '<p><span style="color: red;">abcd</span></p>');
    await select(page, 1, 3);
    await exec(page, 'forecolor', '#0000ff');

    const out = await html(page);
    expect(out).toContain('>a<');
    expect(out).toContain('bc');
    expect(await page.evaluate(() => (window as any).ed.root.textContent)).toBe('abcd');
  });
});

/**
 * Horní a dolní index se vylučují.
 *
 * Text nemůže být obojí. Dřív šlo zapnout oba a vzniklo `<sup><sub>…</sub></sup>`.
 */
test.describe('horní a dolní index', () => {
  test('dolní index vypne horní', async ({ page }) => {
    await mount(page, '<p>a<sup>bcd</sup>ef</p>');
    await select(page, 1, 4);
    await exec(page, 'subscript');
    expect(await html(page)).toBe('<p>a<sub>bcd</sub>ef</p>');
  });

  test('horní index vypne dolní', async ({ page }) => {
    await mount(page, '<p>a<sub>bcd</sub>ef</p>');
    await select(page, 1, 4);
    await exec(page, 'superscript');
    expect(await html(page)).toBe('<p>a<sup>bcd</sup>ef</p>');
  });

  test('opakovaný stisk index zase vypne', async ({ page }) => {
    await mount(page, '<p>a<sup>bcd</sup>ef</p>');
    await select(page, 1, 4);
    await exec(page, 'superscript');
    expect(await html(page)).toBe('<p>abcdef</p>');
  });
});
