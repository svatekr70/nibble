import { describe, expect, it } from 'vitest';
import { ALL_GLYPHS, glyphsInCategory, filterGlyphs, foldText } from '../src/ui/glyphs.js';
import { EMOJI, EMOJI_CATEGORIES } from '../../plugins/src/emoji.js';

/**
 * Hledání je čistá funkce, seznam čistá data — testuje se to bez DOM.
 * Mřížka, kategorie a klávesnice jsou v `e2e/emoji.spec.ts`.
 */

describe('skládání diakritiky', () => {
  it('zahodí háčky a čárky', () => {
    expect(foldText('Žirafa')).toBe('zirafa');
    expect(foldText('PŘÍPITEK')).toBe('pripitek');
    expect(foldText('kůň')).toBe('kun');
  });

  it('nechá znaky bez diakritiky být', () => {
    expect(foldText('pizza')).toBe('pizza');
  });
});

describe('hledání emotikonů', () => {
  it('najde podle názvu', () => {
    expect(filterGlyphs(EMOJI, 'pizza').map((e) => e.char)).toContain('🍕');
  });

  it('najde i bez diakritiky', () => {
    // Na české klávesnici je „zirafa“ o dva hmaty míň a lidé to tak píšou.
    const withHooks = filterGlyphs(EMOJI, 'žirafa').map((e) => e.char);
    expect(filterGlyphs(EMOJI, 'zirafa').map((e) => e.char)).toEqual(withHooks);
    expect(withHooks).toContain('🦒');
  });

  it('najde podle klíčového slova, které v názvu není', () => {
    expect(filterGlyphs(EMOJI, 'halloween').map((e) => e.char)).toContain('🎃');
    expect(filterGlyphs(EMOJI, 'facepalm').map((e) => e.char)).toContain('🤦');
  });

  it('slova platí všechna současně', () => {
    const found = filterGlyphs(EMOJI, 'modré srdce');
    expect(found.map((e) => e.char)).toEqual(['💙']);
  });

  it('shoda na začátku názvu jde první', () => {
    // „pes“ je i v „psí hlava | pes“, ale kdo hledá psa, chce vidět psa hned.
    const found = filterGlyphs(EMOJI, 'pes');
    expect(found[0]?.name).toBe('pes');
  });

  it('vložený znak najde sám sebe', () => {
    const found = filterGlyphs(EMOJI, '🍺');
    expect(found).toHaveLength(1);
    expect(found[0]?.name).toBe('pivo');
  });

  it('prázdný dotaz vrací celý seznam v původním pořadí', () => {
    expect(filterGlyphs(EMOJI, '   ')).toBe(EMOJI);
  });

  it('nesmysl nenajde nic — a nespadne', () => {
    expect(filterGlyphs(EMOJI, 'qwertzuiop')).toEqual([]);
  });
});

describe('kategorie', () => {
  it('vrátí jen svoje', () => {
    const food = glyphsInCategory(EMOJI, 'jidlo');
    expect(food.length).toBeGreaterThan(20);
    expect(food.every((e) => e.category === 'jidlo')).toBe(true);
  });

  it('„vše“ vrací všechno', () => {
    expect(glyphsInCategory(EMOJI, ALL_GLYPHS)).toBe(EMOJI);
  });

  it('neznámý klíč vrací prázdno, ne výjimku', () => {
    expect(glyphsInCategory(EMOJI, 'neexistuje')).toEqual([]);
  });
});

describe('seznam emotikonů', () => {
  it('má položky ve všech kategoriích', () => {
    for (const category of EMOJI_CATEGORIES) {
      expect(glyphsInCategory(EMOJI, category.key).length).toBeGreaterThan(20);
    }
  });

  it('každá položka patří do některé kategorie', () => {
    const keys = new Set(EMOJI_CATEGORIES.map((c) => c.key));
    expect(EMOJI.filter((e) => !keys.has(e.category))).toEqual([]);
  });

  it('žádný znak není v seznamu dvakrát', () => {
    // Dvě stejná políčka v mřížce vypadají jako chyba vykreslení.
    const chars = EMOJI.map((e) => e.char);
    expect(new Set(chars).size).toBe(chars.length);
  });

  it('každá položka má název a znak', () => {
    expect(EMOJI.filter((e) => !e.char || !e.name)).toEqual([]);
  });

  it('název není omylem součástí znaku', () => {
    // Rozebírá se to podle první mezery; kdyby v tabulce chyběla, znak by
    // spolkl půl řádku a v mřížce by se vysázel text.
    expect(EMOJI.filter((e) => /\s/.test(e.char))).toEqual([]);
  });

  it('klíčová slova jsou bez diakritiky', () => {
    // Hledání skládá obě strany, takže háček by neuškodil — ale v tabulce
    // je snazší udržet jedno pravidlo než rozhodovat řádek po řádku.
    const odd = EMOJI.filter((e) => (e.keywords ?? []).some((k) => foldText(k) !== k));
    expect(odd.map((e) => e.char + ' ' + (e.keywords ?? []).join(' '))).toEqual([]);
  });
});
