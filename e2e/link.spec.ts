import { expect, test } from '@playwright/test';
import { caret, html, mount, select } from './helpers.js';

/**
 * Vyplní a odešle otevřený dialog.
 *
 * Po zavření se čeká na odpojení z DOMu. Příkaz se totiž spouští až v pokračování
 * za `await ui.dialog(...)`, takže hned po kliknutí obsah ještě změněný není —
 * výsledek se proto níž ověřuje přes `expect.poll`.
 */
async function fillDialog(
  page: import('@playwright/test').Page,
  values: Record<string, string>,
): Promise<void> {
  await page.locator('.nb-dialog[open]').waitFor();
  for (const [name, value] of Object.entries(values)) {
    const field = page.locator(`.nb-dialog [name="${name}"]`);
    if (await field.evaluate((el) => el.tagName) === 'SELECT') await field.selectOption(value);
    else await field.fill(value);
  }
  await page.locator('.nb-dialog-btn-primary').click();
  await page.locator('.nb-dialog').waitFor({ state: 'detached' });
}

/**
 * Odkaz nad výběrem.
 *
 * `closestLink(range.startContainer)` na tohle nestačí: při výběru taženém myší
 * leží začátek rozsahu běžně mimo vybraný text — u výběru textu odkazu na konci
 * uzlu před ním. „Odebrat odkaz" pak tiše nedělalo nic.
 */
/**
 * Plovoucí lišta u odkazu.
 *
 * Drží se nad prvkem. Když se nad něj nevejde — u odkazu v prvním řádku —
 * musí jít pod něj, ne se zarazit o horní okraj: tam by přistála přes odkaz,
 * který se právě upravuje, a nebylo by na něj vidět.
 */
test.describe('plovoucí lišta nezakrývá odkaz', () => {
  const boxes = (page: import('@playwright/test').Page, index: number) =>
    page.evaluate((i) => {
      const ed = (window as any).ed;
      const ctx = document.querySelector('.nb-context') as HTMLElement;
      const a = ed.root.querySelectorAll('a')[i as number] as HTMLElement;
      const c = ctx.getBoundingClientRect();
      const b = a.getBoundingClientRect();
      return {
        hidden: ctx.hidden,
        overlaps: c.bottom > b.top && c.top < b.bottom && c.right > b.left && c.left < b.right,
        above: c.bottom <= b.top,
      };
    }, index);

  async function caretInLink(page: import('@playwright/test').Page, index: number) {
    await page.evaluate((i) => {
      const ed = (window as any).ed;
      const a = ed.root.querySelectorAll('a')[i as number];
      ed.selection.collapseTo(a.firstChild, 1);
      ed.root.focus();
    }, index);
  }

  test('odkaz v prvním řádku zůstane vidět', async ({ page }) => {
    await mount(page, '<p>Odkaz v <a href="https://x.cz">prvnim radku</a>.</p><p>Dalsi text.</p>');
    await caretInLink(page, 0);

    const b = await boxes(page, 0);
    expect(b.hidden).toBe(false);
    expect(b.overlaps).toBe(false);
  });

  test('níž v dokumentu se lišta drží nad odkazem', async ({ page }) => {
    await mount(page,
      '<p>Prvni odstavec.</p><p>Druhy s <a href="https://x.cz">odkazem</a> uprostred.</p>');
    await caretInLink(page, 0);

    const b = await boxes(page, 0);
    expect(b.overlaps).toBe(false);
    expect(b.above).toBe(true);
  });
});

