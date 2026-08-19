import { expect, test } from '@playwright/test';
import { caret, html, mountFixture, original } from './helpers.js';

/**
 * Nejdůležitější vlastnost celého editoru, ověřená tam, kde na ní záleží —
 * ve skutečném prohlížeči s jeho vlastním parsováním HTML.
 */
test.describe('zachování obsahu', () => {
  const SAMPLES = [
    '001.html',
    '004.html',
    '012.html',
    '033.html',
  ];

  for (const sample of SAMPLES) {
    test('načtení a uložení nic nezmění: ' + sample, async ({ page }) => {
      await mountFixture(page, sample);
      expect(await html(page)).toBe(await original(page));
    });
  }

  test('napsání znaků změní právě ty znaky a nic jiného', async ({ page }) => {
    await mountFixture(page, '001.html');
    const before = await original(page);

    await caret(page, 3, 5);
    await page.keyboard.type('XYZ');

    const after = await html(page);
    expect(after.length).toBe(before.length + 3);

    // Společná předpona a přípona musí pokrýt celý původní dokument.
    let pre = 0;
    while (pre < before.length && before[pre] === after[pre]) pre++;
    let suf = 0;
    while (suf < before.length - pre && before[before.length - 1 - suf] === after[after.length - 1 - suf]) suf++;

    expect(before.length - pre - suf).toBe(0);
    expect(after.length - pre - suf).toBe(3);
  });

  test('undo vrátí bajtově přesný původní stav', async ({ page }) => {
    await mountFixture(page, '012.html');
    const before = await original(page);

    await caret(page, 1, 0);
    await page.keyboard.type('pokus');
    expect(await html(page)).not.toBe(before);

    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => html(page)).toBe(before);
  });

  test('entity zůstávají v nedotčených blocích', async ({ page }) => {
    // Dokument s nejbohatší sadou entit v celé sadě — přes tisíc výskytů.
    await mountFixture(page, '010.html');
    const before = await original(page);
    const entitiesBefore = (before.match(/&[a-zA-Z]+;/g) ?? []).length;
    expect(entitiesBefore).toBeGreaterThan(100);

    await caret(page, 0, 0);
    await page.keyboard.type('A');

    const after = await html(page);
    expect((after.match(/&[a-zA-Z]+;/g) ?? []).length).toBe(entitiesBefore);
  });
});
