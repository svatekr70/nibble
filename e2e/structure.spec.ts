import { expect, test } from '@playwright/test';
import { html, mount } from './helpers.js';

/**
 * Struktura pod rukama.
 *
 * Dvě rodiny chyb, obě z druhého průchodu editorem:
 *
 * Buňka, položka a `<dt>`/`<dd>` drží strukturu. Přejmenovat je ani obalit
 * nejde — `<td>` přepsané na `<h3>` z tabulky zmizí a `<ul>` obalený kolem
 * `<td>` ji rozbije. Co uživatel zamýšlí, patří jejich obsahu.
 *
 * A slévat se přes hranici obalu nesmí: Backspace na začátku odstavce za
 * tabulkou vysypal text přímo do `<table>`, mimo buňku.
 */

/** Postaví kurzor doprostřed prvního prvku, který selektor najde. */
async function caretIn(page: import('@playwright/test').Page, selector: string, offset = 1) {
  await page.evaluate(([sel, off]) => {
    const ed = (window as any).ed;
    const el = ed.root.querySelector(sel as string);
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    ed.selection.collapseTo(walker.nextNode() ?? el, off as number);
    ed.root.focus();
  }, [selector, offset] as const);
}

const exec = (page: import('@playwright/test').Page, cmd: string, arg?: unknown) =>
  page.evaluate(([c, a]) => {
    const ed = (window as any).ed;
    ed.focus();
    return ed.exec(c, a);
  }, [cmd, arg] as const);

test.describe('buňka a položka se nepřejmenují ani neobalí', () => {
  test('seznam v buňce zůstane uvnitř buňky', async ({ page }) => {
    await mount(page, '<table><tbody><tr><td>abc</td><td>x</td></tr></tbody></table>');
    await caretIn(page, 'td');
    await exec(page, 'bullist');

    expect(await html(page)).toBe(
      '<table><tbody><tr><td><ul><li>abc</li></ul></td><td>x</td></tr></tbody></table>');
  });

  test('citace v buňce zůstane uvnitř buňky', async ({ page }) => {
    await mount(page, '<table><tbody><tr><td>abc</td></tr></tbody></table>');
    await caretIn(page, 'td');
    await exec(page, 'blockquote');

    expect(await html(page)).toBe(
      '<table><tbody><tr><td><blockquote><p>abc</p></blockquote></td></tr></tbody></table>');
  });

  test('nadpis v buňce buňku nezruší', async ({ page }) => {
    await mount(page, '<table><tbody><tr><td>abc</td></tr></tbody></table>');
    await caretIn(page, 'td');
    await exec(page, 'formatBlock', 'h3');

    expect(await html(page)).toBe(
      '<table><tbody><tr><td><h3>abc</h3></td></tr></tbody></table>');
  });

  test('nadpis v položce seznamu položku nezruší', async ({ page }) => {
    await mount(page, '<ul><li>abc</li></ul>');
    await caretIn(page, 'li');
    await exec(page, 'formatBlock', 'h3');

    expect(await html(page)).toBe('<ul><li><h3>abc</h3></li></ul>');
  });

  test('seznam ve vysvětlení zůstane uvnitř něj', async ({ page }) => {
    await mount(page, '<dl><dt>a</dt><dd>b</dd></dl>');
    await caretIn(page, 'dd');
    await exec(page, 'bullist');

    expect(await html(page)).toBe('<dl><dt>a</dt><dd><ul><li>b</li></ul></dd></dl>');
  });

  test('nadpis z termínu termín nezruší', async ({ page }) => {
    await mount(page, '<dl><dt>a</dt></dl>');
    await caretIn(page, 'dt');
    await exec(page, 'formatBlock', 'h3');

    expect(await html(page)).toBe('<dl><dt><h3>a</h3></dt></dl>');
  });

  test('seznam definic v buňce zůstane uvnitř buňky', async ({ page }) => {
    await mount(page, '<table><tbody><tr><td>abc</td></tr></tbody></table>');
    await caretIn(page, 'td');
    await exec(page, 'deflist');

    expect(await html(page)).toBe(
      '<table><tbody><tr><td><dl><dt>abc</dt></dl></td></tr></tbody></table>');
  });

  test('mimo strukturu se pořád jen přepíná značka', async ({ page }) => {
    await mount(page, '<p>abc</p>');
    await caretIn(page, 'p');
    await exec(page, 'formatBlock', 'h3');
    expect(await html(page)).toBe('<h3>abc</h3>');
  });
});

