import { expect, test } from '@playwright/test';
import { caret, html, mount, select } from './helpers.js';

test.describe('Enter', () => {
  test('rozdělí odstavec v místě kurzoru', async ({ page }) => {
    await mount(page, '<p>prvnidruhy</p>');
    await caret(page, 0, 5);
    await page.keyboard.press('Enter');
    expect(await html(page)).toBe('<p>prvni</p><p>druhy</p>');
  });

  test('na konci nadpisu založí odstavec, ne další nadpis', async ({ page }) => {
    await mount(page, '<h2>Nadpis</h2>');
    await caret(page, 0, 6);
    await page.keyboard.press('Enter');
    expect(await html(page)).toBe('<h2>Nadpis</h2><p><br></p>');
  });

  test('na začátku bloku vloží prázdný odstavec před něj', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await caret(page, 0, 0);
    await page.keyboard.press('Enter');
    expect(await html(page)).toBe('<p><br></p><p>text</p>');
  });

  test('v předformátovaném bloku dělá nový řádek, ne nový blok', async ({ page }) => {
    await mount(page, '<pre>prvni</pre>');
    await caret(page, 0, 5);
    await page.keyboard.press('Enter');
    await page.keyboard.type('druhy');
    expect(await html(page)).toBe('<pre>prvni\ndruhy</pre>');
  });

  test('prázdný odstavec v citaci z ní vystoupí ven', async ({ page }) => {
    await mount(page, '<blockquote><p>citace</p></blockquote>');
    await caret(page, 0, 6);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    expect(await html(page)).toBe('<blockquote><p>citace</p></blockquote><p><br></p>');
  });
});

test.describe('Backspace a Delete', () => {
  test('na začátku bloku sloučí s předchozím', async ({ page }) => {
    await mount(page, '<p>prvni</p><p>druhy</p>');
    await caret(page, 1, 0);
    await page.keyboard.press('Backspace');
    expect(await html(page)).toBe('<p>prvnidruhy</p>');
  });

  test('na konci bloku přitáhne následující', async ({ page }) => {
    await mount(page, '<p>prvni</p><p>druhy</p>');
    await caret(page, 0, 5);
    await page.keyboard.press('Delete');
    expect(await html(page)).toBe('<p>prvnidruhy</p>');
  });

  test('na začátku prvního nadpisu z něj udělá odstavec', async ({ page }) => {
    await mount(page, '<h2>Nadpis</h2>');
    await caret(page, 0, 0);
    await page.keyboard.press('Backspace');
    expect(await html(page)).toBe('<p>Nadpis</p>');
  });

  test('smaže oddělovač před kurzorem', async ({ page }) => {
    await mount(page, '<p>a</p><hr><p>b</p>');
    await caret(page, 2, 0);
    await page.keyboard.press('Backspace');
    expect(await html(page)).toBe('<p>a</p><p>b</p>');
  });

  test('smaže vybraný text', async ({ page }) => {
    await mount(page, '<p>abcdef</p>');
    await select(page, 0, 1, 4);
    await page.keyboard.press('Backspace');
    expect(await html(page)).toBe('<p>aef</p>');
  });
});

/**
 * Smazání výběru přes víc bloků.
 *
 * `deleteContents()` bloky vyprázdní, ale nechá je stát: z výběru přes tři
 * odstavce zbyly dva prázdné krajní a kurzor skončil mezi nimi — v kořeni,
 * kde další psaní vyrobilo holý text mimo blok.
 */
