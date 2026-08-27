import { expect, test, type Page } from '@playwright/test';
import { caret, mount } from './helpers.js';

/**
 * Nastavení editoru očima uživatele.
 *
 * Tyhle věci se v jednotkových testech ověřit nedají: přetahování, sticky
 * chování, rolování při zadané výšce ani úchyt v rohu neexistují nikde jinde
 * než ve skutečném prohlížeči.
 */

const openSettings = async (page: Page): Promise<void> => {
  await page.locator('.nb-btn[data-control=settings]').click();
  await expect(page.locator('.nb-settings')).toBeVisible();
};

const apply = async (page: Page): Promise<void> => {
  await page.locator('.nb-settings .nb-dialog-btn-primary').click();
  await expect(page.locator('.nb-settings')).toHaveCount(0);
};

/** Řádek nastavení pro dané tlačítko. */
const item = (page: Page, name: string) => page.locator('.nb-set-item[data-name="' + name + '"]');

test.describe('nastavení editoru', () => {
  test('vypnuté tlačítko z lišty zmizí', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await expect(page.locator('.nb-btn[data-control=italic]')).toBeVisible();

    await openSettings(page);
    await item(page, 'italic').locator('input[type=checkbox]').uncheck();
    await apply(page);

    await expect(page.locator('.nb-btn[data-control=italic]')).toHaveCount(0);
    // Sousedi ve skupině zůstávají — vypíná se jeden prvek, ne celá skupina.
    await expect(page.locator('.nb-btn[data-control=bold]')).toBeVisible();
  });

  test('skupina přesunutá do druhého řádku sedí hned pod prvním', async ({ page }) => {
    await mount(page, '<p>text</p>');

    await openSettings(page);
    const group = page.locator('.nb-set-group', { has: item(page, 'bold') });
    await group.locator('.nb-set-rowpick').selectOption('bottom');
    await apply(page);

    // Ne dolů k informačnímu řádku — druhý řádek je pořád lišta.
    await expect(page.locator('.nb-toolrow .nb-btn[data-control=bold]')).toHaveCount(0);
    const second = page.locator('.nb-head .nb-toolbar-second .nb-btn[data-control=bold]');
    await expect(second).toBeVisible();

    const box = (await second.boundingBox())!;
    const first = (await page.locator('.nb-toolrow').boundingBox())!;
    const content = (await page.locator('.nb-content').boundingBox())!;

    expect(box.y).toBeGreaterThan(first.y);
    expect(box.y).toBeLessThan(content.y);
    // A žádná čára mezi řádky — je to jedna lišta.
    await expect(page.locator('.nb-toolrow')).toHaveClass(/nb-toolrow-open/);
  });

  test('přetažením se změní pořadí tlačítek', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await openSettings(page);

    const before = await page.locator('.nb-set-item[data-name=bold] ~ .nb-set-item').first()
      .getAttribute('data-name');
    expect(before).toBe('italic');

    // Kurzivu táhneme za úchyt nad tučné písmo.
    const source = item(page, 'italic').locator('.nb-set-grip');
    const target = item(page, 'bold');
    // Bez odrolování by myš mířila mimo viditelnou část dialogu — ten je vysoký
    // a lišta má devět skupin.
    await source.scrollIntoViewIfNeeded();
    const from = (await source.boundingBox())!;
    const to = (await target.boundingBox())!;

    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + 2, { steps: 8 });
    await page.mouse.up();

    const group = page.locator('.nb-set-group', { has: item(page, 'bold') });
    await expect(group.locator('.nb-set-item').first())
      .toHaveAttribute('data-name', 'italic');

    await apply(page);

    const order = await page.locator('.nb-toolbar .nb-btn[data-control=bold], '
      + '.nb-toolbar .nb-btn[data-control=italic]').evaluateAll(
      (nodes) => nodes.map((n) => (n as HTMLElement).dataset.control),
    );
    expect(order).toEqual(['italic', 'bold']);
  });

  test('nabídku jde vypnout a zase zapnout', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await expect(page.locator('.nb-menubar')).toBeVisible();

    await openSettings(page);
    await page.locator('.nb-set-check', { hasText: 'Zobrazit nabídku' })
      .locator('input').uncheck();
    await apply(page);
    await expect(page.locator('.nb-menubar')).toHaveCount(0);

    await openSettings(page);
    await page.locator('.nb-set-check', { hasText: 'Zobrazit nabídku' })
      .locator('input').check();
    await apply(page);
    await expect(page.locator('.nb-menubar')).toBeVisible();
  });

  test('zadaná výška znamená rolování uvnitř editoru', async ({ page }) => {
    await mount(page, '<p>' + Array.from({ length: 60 }, (_, i) => 'řádek ' + i).join('</p><p>') + '</p>');

    await openSettings(page);
    await page.locator('.nb-settings .nb-field', { hasText: 'Výška' })
      .locator('input').fill('200px');
    await apply(page);

    const surface = page.locator('.nb-surface');
    await expect(surface).toHaveClass(/nb-surface-scroll/);

    const box = (await surface.boundingBox())!;
    expect(Math.round(box.height)).toBe(200);

    // Obsah je vyšší než okno — musí být kam rolovat.
    const scrollable = await surface.evaluate((el) => el.scrollHeight > el.clientHeight + 10);
    expect(scrollable).toBe(true);
  });

  test('sticky se dá vypnout', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await expect(page.locator('.nb-head')).toHaveClass(/nb-head-sticky/);

    await openSettings(page);
    await page.locator('.nb-set-check', { hasText: 'drží u okraje' }).locator('input').uncheck();
    await apply(page);

    await expect(page.locator('.nb-head')).not.toHaveClass(/nb-head-sticky/);
  });

  test('nastavení přežije načtení stránky', async ({ page }) => {
    await mount(page, '<p>text</p>');

    await openSettings(page);
    await item(page, 'italic').locator('input[type=checkbox]').uncheck();
    await apply(page);

    await mount(page, '<p>text</p>');
    await expect(page.locator('.nb-btn[data-control=italic]')).toHaveCount(0);
  });

  test('výchozí nastavení vrátí vypnutá tlačítka zpátky', async ({ page }) => {
    await mount(page, '<p>text</p>');

    await openSettings(page);
    await item(page, 'italic').locator('input[type=checkbox]').uncheck();
    await apply(page);
    await expect(page.locator('.nb-btn[data-control=italic]')).toHaveCount(0);

    await openSettings(page);
    await page.locator('.nb-set-reset').click();
    await expect(page.locator('.nb-btn[data-control=italic]')).toBeVisible();
  });

  test('zrušení dialogu nic nezmění', async ({ page }) => {
    await mount(page, '<p>text</p>');

    await openSettings(page);
    await item(page, 'italic').locator('input[type=checkbox]').uncheck();
    await page.locator('.nb-settings .nb-dialog-btn', { hasText: 'Zrušit' }).click();

    await expect(page.locator('.nb-btn[data-control=italic]')).toBeVisible();
  });
});