test.describe('odkaz nad výběrem', () => {
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

  const run = (page: import('@playwright/test').Page, cmd: string, arg?: unknown) =>
    page.evaluate(([c, a]) => {
      const ed = (window as any).ed;
      ed.focus();
      return ed.exec(c, a);
    }, [cmd, arg] as const);

  test('odebrání odkazu funguje i na výběru, nejen z kurzoru', async ({ page }) => {
    await mount(page, '<p>a<a href="https://x.cz">bcd</a>e</p>');
    await sel(page, 1, 4);
    expect(await run(page, 'unlink')).toBe(true);
    expect(await html(page)).toBe('<p>abcde</p>');
  });

  test('odebrání odkazu z výběru celého odstavce', async ({ page }) => {
    await mount(page, '<p>a<a href="https://x.cz">bcd</a>e</p>');
    await sel(page, 0, 5);
    await run(page, 'unlink');
    expect(await html(page)).toBe('<p>abcde</p>');
  });

  test('výběr přes dva odkazy zruší oba', async ({ page }) => {
    await mount(page, '<p><a href="https://a.cz">prvni</a> a <a href="https://b.cz">druhy</a></p>');
    await sel(page, 0, 13);
    await run(page, 'unlink');
    expect(await html(page)).toBe('<p>prvni a druhy</p>');
  });

  test('kurzor uvnitř odkazu ho pořád zruší', async ({ page }) => {
    await mount(page, '<p>a<a href="https://x.cz">bcd</a>e</p>');
    await sel(page, 2, 2);
    await run(page, 'unlink');
    expect(await html(page)).toBe('<p>abcde</p>');
  });

  test('mimo odkaz se odebrání nenabízí', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    await sel(page, 0, 3);
    expect(await page.evaluate(() => (window as any).ed.can('unlink'))).toBe(false);
  });

  test('výběr přesahující odkaz udělá odkaz nad celým výběrem', async ({ page }) => {
    await mount(page, '<p>a<a href="https://x.cz">bc</a>de</p>');
    await sel(page, 2, 5);
    await run(page, 'link', { href: 'https://y.cz' });

    // "b" zůstane v původním odkazu, "cde" je nový — nic, co uživatel
    // nevybral, cíl nezměnilo.
    const out = await html(page);
    expect(out).toContain('<a href="https://y.cz">cde</a>');
    expect(out).toContain('<a href="https://x.cz">b</a>');
  });

  test('výběr uvnitř odkazu jen změní cíl', async ({ page }) => {
    await mount(page, '<p><a href="https://x.cz">abc</a></p>');
    await sel(page, 1, 2);
    await run(page, 'link', { href: 'https://y.cz' });
    expect(await html(page)).toBe('<p><a href="https://y.cz">abc</a></p>');
  });

  test('kurzor v odkazu změní cíl celého odkazu', async ({ page }) => {
    await mount(page, '<p><a href="https://x.cz">abc</a></p>');
    await sel(page, 2, 2);
    await run(page, 'link', { href: 'https://y.cz' });
    expect(await html(page)).toBe('<p><a href="https://y.cz">abc</a></p>');
  });
});

test.describe('vložení odkazu', () => {
  test('obalí vybraný text', async ({ page }) => {
    await mount(page, '<p>klikni sem prosim</p>');
    await select(page, 0, 7, 10);
    await page.locator('.nb-toolbar .nb-btn[data-control=link]').click();
    await fillDialog(page, { href: 'https://example.com/a' });
    await expect.poll(() => html(page)).toBe(
      '<p>klikni <a href="https://example.com/a">sem</a> prosim</p>');
  });

  test('bez výběru vloží odkaz s vlastním textem', async ({ page }) => {
    await mount(page, '<p>text </p>');
    await caret(page, 0, 5);
    await page.locator('.nb-toolbar .nb-btn[data-control=link]').click();
    await fillDialog(page, { href: 'https://example.com/b', text: 'odkaz' });
    await expect.poll(() => html(page)).toBe(
      '<p>text <a href="https://example.com/b">odkaz</a></p>');
  });

  test('nová karta dostane rel="noopener"', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    await select(page, 0, 0, 3);
    await page.locator('.nb-toolbar .nb-btn[data-control=link]').click();
    await fillDialog(page, { href: 'https://example.com/c', target: '_blank' });
    await expect.poll(() => html(page)).toBe(
      '<p><a href="https://example.com/c" target="_blank" rel="noopener">abc</a></p>');
  });

  test('adresu nepřepisuje na relativní', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    await select(page, 0, 0, 3);
    await page.locator('.nb-toolbar .nb-btn[data-control=link]').click();
    // TinyMCE by z tohohle udělal '../neco' a odkaz v e-mailu by nikam nevedl.
    await fillDialog(page, { href: 'http://localhost:4321/neco' });
    await expect.poll(() => html(page)).toContain('href="http://localhost:4321/neco"');
  });

  test('zrušený dialog obsah nemění', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    await select(page, 0, 0, 3);
    await page.locator('.nb-toolbar .nb-btn[data-control=link]').click();
    await page.locator('.nb-dialog[open]').waitFor();
    await page.keyboard.press('Escape');
    await expect.poll(() => html(page)).toBe(
      '<p>abc</p>');
  });

  test('javascript: adresu odmítne', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    await select(page, 0, 0, 3);
    const ok = await page.evaluate(() =>
      (window as any).ed.exec('link', { href: 'javascript:alert(1)' }));
    expect(ok).toBe(false);
    expect(await html(page)).toBe('<p>abc</p>');
  });

  test('Ctrl+K otevře dialog', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    await select(page, 0, 0, 3);
    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.locator('.nb-dialog[open]')).toBeVisible();
  });
});

