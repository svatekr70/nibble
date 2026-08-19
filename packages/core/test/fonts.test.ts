import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GOOGLE_FONTS, familiesInContent, googleStack, sameStack,
} from '../../plugins/src/fonts.js';

/**
 * Výběr písma stojí na `Range`, takže se testuje v `e2e/fonts.spec.ts`.
 * Tady je jen to, co se obejde bez DOM.
 */
describe('porovnání zásobníků písma', () => {
  it.each([
    ['Arial, Helvetica, sans-serif', 'arial, helvetica, sans-serif', true],
    ['"Arial Black", Gadget, sans-serif', "'Arial Black',Gadget,sans-serif", true],
    ['Arial,Helvetica,sans-serif', 'Arial, Helvetica, sans-serif', true],
    ['  sans-serif  ', 'sans-serif', true],
    ['Arial, sans-serif', 'Helvetica, sans-serif', false],
    ['serif', 'sans-serif', false],
  ])('%s ≟ %s → %s', (a, b, expected) => {
    expect(sameStack(a, b)).toBe(expected);
  });
});

describe('zásobník Google písma', () => {
  it('vždy končí obecnou rodinou — kdyby se písmo nestáhlo', () => {
    for (const family of DEFAULT_GOOGLE_FONTS) {
      expect(googleStack(family)).toMatch(/, (sans-serif|serif|monospace)$/);
    }
  });

  it('název s mezerou se uvozuje', () => {
    expect(googleStack('Open Sans')).toBe('"Open Sans", sans-serif');
  });

  it('patkové písmo dostane patkovou záchranu', () => {
    expect(googleStack('Playfair Display')).toBe('"Playfair Display", serif');
    expect(googleStack('Merriweather')).toBe('"Merriweather", serif');
  });

  it('neproporcionální dostane neproporcionální', () => {
    expect(googleStack('JetBrains Mono')).toBe('"JetBrains Mono", monospace');
  });
});

describe('rozpoznání písem v obsahu', () => {
  it('najde rodinu, kterou obsah používá', () => {
    const html = '<p><span style="font-family: Roboto, sans-serif;">text</span></p>';
    expect(familiesInContent(html, DEFAULT_GOOGLE_FONTS)).toEqual(['Roboto']);
  });

  it('nerozlišuje velikost písmen — v datech je „roboto black"', () => {
    const html = '<span style="font-family: roboto black, gadget, sans-serif;">t</span>';
    expect(familiesInContent(html, ['Roboto'])).toEqual(['Roboto']);
  });

  it('najde víc rodin naráz', () => {
    const html = '<p style="font-family: Lato;">a</p><p style="font-family: Inter;">b</p>';
    expect(familiesInContent(html, DEFAULT_GOOGLE_FONTS).sort()).toEqual(['Inter', 'Lato']);
  });

  it('bez písma nic nevrátí — nic se nestahuje zbytečně', () => {
    expect(familiesInContent('<p>obyčejný text</p>', DEFAULT_GOOGLE_FONTS)).toEqual([]);
  });
});