test.describe('ozubené kolo', () => {
  const gear = (page: Page) => page.locator('.nb-toolrow > .nb-btn[data-control=settings]');

  test('v seznamu tlačítek se vůbec nenabízí', async ({ page }) => {
    // Kdyby si ho uživatel vypnul, k nastavení už by se nedostal zpátky.
    await mount(page, '<p>text</p>');
    await openSettings(page);
    await expect(page.locator('.nb-set-item[data-name=settings]')).toHaveCount(0);
  });

  test('zůstane, i když si uživatel přesune všechny skupiny dolů', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await openSettings(page);

    const picks = page.locator('.nb-set-rowpick');
    for (let i = 0; i < await picks.count(); i++) await picks.nth(i).selectOption('bottom');
    await apply(page);

    await expect(page.locator('.nb-toolrow .nb-toolbar')).toHaveCount(0);
    await expect(gear(page)).toBeVisible();
  });

  test('je úplně vpravo a v prvním řádku lišty', async ({ page }) => {
    await mount(page, '<p>text</p>');

    const box = (await gear(page).boundingBox())!;
    // Jen to, co je v liště opravdu vidět — schované prvky mají nulový rozměr
    // a `right` u nich nic neznamená.
    const buttons = await page.locator('.nb-toolbar .nb-btn, .nb-toolbar .nb-select')
      .evaluateAll((nodes) => nodes
        .filter((n) => (n as HTMLElement).offsetWidth > 0)
        .map((n) => {
          const r = n.getBoundingClientRect();
          return { right: r.right, top: r.top };
        }));

    // Napravo od všeho ostatního…
    expect(Math.min(...buttons.map((b) => box.x - b.right))).toBeGreaterThan(0);
    // …a v jedné ose s prvním řádkem lišty.
    expect(Math.abs(box.y - Math.min(...buttons.map((b) => b.top)))).toBeLessThan(3);
  });

  test('drží se vpravo i v úzkém editoru', async ({ page }) => {
    // Lišta se od jisté chvíle nezalamuje — co se nevejde, jde pod trojtečku.
    // Kolo přesto musí zůstat vpravo nahoře, aby se k nastavení šlo dostat.
    await mount(page, '<p>text</p>');

    await openSettings(page);
    await page.locator('.nb-settings .nb-field', { hasText: 'Šířka' }).locator('input').fill('420px');
    await apply(page);

    const shell = (await page.locator('.nb').boundingBox())!;
    const box = (await gear(page).boundingBox())!;
    const bar = (await page.locator('.nb-toolbar').first().boundingBox())!;

    expect(shell.x + shell.width - (box.x + box.width)).toBeLessThan(20);
    expect(Math.abs(box.y - bar.y)).toBeLessThan(8);

    // A tlačítka, která se nevešla, jsou pod trojtečkou, ne na dalším řádku.
    const hidden = await page.locator('.nb-toolbar').first()
      .locator('.nb-overflow-panel .nb-group').count();
    expect(hidden).toBeGreaterThan(0);
  });

  test('vypnout ho může jen programátor při inicializaci', async ({ page }) => {
    await page.goto('/e2e.html');
    await page.waitForFunction(() => (window as any).ready === true);
    await page.evaluate(() => (window as any).mount('<p>text</p>', { ui: { settings: false } }));

    await expect(page.locator('.nb-btn[data-control=settings]')).toHaveCount(0);
    await expect(page.locator('.nb-toolbar')).toBeVisible();
  });

  test('staré nastavení s kolem ve skupině ho nezdvojí', async ({ page }) => {
    await page.goto('/e2e.html');
    await page.waitForFunction(() => (window as any).ready === true);
    await page.evaluate(() => localStorage.setItem('nibble:prefs:default', JSON.stringify({
      width: '', height: '', menubar: true, sticky: true, statusbar: true, resizable: true,
      groups: [{ id: 'g0', row: 'top', items: [{ name: 'settings', on: true }, { name: 'bold', on: true }] }],
    })));
    await page.evaluate(() => (window as any).mount('<p>text</p>'));

    await expect(page.locator('.nb-btn[data-control=settings]')).toHaveCount(1);
    await expect(gear(page)).toBeVisible();
  });
});

