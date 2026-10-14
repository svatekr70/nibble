import { describe, expect, it } from 'vitest';
import { filterSuggestions, suggestionQuery } from '../src/ui/suggest.js';

describe('dotaz nabídky', () => {
  it.each([
    ['/', ''],
    ['/nad', 'nad'],
    ['/nadpis2', 'nadpis2'],
    // Víceslovné popisky se dají dopsat celé; zavírá až mezera bez shody.
    ['/nad pis', 'nad pis'],
    ['/nadpis 2', 'nadpis 2'],
  ])('na začátku bloku %j → %j', (text, q) => {
    expect(suggestionQuery(text, '/', true)).toBe(q);
  });

  it.each(['', 'a/', 'text /nad', '//', '/ ', '/ nad', '/nad/'])('na začátku bloku %j nic', (text) => {
    expect(suggestionQuery(text, '/', true)).toBeNull();
  });

  it('mimo začátek bloku stačí mezera před spouštěčem', () => {
    expect(suggestionQuery('text /nad', '/', false)).toBe('nad');
    expect(suggestionQuery('a/b', '/', false)).toBeNull();
  });
});

describe('filtr nabídky', () => {
  const items = [
    { id: 'h1', label: 'Nadpis 1', keywords: ['h1'] },
    { id: 'h2', label: 'Nadpis 2', keywords: ['h2'] },
    { id: 'ul', label: 'Odrážky', keywords: ['seznam'] },
    { id: 'quote', label: 'Citace' },
  ];

  it('prázdný dotaz vrátí vše', () => expect(filterSuggestions(items, '')).toHaveLength(4));
  it('bez diakritiky a velikosti', () => expect(filterSuggestions(items, 'ODRAZ').map((i) => i.id)).toEqual(['ul']));
  it('podle klíčových slov', () => expect(filterSuggestions(items, 'seznam').map((i) => i.id)).toEqual(['ul']));
  it('víceslovný dotaz i s mezerou', () => {
    expect(filterSuggestions(items, 'nadpis 2').map((i) => i.id)).toEqual(['h2']);
    const lists = [{ id: 'ul', label: 'Odrážky' }, { id: 'ol', label: 'Číslovaný seznam' }];
    expect(filterSuggestions(lists, 'cislovany sez').map((i) => i.id)).toEqual(['ol']);
  });
  it('nedělitelná mezera z prohlížeče platí jako mezera', () => {
    // Contenteditable píše mezeru na konci textu jako U+00A0.
    expect(filterSuggestions(items, 'nadpis\u00a02').map((i) => i.id)).toEqual(['h2']);
  });
  it('začátek popisku má přednost', () => {
    const list = [{ id: 'a', label: 'Vložit citaci' }, { id: 'b', label: 'Citace' }];
    expect(filterSuggestions(list, 'cit').map((i) => i.id)).toEqual(['b', 'a']);
  });
});