test.describe('mazání nepřekročí hranici obalu', () => {
  const atStartOf = (page: import('@playwright/test').Page, selector: string, index = 0) =>
    page.evaluate(([sel, i]) => {
      const ed = (window as any).ed;
      const el = ed.root.querySelectorAll(sel as string)[i as number];
      ed.selection.collapseTo(el.firstChild ?? el, 0);
      ed.root.focus();
    }, [selector, index] as const);

  test('Backspace za tabulkou tabulku nerozbije', async ({ page }) => {
    const original = '<table><tbody><tr><td>a</td></tr></tbody></table><p>b</p>';
    await mount(page, original);
    await atStartOf(page, 'p');
    await exec(page, 'deleteBackward');

    expect(await html(page)).toBe(original);
  });

  test('Delete před tabulkou tabulku nerozbije', async ({ page }) => {
    const original = '<p>a</p><table><tbody><tr><td>b</td></tr></tbody></table>';
    await mount(page, original);
    await caretIn(page, 'p', 1);
    await exec(page, 'deleteForward');

    expect(await html(page)).toBe(original);
  });

  test('Backspace za seznamem seznam nerozbije', async ({ page }) => {
    const original = '<ul><li>a</li></ul><p>b</p>';
    await mount(page, original);
    await atStartOf(page, 'p');
    await exec(page, 'deleteBackward');

    expect(await html(page)).toBe(original);
  });

  test('Backspace za citací citaci nerozbije', async ({ page }) => {
    const original = '<blockquote><p>a</p></blockquote><p>b</p>';
    await mount(page, original);
    await atStartOf(page, 'p', 1);
    await exec(page, 'deleteBackward');

    expect(await html(page)).toBe(original);
  });

  test('Backspace za seznamem definic ho nerozbije', async ({ page }) => {
    const original = '<dl><dt>a</dt></dl><p>b</p>';
    await mount(page, original);
    await atStartOf(page, 'p');
    await exec(page, 'deleteBackward');

    expect(await html(page)).toBe(original);
  });

  test('Backspace v první buňce buňku nezruší', async ({ page }) => {
    const original = '<table><tbody><tr><td>a</td></tr></tbody></table>';
    await mount(page, original);
    await atStartOf(page, 'td');
    await exec(page, 'deleteBackward');

    expect(await html(page)).toBe(original);
  });

  test('dva obyčejné odstavce se pořád spojí', async ({ page }) => {
    await mount(page, '<p>abc</p><p>def</p>');
    await atStartOf(page, 'p', 1);
    await exec(page, 'deleteBackward');

    expect(await html(page)).toBe('<p>abcdef</p>');
  });

  test('odstavec se pořád spojí s nadpisem nad ním', async ({ page }) => {
    await mount(page, '<h2>abc</h2><p>def</p>');
    await atStartOf(page, 'p');
    await exec(page, 'deleteBackward');

    expect(await html(page)).toBe('<h2>abcdef</h2>');
  });
});

test.describe('kotva a prázdné bloky', () => {
  test('Enter uprostřed bloku s kotvou nezdvojí id', async ({ page }) => {
    await mount(page, '<p id="kotva">abcdef</p>');
    await caretIn(page, 'p', 3);
    await exec(page, 'insertParagraph');

    // Kotva zůstane u bloku, na kterém byla — dvě stejná id jsou neplatné HTML.
    expect(await html(page)).toBe('<p id="kotva">abc</p><p>def</p>');
  });

  test('ostatní atributy se při dělení nesou dál', async ({ page }) => {
    await mount(page, '<p class="x">abcdef</p>');
    await caretIn(page, 'p', 3);
    await exec(page, 'insertParagraph');

    expect(await html(page)).toBe('<p class="x">abc</p><p class="x">def</p>');
  });

  test('po smazání posledního znaku zbude blok, do kterého jde kliknout', async ({ page }) => {
    await mount(page, '<p>a</p><p>b</p>');
    await caretIn(page, 'p', 1);
    await exec(page, 'deleteBackward');

    // Prázdný `<p></p>` je neviditelný a nedá se do něj kliknout.
    expect(await html(page)).toBe('<p><br></p><p>b</p>');
  });
});