test.describe('stavový řádek', () => {
  test('ukazuje cestu k prvku pod kurzorem', async ({ page }) => {
    await mount(page, '<blockquote><p>uvnitř <strong>tučně</strong></p></blockquote>');
    await page.evaluate(() => {
      const ed = (window as any).ed;
      const strong = ed.root.querySelector('strong')!;
      ed.selection.collapseTo(strong.firstChild, 2);
      ed.root.focus();
    });

    await expect(page.locator('.nb-path-step')).toHaveText(['blockquote', 'p', 'strong']);
  });

  test('kliknutí na krok cesty vybere celý prvek', async ({ page }) => {
    await mount(page, '<p>před <strong>tučný text</strong> po</p>');
    await caret(page, 0, 2);

    await page.locator('.nb-path-step', { hasText: 'p' }).first().click();
    // Klik na `p` vybere celý odstavec.
    expect(await page.evaluate(() => window.getSelection()!.toString())).toBe('před tučný text po');
  });

  test('počet slov z pluginu se ukáže vedle cesty', async ({ page }) => {
    await mount(page, '<p>jedna dvě tři</p>');
    await expect(page.locator('.nb-statusbar [data-status=wordcount]')).toContainText('3');
  });

  test('řádek jde vypnout, počítadlo se pak vrátí zpátky', async ({ page }) => {
    await mount(page, '<p>jedna dvě tři</p>');

    await openSettings(page);
    await page.locator('.nb-set-check', { hasText: 'Informační řádek' }).locator('input').uncheck();
    await apply(page);
    await expect(page.locator('.nb-statusbar')).toHaveCount(0);

    await openSettings(page);
    await page.locator('.nb-set-check', { hasText: 'Informační řádek' }).locator('input').check();
    await apply(page);
    // Stav pluginu se po znovupostavení řádku obnoví — plugin se znovu nespouští.
    await expect(page.locator('.nb-statusbar [data-status=wordcount]')).toContainText('3');
  });

  test('tažení za roh změní velikost editoru', async ({ page }) => {
    await mount(page, '<p>text</p>');

    const shell = page.locator('.nb');
    const before = (await shell.boundingBox())!;

    const grip = page.locator('.nb-grip');
    const box = (await grip.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 120, box.y + box.height / 2 + 60, { steps: 6 });
    await page.mouse.up();

    const after = (await shell.boundingBox())!;
    expect(after.width).toBeLessThan(before.width - 80);
    expect(after.height).toBeGreaterThan(before.height + 40);
  });

  test('zmenšení bez zadané výšky zapne rolování', async ({ page }) => {
    // Nikdo tu nezadal výšku ani šířku — a přesto se text nesmí po zmenšení
    // vylít pod spodní hranu editoru.
    await mount(page, '<p>' + Array.from({ length: 60 }, (_, i) => 'řádek ' + i).join('</p><p>') + '</p>');

    const grip = page.locator('.nb-grip');
    // Dokument je vysoký — bez odrolování by myš mířila mimo obrazovku.
    await grip.scrollIntoViewIfNeeded();
    const box = (await grip.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 400, { steps: 8 });
    await page.mouse.up();

    const surface = page.locator('.nb-surface');
    await expect(surface).toHaveClass(/nb-surface-scroll/);

    const state = await surface.evaluate((el) => ({
      scrollable: el.scrollHeight > el.clientHeight + 10,
      overflow: getComputedStyle(el).overflowY,
      // Plocha s obsahem nesmí přetéct přes editor.
      inside: el.getBoundingClientRect().bottom
        <= el.closest('.nb')!.getBoundingClientRect().bottom + 1,
    }));

    expect(state).toEqual({ scrollable: true, overflow: 'auto', inside: true });
  });

  test('velikost z tažení se uloží na příště', async ({ page }) => {
    await mount(page, '<p>text</p>');

    const grip = page.locator('.nb-grip');
    const box = (await grip.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 150, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();

    const width = (await page.locator('.nb').boundingBox())!.width;

    await mount(page, '<p>text</p>');
    expect((await page.locator('.nb').boundingBox())!.width).toBeCloseTo(width, 0);
  });

  test('kliknutí do rohu bez tažení velikost nemění', async ({ page }) => {
    await mount(page, '<p>text</p>');
    const before = (await page.locator('.nb').boundingBox())!;

    await page.locator('.nb-grip').click();

    const after = (await page.locator('.nb').boundingBox())!;
    expect(after.width).toBeCloseTo(before.width, 0);
    expect(after.height).toBeCloseTo(before.height, 0);
    // A hlavně: do nastavení se nic nezapsalo.
    expect(await page.evaluate(() => localStorage.getItem('nibble:prefs:default'))).toBeNull();
  });

  test('úchyt zmizí, když se změna velikosti vypne', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await expect(page.locator('.nb-grip')).toBeVisible();

    await openSettings(page);
    await page.locator('.nb-set-check', { hasText: 'tažením za roh' }).locator('input').uncheck();
    await apply(page);

    await expect(page.locator('.nb-grip')).toHaveCount(0);
  });
});