test.describe('mazání výběru přes bloky', () => {
  /** Vybere od offsetu v jednom bloku po offset v jiném. */
  async function across(
    page: import('@playwright/test').Page,
    fromBlock: number, fromOffset: number, toBlock: number, toOffset: number,
  ) {
    await page.evaluate(([fb, fo, tb, to]) => {
      const ed = (window as any).ed;
      const text = (i: number) => {
        const w = document.createTreeWalker(ed.root.children[i], NodeFilter.SHOW_TEXT);
        return (w.nextNode() ?? ed.root.children[i]) as Node;
      };
      const r = document.createRange();
      r.setStart(text(fb as number), fo as number);
      r.setEnd(text(tb as number), to as number);
      ed.selection.setRange(r);
      ed.root.focus();
    }, [fromBlock, fromOffset, toBlock, toOffset] as const);
  }

  test('zbytky krajních odstavců se spojí do jednoho', async ({ page }) => {
    await mount(page, '<p>abc</p><p>def</p><p>ghi</p>');
    await across(page, 0, 1, 2, 2);
    await page.keyboard.press('Backspace');

    expect(await html(page)).toBe('<p>ai</p>');
  });

  test('psaní po smazání pokračuje v tom odstavci, ne mimo něj', async ({ page }) => {
    await mount(page, '<p>abc</p><p>def</p><p>ghi</p>');
    await across(page, 0, 1, 2, 2);
    await page.keyboard.press('Backspace');
    await page.keyboard.type('X');

    expect(await html(page)).toBe('<p>aXi</p>');
  });

  test('výběr uvnitř jednoho odstavce se chová jako dřív', async ({ page }) => {
    await mount(page, '<p>abcdef</p>');
    await across(page, 0, 1, 0, 4);
    await page.keyboard.press('Backspace');
    await page.keyboard.type('X');

    expect(await html(page)).toBe('<p>aXef</p>');
  });

  test('Delete maže výběr stejně jako Backspace', async ({ page }) => {
    await mount(page, '<p>abc</p><p>def</p>');
    await across(page, 0, 1, 1, 2);
    await page.keyboard.press('Delete');

    expect(await html(page)).toBe('<p>af</p>');
  });

  test('nadpis a odstavec se spojí do toho prvního', async ({ page }) => {
    await mount(page, '<h2>abc</h2><p>def</p>');
    await across(page, 0, 1, 1, 2);
    await page.keyboard.press('Backspace');

    expect(await html(page)).toBe('<h2>af</h2>');
  });

  test('položky seznamu se spojí a seznam zůstane', async ({ page }) => {
    await mount(page, '<ul><li>abc</li><li>def</li></ul>');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      const li = ed.root.querySelectorAll('li');
      const r = document.createRange();
      r.setStart(li[0].firstChild, 1);
      r.setEnd(li[1].firstChild, 2);
      ed.selection.setRange(r);
      ed.root.focus();
    });
    await page.keyboard.press('Backspace');

    expect(await html(page)).toBe('<ul><li>af</li></ul>');
  });
});

/**
 * Ctrl+A a smazat.
 *
 * Nejběžnější úkon vůbec — a zbývaly po něm prázdné slupky: `<h2></h2>`
 * a `<ul><li></li></ul>`, do kterých pak psaní pokračovalo.
 */
test.describe('smazání celého obsahu', () => {
  const selectAll = (page: import('@playwright/test').Page) =>
    page.evaluate(() => {
      const ed = (window as any).ed;
      ed.root.focus();
      ed.exec('selectall');
    });

  test('po smazání všeho zbude prázdný odstavec', async ({ page }) => {
    await mount(page, '<h2>Nadpis</h2><p>text</p><ul><li>a</li></ul>');
    await selectAll(page);
    await page.keyboard.press('Backspace');

    expect(await html(page)).toBe('<p><br></p>');
  });

  test('psaní po smazání všeho jde do toho odstavce', async ({ page }) => {
    await mount(page, '<h2>Nadpis</h2><p>text</p><ul><li>a</li></ul>');
    await selectAll(page);
    await page.keyboard.press('Backspace');
    await page.keyboard.type('novy text');

    expect(await html(page)).toBe('<p>novy text</p>');
  });

  test('po smazání všeho nezbude prázdný seznam', async ({ page }) => {
    await mount(page, '<ul><li>a</li><li>b</li></ul>');
    await selectAll(page);
    await page.keyboard.press('Backspace');

    expect(await html(page)).toBe('<p><br></p>');
  });

  test('smazání všeho i s tabulkou', async ({ page }) => {
    await mount(page, '<p>a</p><table><tbody><tr><td>b</td></tr></tbody></table>');
    await selectAll(page);
    await page.keyboard.press('Backspace');

    expect(await html(page)).toBe('<p><br></p>');
  });
});