test.describe('úprava a zrušení odkazu', () => {
  test('kurzor v odkazu ukáže plovoucí lištu', async ({ page }) => {
    await mount(page, '<p><a href="https://example.com/a">odkaz</a></p>');
    await caret(page, 0, 2);
    await expect(page.locator('.nb-context')).toBeVisible();
    await expect(page.locator('.nb-context .nb-btn[data-control=unlink]')).toBeVisible();
  });

  test('mimo odkaz je plovoucí lišta schovaná', async ({ page }) => {
    await mount(page, '<p><a href="https://example.com/a">odkaz</a> mimo</p>');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      ed.selection.collapseTo(ed.root.querySelector('p')!.lastChild!, 3);
      ed.root.focus();
    });
    await expect(page.locator('.nb-context')).toBeHidden();
  });

  test('zrušení odkazu nechá text', async ({ page }) => {
    await mount(page, '<p><a href="https://example.com/a">odkaz</a></p>');
    await caret(page, 0, 2);
    await page.locator('.nb-context .nb-btn[data-control=unlink]').click();
    expect(await html(page)).toBe('<p>odkaz</p>');
  });

  test('dialog předvyplní stávající hodnoty', async ({ page }) => {
    await mount(page, '<p><a href="https://example.com/a" title="popis">odkaz</a></p>');
    await caret(page, 0, 2);
    await page.locator('.nb-context .nb-btn[data-control=link]').click();
    await page.locator('.nb-dialog[open]').waitFor();
    await expect(page.locator('.nb-dialog [name=href]')).toHaveValue('https://example.com/a');
    await expect(page.locator('.nb-dialog [name=title]')).toHaveValue('popis');
    await expect(page.locator('.nb-dialog [name=text]')).toHaveValue('odkaz');
  });

  test('úprava přepíše atributy, nevloží druhý odkaz', async ({ page }) => {
    await mount(page, '<p><a href="https://example.com/a">odkaz</a></p>');
    await caret(page, 0, 2);
    await page.locator('.nb-context .nb-btn[data-control=link]').click();
    await fillDialog(page, { href: 'https://example.com/zmena' });
    await expect.poll(() => html(page)).toBe(
      '<p><a href="https://example.com/zmena">odkaz</a></p>');
  });

  test('odkaz uvnitř odkazu nevznikne', async ({ page }) => {
    await mount(page, '<p>pred <a href="https://example.com/a">odkaz</a> po</p>');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      const p = ed.root.querySelector('p')!;
      const range = document.createRange();
      range.setStart(p.firstChild!, 0);
      range.setEnd(p.lastChild!, 3);
      ed.selection.setRange(range);
      ed.root.focus();
    });
    await page.evaluate(() =>
      (window as any).ed.exec('link', { href: 'https://example.com/vse' }));
    const out = await html(page);
    expect((out.match(/<a /g) ?? []).length).toBe(1);
    expect(out).toContain('https://example.com/vse');
  });
});

test.describe('dialog jako takový', () => {
  test('Escape zavře a vrátí null', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    const result = await page.evaluate(async () => {
      const ed = (window as any).ed;
      const promise = ed.ui.dialog({ title: 'Test', fields: [{ type: 'text', name: 'x' }] });
      await new Promise((r) => setTimeout(r, 50));
      document.querySelector('dialog')!.close();
      return await promise;
    });
    expect(result).toBeNull();
  });

  test('povinné pole brání odeslání', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    await caret(page, 0, 1);
    await page.locator('.nb-toolbar .nb-btn[data-control=link]').click();
    await page.locator('.nb-dialog[open]').waitFor();
    await page.locator('.nb-dialog-btn-primary').click();
    await expect(page.locator('.nb-dialog[open]')).toBeVisible();
  });

  test('fokus začíná v prvním poli', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    await caret(page, 0, 1);
    await page.locator('.nb-toolbar .nb-btn[data-control=link]').click();
    await page.locator('.nb-dialog[open]').waitFor();
    await expect.poll(() =>
      page.evaluate(() => (document.activeElement as HTMLInputElement)?.name),
    ).toBe('href');
  });
});