test.describe('výpis konfigurace', () => {
  const dump = (page: Page) => page.locator('.nb-dump-code');

  const openDump = async (page: Page): Promise<void> => {
    await page.locator('.nb-set-dump').click();
    await expect(dump(page)).toBeVisible();
  };

  test('vypíše kód podle aktuálního nastavení', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await openSettings(page);
    await openDump(page);

    const code = await dump(page).textContent();
    expect(code).toContain("import { Nibble } from '@nibble/core';");
    expect(code).toContain("['bold', 'italic', 'underline', 'strike'],");
    expect(code).toContain('menubar: true,');
    // Načtené pluginy se vypíšou tak, jak se importují.
    expect(code).toContain("from '@nibble/plugins';");
    expect(code).toContain('link');
  });

  test('bere stav dialogu, ne to, co je uložené', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await openSettings(page);

    // Nic se zatím nepoužilo — a přesto se to musí ve výpisu projevit.
    await item(page, 'italic').locator('input[type=checkbox]').uncheck();
    await page.locator('.nb-settings .nb-field', { hasText: 'Výška' }).locator('input').fill('480px');
    await openDump(page);

    const code = await dump(page).textContent();
    expect(code).toContain("['bold', 'underline', 'strike'],");
    expect(code).toContain("height: '480px',");
  });

  test('skupina ve spodním řádku se vypíše jako layoutBottom', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await openSettings(page);

    const group = page.locator('.nb-set-group', { has: item(page, 'bold') });
    await group.locator('.nb-set-rowpick').selectOption('bottom');
    await openDump(page);

    const code = await dump(page).textContent();
    expect(code).toContain('layoutBottom: [');
    expect(code?.indexOf("['bold'")).toBeGreaterThan(code!.indexOf('layoutBottom'));
  });

  test('zavření výpisu vrátí uživatele do nastavení', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await openSettings(page);
    await openDump(page);

    await page.locator('.nb-dump .nb-dialog-btn', { hasText: 'Zavřít' }).click();

    await expect(page.locator('.nb-dump')).toHaveCount(0);
    await expect(page.locator('.nb-settings')).toBeVisible();
    // A rozdělaná práce v nastavení zůstala.
    await expect(item(page, 'bold').locator('input')).toBeChecked();
  });

  test('kopírování dá vědět, že se povedlo', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await mount(page, '<p>text</p>');
    await openSettings(page);
    await openDump(page);

    const copy = page.locator('.nb-dump .nb-dialog-btn-primary');
    await copy.click();
    await expect(copy).toHaveText('Zkopírováno');

    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain('attachToolbar(editor, {');
  });

  test('vypsaná konfigurace opravdu postaví stejnou lištu', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await openSettings(page);
    await item(page, 'italic').locator('input[type=checkbox]').uncheck();
    const group = page.locator('.nb-set-group', { has: item(page, 'code') });
    await group.locator('.nb-set-rowpick').selectOption('bottom');
    await openDump(page);

    const code = (await dump(page).textContent())!;

    // Z výpisu se vytáhne rozvržení a nasadí na čistý editor. Kdyby se
    // vygenerovaný tvar rozešel s tím, co attachToolbar přijímá, tady to praskne.
    await page.evaluate((source) => {
      const layout = (name: string): string[][] => {
        const start = source.indexOf('  ' + name + ': [');
        if (start < 0) return [];
        const end = source.indexOf('\n  ],', start);
        return source.slice(start, end).split('\n').slice(1)
          .map((line) => line.trim().replace(/^\[|\],?$/g, ''))
          .filter(Boolean)
          .map((line) => line.split(',').map((n) => n.trim().replace(/'/g, '')));
      };
      (window as any).parsed = { layout: layout('layout'), layoutBottom: layout('layoutBottom') };
    }, code);

    // Výpis je modální — dokud je nahoře, do nastavení pod ním se kliknout nedá.
    await page.locator('.nb-dump .nb-dialog-btn', { hasText: 'Zavřít' }).click();
    await page.locator('.nb-settings .nb-dialog-btn', { hasText: 'Zrušit' }).click();

    const built = await page.evaluate(async () => {
      const { attachToolbar } = await import('/dist/ui/src/index.js');
      const { Nibble } = await import('/dist/core/src/index.js');
      const { link, table, code } = await import('/dist/plugins/src/index.js');

      const host = document.createElement('div');
      document.body.appendChild(host);
      const ed = await Nibble.create({ target: host, content: '<p>x</p>', plugins: [link, table, code] });
      const { layout, layoutBottom } = (window as any).parsed;
      attachToolbar(ed, { layout, layoutBottom, prefsKey: 'kopie' });

      const nb = host.closest('.nb')!;
      return {
        top: [...nb.querySelectorAll('.nb-toolrow .nb-btn')].map((b) => (b as HTMLElement).dataset.control),
        bottom: [...nb.querySelectorAll('.nb-toolbar-second .nb-btn')].map((b) => (b as HTMLElement).dataset.control),
      };
    });

    expect(built.top).toContain('bold');
    expect(built.top).not.toContain('italic');
    expect(built.top).toContain('settings');
    expect(built.bottom).toContain('code');
  });
});

test.describe('výpis začíná na začátku', () => {
  test('kód se ukazuje od prvního řádku', async ({ page }) => {
    await mount(page, '<p>text</p>');
    await page.locator('.nb-btn[data-control=settings]').click();
    await page.locator('.nb-set-dump').click();

    const pre = page.locator('.nb-dump-code');
    await expect(pre).toBeVisible();
    // Zaostření tlačítka nesmí odrolit výpis na konec.
    expect(await pre.evaluate((el) => el.scrollTop)).toBe(0);
    expect(await pre.evaluate((el) => el.scrollLeft)).toBe(0);
  });
});