test.describe('druh bloku', () => {
  test('výběr v liště přepne odstavec na nadpis', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await caret(page, 0, 2);
    await page.selectOption('.nb-select[data-control=blocks]', 'h2');
    expect(await html(page)).toBe('<h2>text</h2>');
  });

  test('výběr přes víc bloků přepne všechny', async ({ page }) => {
    await mount(page, '<p>a</p><p>b</p>');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      const range = document.createRange();
      range.setStart(ed.root.children[0], 0);
      range.setEnd(ed.root.children[1], 1);
      ed.selection.setRange(range);
      ed.root.focus();
    });
    await page.selectOption('.nb-select[data-control=blocks]', 'h3');
    expect(await html(page)).toBe('<h3>a</h3><h3>b</h3>');
  });

  test('citace se přepne zpět na odstavec', async ({ page }) => {
    await mount(page, '<blockquote>text</blockquote>');
    await caret(page, 0, 2);
    await page.selectOption('.nb-select[data-control=blocks]', 'p');
    expect(await html(page)).toBe('<p>text</p>');
  });

  test('výběr ukazuje blok pod kurzorem', async ({ page }) => {
    await mount(page, '<h3>nadpis</h3><p>text</p>');
    await caret(page, 0, 1);
    await expect.poll(() => page.inputValue('.nb-select[data-control=blocks]')).toBe('h3');
    await caret(page, 1, 1);
    await expect.poll(() => page.inputValue('.nb-select[data-control=blocks]')).toBe('p');
  });
});

/**
 * Vyčistit formát.
 *
 * Dřív se dělalo přes `extractContents()` a nechávalo po sobě prázdné slupky
 * `<strong></strong>`, odkaz dokonce zdvojilo, a na části úseku ani na
 * vnořeném formátu neudělalo nic.
 */
