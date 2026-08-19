import { describe, expect, it } from 'vitest';
import { parseWindow } from './dom.js';
import { toHex } from '../../ui/src/ColorPicker.js';

/**
 * Barva se zapisuje jako `<span style="color: …">` — přesně tak, jak je to
 * v cílovém projektu dnes (`color` 432×, `background-color` 457×). Nový obsah tak
 * vypadá stejně jako ten, který tam už roky je.
 *
 * Samotné obarvení stojí na `Range`, takže se testuje v `e2e/colors.spec.ts`.
 */
describe('převod barvy na #rrggbb', () => {
  it.each([
    ['#abc', '#aabbcc'],
    ['#AABBCC', '#aabbcc'],
    ['rgb(255, 0, 0)', '#ff0000'],
    ['rgb(0,128,255)', '#0080ff'],
    ['rgba(255, 255, 255, 0.5)', '#ffffff'],
    ['  #1F5F5B  ', '#1f5f5b'],
  ])('%s → %s', (input, expected) => {
    expect(toHex(input)).toBe(expected);
  });

  it.each([
    [null], [undefined], [''], ['nesmysl'], ['rgb(a, b, c)'],
  ])('%s nedá nic', (input) => {
    expect(toHex(input as string | null)).toBeNull();
  });

  it('hodnoty mimo rozsah se ořežou', () => {
    expect(toHex('rgb(300, -20, 128)')).toBe('#ff0080');
  });
});

describe('vlastní barvy v obsahu', () => {
  it('projdou sanitizací i schématem', async () => {
    const { document } = parseWindow();
    const { sanitize } = await import('../src/model/Sanitizer.js');
    const box = document.createElement('div');
    box.innerHTML = '<p><span style="color: rgb(255, 0, 0);">červeně</span></p>';

    const result = sanitize(box);
    expect(result.removed).toHaveLength(0);
    expect(box.innerHTML).toContain('color: rgb(255, 0, 0)');
  });
});
