import { describe, expect, it } from 'vitest';
import { ICONS, iconSvg } from '../../ui/src/icons.js';

/**
 * Ikony se generují z Lucide skriptem `tools/build-icons.mjs`, takže se tady
 * nekontroluje jejich tvar — ten je věc autorů sady. Kontroluje se, co by
 * generátor mohl pokazit: že se ikony nepromíchaly, že dědí barvu textu
 * a že z nich vyjde použitelné SVG.
 */

/** Kolik samostatných tahů je v uloženém nitru značky. */
const strokes = (body: string): number => (body.match(/[Mm]/g) ?? []).length;

describe('ikony', () => {
  it('vodorovná čára je jeden tah', () => {
    // Tři tahy vypadaly jako zarovnání na střed, se kterým ikona v liště
    // sousedí. Jedna čára je jedna čára.
    expect(strokes(ICONS.hr!)).toBe(1);
  });

  it('žádné dvě ikony nevypadají stejně', () => {
    const bodies = Object.values(ICONS);
    expect(new Set(bodies).size).toBe(bodies.length);
  });

  it('ikony zarovnání se navzájem liší', () => {
    const align = Object.entries(ICONS)
      .filter(([name]) => name.startsWith('align'))
      .map(([, body]) => body);
    expect(new Set(align).size).toBe(align.length);
  });

  it('každá ikona dědí barvu textu', () => {
    // Natvrdo zapsaná barva by v tmavém režimu zmizela.
    for (const [name, body] of Object.entries(ICONS)) {
      expect(body, name).toContain('stroke="currentColor"');
      expect(body, name).not.toMatch(/(stroke|fill)="#/);
    }
  });

  it('z každé ikony vyjde uzavřené SVG s jejím obsahem', () => {
    for (const name of Object.keys(ICONS)) {
      const svg = iconSvg(name);
      expect(svg, name).toContain(ICONS[name]!);
      expect(svg, name).toMatch(/^<svg [^>]*viewBox="0 0 24 24"/);
      expect(svg, name).toMatch(/<\/svg>$/);
    }
  });

  it('ikona je pro čtečku neviditelná — význam nese popisek tlačítka', () => {
    expect(iconSvg('bold')).toContain('aria-hidden="true"');
    expect(iconSvg('bold')).toContain('focusable="false"');
  });

  it('neznámá ikona nespadne, jen vyjde prázdná', () => {
    expect(iconSvg('neexistuje')).toBe(
      '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"></svg>');
  });

  it('pokrývá všechna tlačítka, která Nibble kreslí', () => {
    // Kdyby přibylo tlačítko a zapomnělo se na řádek v `tools/build-icons.mjs`,
    // vyšlo by z `iconSvg` prázdné `<svg>` a v liště by zela díra.
    const expected = [
      'undo', 'redo', 'bold', 'italic', 'underline', 'strike',
      'alignleft', 'aligncenter', 'alignright', 'alignjustify',
      'bullist', 'numlist', 'deflist', 'listprops', 'indent', 'outdent',
      'link', 'unlink', 'openlink', 'anchor', 'image', 'media', 'table', 'tableprops',
      'rowprops', 'rowplus', 'rowminus', 'colplus', 'colminus', 'merge', 'split',
      'hr', 'removeformat', 'blockquote', 'header', 'code', 'inlinecode',
      'emoji', 'charmap', 'search', 'fullscreen', 'forecolor', 'backcolor',
      'superscript', 'subscript', 'cut', 'copy', 'paste', 'pastetext',
      'selectall', 'lineheight', 'trash', 'settings', 'more',
    ];
    for (const name of expected) expect(ICONS[name], name).toBeTruthy();
  });
});