test.describe('vyčistit formát', () => {
  async function sel(page: import('@playwright/test').Page, from: number, to: number) {
    await page.evaluate(([a, b]) => {
      const ed = (window as any).ed;
      const w = document.createTreeWalker(ed.root, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      let n: Node | null;
      while ((n = w.nextNode())) nodes.push(n as Text);
      const at = (off: number): [Text, number] => {
        let p = 0;
        for (const t of nodes) {
          if (off <= p + t.data.length) return [t, off - p];
          p += t.data.length;
        }
        const l = nodes[nodes.length - 1]!;
        return [l, l.data.length];
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

  const clear = (page: import('@playwright/test').Page) =>
    page.evaluate(() => {
      const ed = (window as any).ed;
      ed.focus();
      ed.exec('removeFormat');
    });

  test('sundá formát a nenechá po sobě prázdný obal', async ({ page }) => {
    await mount(page, '<p>a<strong>bcd</strong>ef</p>');
    await sel(page, 1, 4);
    await clear(page);
    expect(await html(page)).toBe('<p>abcdef</p>');
  });

  test('vnořené formáty sundá oba', async ({ page }) => {
    await mount(page, '<p><strong><em>abc</em></strong></p>');
    await sel(page, 0, 3);
    await clear(page);
    expect(await html(page)).toBe('<p>abc</p>');
  });

  test('část úseku se vyčistí a zbytek si formát nechá', async ({ page }) => {
    await mount(page, '<p>a<strong>bcd</strong>ef</p>');
    await sel(page, 2, 3);
    await clear(page);
    expect(await html(page)).toBe('<p>a<strong>b</strong>c<strong>d</strong>ef</p>');
  });

  test('barva zmizí se spanem, který ji nesl', async ({ page }) => {
    await mount(page, '<p><span style="color: red;">abc</span></p>');
    await sel(page, 0, 3);
    await clear(page);
    expect(await html(page)).toBe('<p>abc</p>');
  });

  test('odkaz zůstane a nezdvojí se', async ({ page }) => {
    // Cíl odkazu nikdo mazat nechtěl — na to je vlastní tlačítko.
    await mount(page, '<p>a<a href="https://x.cz"><strong>bcd</strong></a>ef</p>');
    await sel(page, 1, 4);
    await clear(page);
    expect(await html(page)).toBe('<p>a<a href="https://x.cz">bcd</a>ef</p>');
  });

  test('značka bloku i jeho zarovnání zůstávají', async ({ page }) => {
    await mount(page, '<h2 style="text-align: center;"><strong>abc</strong></h2>');
    await sel(page, 0, 3);
    await clear(page);
    expect(await html(page)).toBe('<h2 style="text-align: center;">abc</h2>');
  });

  test('vyčištění napříč odstavci je nechá být', async ({ page }) => {
    await mount(page, '<p><strong>abc</strong></p><p><em>def</em></p>');
    await sel(page, 1, 5);
    await clear(page);
    expect(await html(page)).toBe('<p><strong>a</strong>bc</p><p>de<em>f</em></p>');
  });

  test('na nenaformátovaném textu neudělá nic', async ({ page }) => {
    const original = '<p>abcdef</p>';
    await mount(page, original);
    await sel(page, 1, 4);
    await clear(page);
    expect(await html(page)).toBe(original);
  });
});

test.describe('zarovnání a oddělovač', () => {
  test('zarovnání na střed zapíše styl', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await caret(page, 0, 1);
    await page.locator('.nb-btn[data-control=aligncenter]').click();
    expect(await html(page)).toBe('<p style="text-align: center;">text</p>');
  });

  test('zarovnání vlevo styl zase odstraní', async ({ page }) => {
    await mount(page, '<p style="text-align: center;">text</p>');
    await caret(page, 0, 1);
    await page.locator('.nb-btn[data-control=alignleft]').click();
    expect(await html(page)).toBe('<p>text</p>');
  });

  test('oddělovač se vloží a za ním je kam psát', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await caret(page, 0, 4);
    await page.locator('.nb-btn[data-control=hr]').click();
    await page.keyboard.type('dal');
    expect(await html(page)).toBe('<p>text</p><hr><p>dal</p>');
  });

  test('zrušení formátování sundá inline značky', async ({ page }) => {
    await mount(page, '<p><strong>tučné</strong> a <em>kurzíva</em></p>');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      const range = document.createRange();
      range.selectNodeContents(ed.root.children[0]);
      ed.selection.setRange(range);
      ed.root.focus();
    });
    await page.locator('.nb-btn[data-control=removeformat]').click();
    expect(await html(page)).toBe('<p>tučné a kurzíva</p>');
  });
});

test.describe('přepnutí bloku zachová atributy', () => {
  test('pořadí i hodnoty atributů zůstanou', async ({ page }) => {
    await mount(page, '<p class="x" style="text-align: center;" dir="ltr">t</p>');
    await caret(page, 0, 1);
    await page.selectOption('.nb-select[data-control=blocks]', 'h3');
    expect(await html(page)).toBe('<h3 class="x" style="text-align: center;" dir="ltr">t</h3>');
  });
});

/**
 * Rozsahy (Range) se v linkedom testovat nedají — nemá `setStart`. Dělení
 * a slučování bloků se proto ověřuje tady, přes skutečné klávesy.
 */
test.describe('dělení bloků přes rozsah', () => {
  test('rozdělení zachová inline formátování v obou půlkách', async ({ page }) => {
    await mount(page, '<p><strong>prvni</strong><em>druhy</em></p>');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      const em = ed.root.querySelector('em')!;
      ed.selection.collapseTo(em.firstChild!, 0);
      ed.root.focus();
    });
    await page.keyboard.press('Enter');
    expect(await html(page)).toBe('<p><strong>prvni</strong></p><p><em>druhy</em></p>');
  });

  test('rozdělení uprostřed obalu obal zdvojí', async ({ page }) => {
    await mount(page, '<p><strong>prvnidruhy</strong></p>');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      const strong = ed.root.querySelector('strong')!;
      ed.selection.collapseTo(strong.firstChild!, 5);
      ed.root.focus();
    });
    await page.keyboard.press('Enter');
    expect(await html(page)).toBe('<p><strong>prvni</strong></p><p><strong>druhy</strong></p>');
  });
});

