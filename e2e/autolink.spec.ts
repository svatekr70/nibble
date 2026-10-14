import { expect, test, type Page } from '@playwright/test';
import { caret, html, mount, select } from './helpers.js';

/** Vloží text, jako by přišel ze schránky — skutečná schránka je v CI nespolehlivá. */
async function pasteText(page: Page, text: string): Promise<void> {
  await page.evaluate((t) => {
    const data = new DataTransfer();
    data.setData('text/plain', t);
    const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
    (window as any).ed.root.dispatchEvent(event);
  }, text);
}

test.describe('odkazy při vkládání', () => {
  test('samotná adresa se vloží jako odkaz', async ({ page }) => {
    await mount(page, '<p>Viz </p>');
    await caret(page, 0, 4);
    await pasteText(page, 'https://example.com');
    expect(await html(page)).toBe('<p>Viz <a href="https://example.com">https://example.com</a></p>');
  });

  test('adresa vložená na výběr z něj udělá odkaz', async ({ page }) => {
    await mount(page, '<p>Náš web je tady.</p>');
    await select(page, 0, 11, 15);
    await pasteText(page, 'https://example.com');
    expect(await html(page)).toBe('<p>Náš web je <a href="https://example.com">tady</a>.</p>');
  });

  test('e-mail dostane mailto:', async ({ page }) => {
    await mount(page, '<p>x</p>');
    await caret(page, 0, 1);
    await pasteText(page, 'jan@firma.cz');
    expect(await html(page)).toContain('<a href="mailto:jan@firma.cz">jan@firma.cz</a>');
  });

  test('jeden Ctrl+Z vrátí stav před vložením', async ({ page }) => {
    await mount(page, '<p>Náš web je tady.</p>');
    await select(page, 0, 11, 15);
    await pasteText(page, 'https://example.com');
    await page.keyboard.press('ControlOrMeta+z');
    expect(await html(page)).toBe('<p>Náš web je tady.</p>');
  });

  test('uvnitř odkazu nevznikne odkaz v odkazu', async ({ page }) => {
    await mount(page, '<p><a href="https://a.cz">odkaz</a></p>');
    await caret(page, 0, 5);
    await pasteText(page, 'https://b.cz');
    expect(await html(page)).not.toContain('<a href="https://b.cz"');
  });

  test('výběr obalující odkaz nevytvoří odkaz v odkazu', async ({ page }) => {
    await mount(page, '<p>see <a href="https://a.cz">link</a> here</p>');
    await page.evaluate(() => {
      const p = (window as any).ed.root.querySelector('p') as HTMLElement;
      const r = document.createRange();
      r.setStart(p.firstChild!, 0);
      r.setEnd(p.lastChild!, 5);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(r);
    });
    await pasteText(page, 'https://b.cz');
    // Vložení si vzalo jádro: výběr nahradí čistým textem, žádné `<a>` nevznikne.
    expect(await html(page)).toBe('<p>https://b.cz</p>');
  });

  test('věta s adresou zůstane textem', async ({ page }) => {
    await mount(page, '<p>x</p>');
    await caret(page, 0, 1);
    await pasteText(page, 'viz https://example.com');
    expect(await html(page)).not.toContain('<a ');
  });

  test('Ctrl+Shift+V vloží adresu jako text', async ({ page }) => {
    await mount(page, '<p>x</p>');
    await caret(page, 0, 1);
    await page.evaluate(() => { (window as any).ed.pastePlainNext = true; });
    await pasteText(page, 'https://example.com');
    expect(await html(page)).not.toContain('<a ');
  });
});
