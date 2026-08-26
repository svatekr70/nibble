import { describe, expect, it } from 'vitest';
import { filterGlyphs, glyphsInCategory } from '../src/ui/glyphs.js';
import { CHARMAP, CHARMAP_CATEGORIES } from '../../plugins/src/charmap.js';
import { glyphFor, parseGlyphTable } from '../../plugins/src/glyphTable.js';
import { serializeNode } from '../src/model/Serializer.js';
import { parseInto } from '../src/model/Parser.js';
import { parseWindow } from './dom.js';

/**
 * Mapa znaků sdílí hledání i mřížku s emotikony — tady jde o seznam samotný
 * a o to, že se vložený znak uloží tak, jak lidé z projektu čekají.
 */

describe('seznam speciálních znaků', () => {
  it('má položky ve všech kategoriích', () => {
    for (const category of CHARMAP_CATEGORIES) {
      expect(glyphsInCategory(CHARMAP, category.key).length).toBeGreaterThan(3);
    }
  });

  it('žádný znak není v seznamu dvakrát', () => {
    const chars = CHARMAP.map((e) => e.char);
    expect(new Set(chars).size).toBe(chars.length);
  });

  it('každá položka má název a jediný kódový bod', () => {
    // Mapa znaků není emotikony: složený znak by v ní byl podezřelý a kód
    // pod mřížkou by se u něj nedal ukázat.
    const odd = CHARMAP.filter((e) => !e.name || Array.from(e.char).length !== 1);
    expect(odd.map((e) => e.name)).toEqual([]);
  });

  it('neviditelné znaky mají náhradu do mřížky', () => {
    // Prázdné políčko vypadá jako chyba vykreslení.
    const spaces = glyphsInCategory(CHARMAP, 'mezery');
    const invisible = spaces.filter((e) => !/\S/.test(e.char) || e.char === '\u00AD');
    expect(invisible.length).toBeGreaterThan(0);
    expect(invisible.every((e) => Boolean(e.display))).toBe(true);
  });

  it('nic viditelného náhradu nemá', () => {
    const wrong = CHARMAP.filter((e) => e.display && /\S/.test(e.char) && e.char !== '­');
    expect(wrong.map((e) => e.name)).toEqual([]);
  });
});

describe('hledání ve znacích', () => {
  it('najde podle názvu', () => {
    expect(filterGlyphs(CHARMAP, 'copyright')[0]?.char).toBe('©');
  });

  it('najde podle kódu, jak se píše v dokumentaci', () => {
    // Jediná cesta ke znaku, jehož český název člověk nezná.
    expect(filterGlyphs(CHARMAP, 'U+00A9')[0]?.char).toBe('©');
    expect(filterGlyphs(CHARMAP, '00a9')[0]?.char).toBe('©');
  });

  it('najde pevnou mezeru, i když ji není vidět', () => {
    expect(filterGlyphs(CHARMAP, 'pevna mezera')[0]?.char).toBe('\u00A0');
    expect(filterGlyphs(CHARMAP, 'nbsp')[0]?.char).toBe('\u00A0');
  });

  it('najde uvozovky bez diakritiky', () => {
    expect(filterGlyphs(CHARMAP, 'ceska uvozovka').length).toBeGreaterThan(1);
  });
});

describe('tabulka znaků', () => {
  it('zápisem U+ jde uvést i znak, který není vidět', () => {
    const list = parseGlyphTable(
      { x: 'U+00A0 pevná mezera | nbsp | ␣\n@ zavináč | at' },
      [{ key: 'x', label: 'X' }],
    );

    expect(list[0]).toEqual({
      char: '\u00A0', name: 'pevná mezera', category: 'x',
      keywords: ['nbsp'], display: '␣',
    });
    expect(list[1]?.char).toBe('@');
    expect(list[1]?.display).toBeUndefined();
  });

  it('text pod klíčem, který mezi kategoriemi není, se přeskočí', () => {
    expect(parseGlyphTable({ x: '@ zavináč' }, [{ key: 'y', label: 'Y' }])).toEqual([]);
  });
});

describe('co příkaz vloží', () => {
  it('znak ze seznamu projde rovnou', () => {
    expect(glyphFor({ char: '©' }, CHARMAP)).toBe('©');
  });

  it('pevná mezera se cestou neztratí', () => {
    // `trim()` z ní udělá prázdný řetězec, tedy „nevkládej nic“ — proto se
    // seznam prohledává napřed doslova.
    expect(glyphFor({ char: '\u00A0' }, CHARMAP)).toBe('\u00A0');
  });

  it('název se dohledá', () => {
    expect(glyphFor('paragraf', CHARMAP)).toBe('§');
  });

  it('nesmysl nevloží nic', () => {
    expect(glyphFor('qwertzuiop', CHARMAP)).toBe('');
    expect(glyphFor(undefined, CHARMAP)).toBe('');
  });
});

describe('uložení vloženého znaku', () => {
  /** Projde znak serializérem tak, jak by ho uložil editor. */
  const save = (text: string, encoding: 'named' | 'utf8'): string => {
    const { document } = parseWindow();
    const root = document.createElement('div');
    parseInto(root as unknown as HTMLElement, '<p>' + text + '</p>', document);
    return serializeNode(root.firstChild!, { entityEncoding: encoding });
  };

  it('z © je &copy;, když se ukládá pojmenovanými entitami', () => {
    // Tohle projekt v uloženém obsahu má a nový obsah má vypadat stejně.
    expect(save('©', 'named')).toBe('<p>&copy;</p>');
    expect(save('½', 'named')).toBe('<p>&frac12;</p>');
  });

  it('pevná mezera je &nbsp; vždycky', () => {
    expect(save('a\u00A0b', 'named')).toBe('<p>a&nbsp;b</p>');
    expect(save('a\u00A0b', 'utf8')).toBe('<p>a&nbsp;b</p>');
  });

  it('znak bez pojmenované entity se uloží sám sebou', () => {
    expect(save('→', 'named')).toBe('<p>&rarr;</p>');
    expect(save('⌘', 'named')).toBe('<p>⌘</p>');
  });
});