test.describe('zarovnání do bloku', () => {
  test('je v liště vedle ostatních', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await expect(page.locator('.nb-toolbar .nb-btn[data-control=alignjustify]')).toBeVisible();
  });

  test('zapíše text-align: justify', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await caret(page, 0, 1);
    await page.locator('.nb-btn[data-control=alignjustify]').click();
    await expect.poll(() => html(page)).toBe('<p style="text-align: justify;">text</p>');
  });

  test('tlačítko drží stav podle bloku pod kurzorem', async ({ page }) => {
    await mount(page, '<p style="text-align: justify;">a</p><p>b</p>');

    await caret(page, 0, 1);
    await expect.poll(() =>
      page.locator('.nb-btn[data-control=alignjustify]').getAttribute('aria-pressed'),
    ).toBe('true');

    await caret(page, 1, 1);
    await expect.poll(() =>
      page.locator('.nb-btn[data-control=alignjustify]').getAttribute('aria-pressed'),
    ).toBe('false');
  });

  test('přepnutí zpět vlevo styl odstraní', async ({ page }) => {
    await mount(page, '<p style="text-align: justify;">text</p>');
    await caret(page, 0, 1);
    await page.locator('.nb-btn[data-control=alignleft]').click();
    await expect.poll(() => html(page)).toBe('<p>text</p>');
  });

  test('funguje i na víc bloků naráz', async ({ page }) => {
    await mount(page, '<p>a</p><p>b</p>');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      const range = document.createRange();
      range.setStart(ed.root.children[0], 0);
      range.setEnd(ed.root.children[1], 1);
      ed.selection.setRange(range);
      ed.root.focus();
    });
    await page.locator('.nb-btn[data-control=alignjustify]').click();

    await expect.poll(() => html(page)).toBe(
      '<p style="text-align: justify;">a</p><p style="text-align: justify;">b</p>');
  });
});

/**
 * Citace je obal, ne druh bloku. Ve všech čtrnácti citacích z produkce je to
 * `<blockquote><p>…</p></blockquote>` — uvnitř pořád jsou odstavce, jen jsou
 * citované.
 */
