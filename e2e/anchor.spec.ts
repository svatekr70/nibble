import { expect, test } from '@playwright/test';
import { caret, html, mount } from './helpers.js';

/**
 * Kotva.
 *
 * Zapisuje se `id` na blok, ne `<a name>` — ten HTML5 zrušil. Prázdný obal
 * na místě kurzoru by uměl kotvu doprostřed věty, ale v obsahu není vidět
 * a při mazání okolo se ztratí.
 */

const exec = (page: import('@playwright/test').Page, name: string) =>
  page.evaluate((n) => {
    const ed = (window as any).ed;
    ed.focus();
    return ed.exec('anchor', { name: n });
  }, name);

test.describe('vložení kotvy', () => {
  test('nadpis dostane id', async ({ page }) => {
    await mount(page, '<h2>Prvni kapitola</h2>');
    await caret(page, 0, 3);
    await exec(page, 'kapitola-1');

    expect(await html(page)).toBe('<h2 id="kapitola-1">Prvni kapitola</h2>');
  });

  test('odstavec taky', async ({ page }) => {
    await mount(page, '<p>Text</p>');
    await caret(page, 0, 2);
    await exec(page, 'poznamka');

    expect(await html(page)).toBe('<p id="poznamka">Text</p>');
  });

  test('kotva sedne na blok, ve kterém stojí kurzor', async ({ page }) => {
    await mount(page, '<p>Prvni</p><p>Druhy</p>');
    await caret(page, 1, 2);
    await exec(page, 'kotva');

    expect(await html(page)).toBe('<p>Prvni</p><p id="kotva">Druhy</p>');
  });

  test('diakritika a mezery se převedou', async ({ page }) => {
    await mount(page, '<p>Text</p>');
    await caret(page, 0, 2);
    await exec(page, 'Žluťoučký kůň');

    expect(await html(page)).toBe('<p id="zlutoucky-kun">Text</p>');
  });

  test('obsazený název se očísluje', async ({ page }) => {
    await mount(page, '<p id="kotva">Prvni</p><p>Druhy</p>');
    await caret(page, 1, 2);
    await exec(page, 'kotva');

    expect(await html(page)).toBe('<p id="kotva">Prvni</p><p id="kotva-2">Druhy</p>');
  });

  test('přepsání kotvy na témže bloku se neočísluje', async ({ page }) => {
    await mount(page, '<p id="kotva">Text</p>');
    await caret(page, 0, 2);
    await exec(page, 'kotva');

    expect(await html(page)).toBe('<p id="kotva">Text</p>');
  });

  test('prázdný název kotvu zruší', async ({ page }) => {
    await mount(page, '<p id="kotva">Text</p>');
    await caret(page, 0, 2);
    await exec(page, '');

    expect(await html(page)).toBe('<p>Text</p>');
  });

  test('název jen ze znaků, které ve slugu nejsou, kotvu neudělá', async ({ page }) => {
    await mount(page, '<p>Text</p>');
    await caret(page, 0, 2);
    await exec(page, '@#$%');

    expect(await html(page)).toBe('<p>Text</p>');
  });

  test('kotva na položce seznamu zůstane na položce, ne na seznamu', async ({ page }) => {
    await mount(page, '<ul><li>a</li><li>b</li></ul>');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      ed.selection.collapseTo(ed.root.querySelectorAll('li')[1].firstChild, 0);
      ed.root.focus();
    });
    await exec(page, 'druha');

    expect(await html(page)).toBe('<ul><li>a</li><li id="druha">b</li></ul>');
  });
});

test.describe('kotva v editoru', () => {
  test('blok s kotvou dostane značku, která se neukládá', async ({ page }) => {
    await mount(page, '<p id="kotva">Text</p><p>Bez kotvy</p>');

    const marks = await page.evaluate(() => {
      const ed = (window as any).ed;
      const [a, b] = ed.root.querySelectorAll('p');
      return [
        getComputedStyle(a, '::before').content,
        getComputedStyle(b, '::before').content,
      ];
    });

    expect(marks[0]).toContain('⚓');
    expect(marks[1]).toBe('none');
    // Značka je jen v CSS — v obsahu po ní nesmí zůstat stopa.
    expect(await html(page)).toBe('<p id="kotva">Text</p><p>Bez kotvy</p>');
  });

  test('značka se vejde do odsazení obsahu', async ({ page }) => {
    // V `em` se u nadpisu odsunula dál, než sahá odsazení, a ořízla se.
    await mount(page, '<h2 id="kotva">Nadpis</h2>');

    const fits = await page.evaluate(() => {
      const ed = (window as any).ed;
      const h2 = ed.root.querySelector('h2');
      const left = parseFloat(getComputedStyle(h2, '::before').left);
      return h2.getBoundingClientRect().left + left >= ed.root.getBoundingClientRect().left;
    });

    expect(fits).toBe(true);
  });
});

test.describe('kotva a zbytek editoru', () => {
  test('odkaz na kotvu se uloží beze změny', async ({ page }) => {
    const original = '<p><a href="#kapitola">Na kapitolu</a></p><h2 id="kapitola">Kapitola</h2>';
    await mount(page, original);
    expect(await html(page)).toBe(original);
  });

  test('tlačítko hlásí, že blok kotvu má', async ({ page }) => {
    await mount(page, '<p id="kotva">S kotvou</p><p>Bez</p>');

    const active = (i: number) => page.evaluate((n) => {
      const ed = (window as any).ed;
      ed.selection.collapseTo(ed.root.children[n as number].firstChild, 1);
      return !!ed.ui.get('anchor').active(ed);
    }, i);

    expect(await active(0)).toBe(true);
    expect(await active(1)).toBe(false);
  });

  test('vyčistit formát kotvu nesundá', async ({ page }) => {
    await mount(page, '<p id="kotva"><strong>Text</strong></p>');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      const r = document.createRange();
      r.selectNodeContents(ed.root.querySelector('strong'));
      ed.selection.setRange(r);
      ed.focus();
      ed.exec('removeFormat');
    });

    expect(await html(page)).toBe('<p id="kotva">Text</p>');
  });
});