test.describe('citace', () => {
  test('obalí odstavec, nezamění mu značku', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await caret(page, 0, 2);
    await page.locator('.nb-btn[data-control=blockquote]').click();
    await expect.poll(() => html(page)).toBe('<blockquote><p>text</p></blockquote>');
  });

  test('opakovaný stisk citaci zruší', async ({ page }) => {
    await mount(page, '<blockquote><p>text</p></blockquote>');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      const p = ed.root.querySelector('p')!;
      ed.selection.collapseTo(p.firstChild!, 2);
      ed.root.focus();
    });
    await page.locator('.nb-btn[data-control=blockquote]').click();
    await expect.poll(() => html(page)).toBe('<p>text</p>');
  });

  test('tlačítko drží stav podle kurzoru', async ({ page }) => {
    await mount(page, '<blockquote><p>a</p></blockquote><p>b</p>');
    const button = page.locator('.nb-btn[data-control=blockquote]');

    await page.evaluate(() => {
      const ed = (window as any).ed;
      ed.selection.collapseTo(ed.root.querySelector('blockquote p')!.firstChild!, 1);
      ed.root.focus();
    });
    await expect.poll(() => button.getAttribute('aria-pressed')).toBe('true');

    await caret(page, 1, 1);
    await expect.poll(() => button.getAttribute('aria-pressed')).toBe('false');
  });

  test('víc odstavců naráz skončí v jedné citaci', async ({ page }) => {
    await mount(page, '<p>a</p><p>b</p>');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      const range = document.createRange();
      range.setStart(ed.root.children[0], 0);
      range.setEnd(ed.root.children[1], 1);
      ed.selection.setRange(range);
      ed.root.focus();
    });
    await page.locator('.nb-btn[data-control=blockquote]').click();
    await expect.poll(() => html(page)).toBe('<blockquote><p>a</p><p>b</p></blockquote>');
  });

  test('zrušení uprostřed citace ji rozdělí', async ({ page }) => {
    // Vyndat celou citaci by uživateli zrušilo i to, čeho se nedotkl.
    await mount(page, '<blockquote><p>a</p><p>b</p><p>c</p></blockquote>');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      const middle = ed.root.querySelectorAll('blockquote p')[1]!;
      ed.selection.collapseTo(middle.firstChild!, 1);
      ed.root.focus();
    });
    await page.locator('.nb-btn[data-control=blockquote]').click();

    await expect.poll(() => html(page)).toBe(
      '<blockquote><p>a</p></blockquote><p>b</p><blockquote><p>c</p></blockquote>');
  });

  test('nadpis v citaci zůstane nadpisem', async ({ page }) => {
    await mount(page, '<h2>nadpis</h2>');
    await caret(page, 0, 2);
    await page.locator('.nb-btn[data-control=blockquote]').click();
    await expect.poll(() => html(page)).toBe('<blockquote><h2>nadpis</h2></blockquote>');
  });

  test('výběr bloku v liště ukazuje odstavec, ne citaci', async ({ page }) => {
    // Citace není druh bloku — uvnitř je pořád odstavec.
    await mount(page, '<blockquote><p>text</p></blockquote>');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      ed.selection.collapseTo(ed.root.querySelector('p')!.firstChild!, 1);
      ed.root.focus();
    });
    await expect.poll(() =>
      page.inputValue('.nb-select[data-control=blocks]')).toBe('p');
  });
});

/**
 * `<blockquote>` má podle specifikace obsahový model „flow content", takže
 * `<blockquote>text</blockquote>` je platné HTML a ve starším obsahu se objevit
 * může. Pro editor je to ale past: `closestBlock` vrátí samotnou citaci.
 * Srovná se proto při první úpravě — stejně líně jako u seznamů a tabulek.
 */
test.describe('citace s holým textem', () => {
  test('při načtení se nesrovnává', async ({ page }) => {
    const original = '<blockquote>holy text</blockquote>';
    await mount(page, original);
    expect(await html(page)).toBe(original);
  });

  test('Enter ji rozdělí na odstavce uvnitř, ne na dvě citace', async ({ page }) => {
    await mount(page, '<blockquote>holy text</blockquote>');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      ed.selection.collapseTo(ed.root.querySelector('blockquote')!.firstChild!, 4);
      ed.root.focus();
    });
    await page.keyboard.press('Enter');

    await expect.poll(() => html(page))
      .toBe('<blockquote><p>holy</p><p> text</p></blockquote>');
  });

  test('zrušení citace funguje i na ní', async ({ page }) => {
    await mount(page, '<blockquote>holy text</blockquote>');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      ed.selection.collapseTo(ed.root.querySelector('blockquote')!.firstChild!, 2);
      ed.root.focus();
    });
    await page.locator('.nb-btn[data-control=blockquote]').click();

    await expect.poll(() => html(page)).toBe('<p>holy text</p>');
  });

  test('tlačítko ji pozná jako citaci', async ({ page }) => {
    await mount(page, '<blockquote>holy text</blockquote>');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      ed.selection.collapseTo(ed.root.querySelector('blockquote')!.firstChild!, 2);
      ed.root.focus();
    });
    await expect.poll(() =>
      page.locator('.nb-btn[data-control=blockquote]').getAttribute('aria-pressed'),
    ).toBe('true');
  });

  test('psaní do ní nic nepřeskládá', async ({ page }) => {
    await mount(page, '<blockquote>text</blockquote>');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      ed.selection.collapseTo(ed.root.querySelector('blockquote')!.firstChild!, 4);
      ed.root.focus();
    });
    await page.keyboard.type('!');
    await expect.poll(() => html(page)).toBe('<blockquote>text!</blockquote>');
  });
});

/**
 * Výška řádku patří bloku, ne inline obalu: `line-height` na `<span>` uvnitř
 * odstavce mění výšku jen těch řádků, na kterých span leží.
 */
test.describe('výška řádku', () => {
  test('nastaví se na blok', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await caret(page, 0, 2);
    await page.evaluate(() => (window as any).ed.exec('lineheight', '1.5'));
    await expect.poll(() => html(page)).toBe('<p style="line-height: 1.5;">text</p>');
  });

  test('„Výchozí" ji zase odstraní', async ({ page }) => {
    await mount(page, '<p style="line-height: 2;">text</p>');
    await caret(page, 0, 2);
    await page.evaluate(() => (window as any).ed.exec('lineheight', ''));
    await expect.poll(() => html(page)).toBe('<p>text</p>');
  });

  test('nabídka v liště ukazuje hodnotu pod kurzorem', async ({ page }) => {
    await mount(page, '<p style="line-height: 1.5;">text</p>');
    await caret(page, 0, 2);
    await expect.poll(() =>
      page.locator('.nb-btn[data-control=lineheight] .nb-btn-value').textContent()).toBe('1.5');
  });

  test('platí na víc bloků naráz', async ({ page }) => {
    await mount(page, '<p>a</p><p>b</p>');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      const range = document.createRange();
      range.setStart(ed.root.children[0], 0);
      range.setEnd(ed.root.children[1], 1);
      ed.selection.setRange(range);
      ed.root.focus();
    });
    await page.evaluate(() => (window as any).ed.exec('lineheight', '2'));

    await expect.poll(() => html(page)).toBe(
      '<p style="line-height: 2;">a</p><p style="line-height: 2;">b</p>');
  });

  test('nepřebije zarovnání', async ({ page }) => {
    await mount(page, '<p style="text-align: center;">text</p>');
    await caret(page, 0, 2);
    await page.evaluate(() => (window as any).ed.exec('lineheight', '1.5'));

    const out = await html(page);
    expect(out).toContain('text-align: center');
    expect(out).toContain('line-height: 1.5');
  });
});

test.describe('ovládací panel se drží u okraje', () => {
  test('při rolování zůstane vidět', async ({ page }) => {
    await mount(page, '<p>zacatek</p>' + '<p>vypln</p>'.repeat(80));

    const head = page.locator('.nb-head');
    const topBefore = (await head.boundingBox())!.y;

    await page.evaluate(() => window.scrollBy(0, 600));
    await page.waitForTimeout(100);

    const topAfter = (await head.boundingBox())!.y;
    // Lišta se drží u horního okraje místo aby odjela s obsahem.
    expect(topAfter).toBeGreaterThanOrEqual(0);
    expect(topAfter).toBeLessThan(topBefore);
    await expect(head).toBeInViewport();
  });

  test('obal editoru není posuvný kontejner', async ({ page }) => {
    await mount(page, '<p>text</p>');
    // `overflow: hidden` na obalu by ze `sticky` udělalo mrtvou vlastnost.
    expect(await page.evaluate(() =>
      getComputedStyle(document.querySelector('.nb')!).overflow)).not.toBe('hidden');
    expect(await page.evaluate(() =>
      getComputedStyle(document.querySelector('.nb-head')!).position)).toBe('sticky');
  });
});
