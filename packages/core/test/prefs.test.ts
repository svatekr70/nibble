import { describe, expect, it } from 'vitest';
import { groupsFromLayout, mergeGroups, Prefs } from '../src/ui/prefs.js';

/** mergeGroups porovnává s hotovými skupinami, ne s rozvržením. */
const fresh = (layout: string[][], bottom: string[][] = []) => groupsFromLayout(layout, bottom);

/**
 * Uloženému nastavení se nesmí věřit slepě: je v prohlížeči uživatele, může
 * být staré půl roku a mezitím mohly přibýt nové funkce.
 */
const LAYOUT = [['undo', 'redo'], ['bold', 'italic'], ['link']];
const vse = () => true;

describe('výchozí skupiny z rozvržení', () => {
  it('zachovají pořadí a všechno zapnou', () => {
    const groups = groupsFromLayout(LAYOUT);
    expect(groups.map((g) => g.id)).toEqual(['g0', 'g1', 'g2']);
    expect(groups[1]!.items).toEqual([{ name: 'bold', on: true }, { name: 'italic', on: true }]);
    expect(groups.every((g) => g.row === 'top')).toBe(true);
  });
});

describe('skupiny do spodního řádku', () => {
  it('dostanou vlastní řadu i vlastní id', () => {
    const groups = groupsFromLayout([['undo']], [['code', 'fullscreen']]);
    expect(groups.map((g) => [g.id, g.row])).toEqual([['g0', 'top'], ['b0', 'bottom']]);
  });

  it('Prefs je rozdělí do řádků', () => {
    const prefs = new Prefs({
      id: 'test', layout: [['undo']], bottomLayout: [['code']], known: vse,
    });
    expect(prefs.layoutFor('top')).toEqual([['undo']]);
    expect(prefs.layoutFor('bottom')).toEqual([['code']]);
  });
});

describe('sloučení uloženého nastavení', () => {
  it('drží pořadí, které si uživatel nastavil', () => {
    const stored = [{ id: 'g1', row: 'top' as const,
      items: [{ name: 'italic', on: true }, { name: 'bold', on: false }] }];
    const merged = mergeGroups(stored, fresh([['bold', 'italic']]), vse);

    expect(merged[0]!.items.map((i) => i.name)).toEqual(['italic', 'bold']);
    expect(merged[0]!.items[1]!.on).toBe(false);
  });

  it('drží i přesun do spodního řádku', () => {
    const stored = [{ id: 'g0', row: 'bottom' as const, items: [{ name: 'undo', on: true }] }];
    expect(mergeGroups(stored, fresh([['undo']]), vse)[0]!.row).toBe('bottom');
  });

  it('nový prvek se doplní, aby po aktualizaci nezmizel', () => {
    // Bez toho by upgrade editoru znamenal, že nové funkce nikdo neuvidí.
    const stored = [{ id: 'g0', row: 'top' as const, items: [{ name: 'undo', on: true }] }];
    const merged = mergeGroups(stored, fresh([['undo', 'redo']]), vse);
    expect(merged[0]!.items.map((i) => i.name)).toEqual(['undo', 'redo']);
  });

  it('celá nová skupina se připojí na konec', () => {
    const stored = [{ id: 'g0', row: 'top' as const, items: [{ name: 'undo', on: true }] }];
    const merged = mergeGroups(stored, fresh([['undo'], ['bold']]), vse);
    expect(merged).toHaveLength(2);
    expect(merged[1]!.items[0]!.name).toBe('bold');
  });

  it('prvek, který zmizel z konfigurace, se zahodí', () => {
    const stored = [{ id: 'g0', row: 'top' as const,
      items: [{ name: 'undo', on: true }, { name: 'zruseno', on: true }] }];
    const merged = mergeGroups(stored, fresh([['undo']]), (name) => name !== 'zruseno');
    expect(merged[0]!.items.map((i) => i.name)).toEqual(['undo']);
  });

  it('prvek nezaregistrovaný pluginem se zahodí taky', () => {
    const stored = [{ id: 'g0', row: 'top' as const,
      items: [{ name: 'undo', on: true }, { name: 'table', on: true }] }];
    // Plugin tabulek se nenačetl — nabízet jeho tlačítko nemá smysl.
    const merged = mergeGroups(stored, fresh([['undo']]), (name) => name !== 'table');
    expect(merged[0]!.items.map((i) => i.name)).toEqual(['undo']);
  });

  it('duplicitu z poškozeného nastavení odstraní', () => {
    const stored = [
      { id: 'g0', row: 'top' as const, items: [{ name: 'undo', on: true }] },
      { id: 'g1', row: 'top' as const, items: [{ name: 'undo', on: true }] },
    ];
    const merged = mergeGroups(stored, fresh([['undo']]), vse);
    expect(merged.flatMap((g) => g.items).map((i) => i.name)).toEqual(['undo']);
  });

  it('prázdná skupina se do výsledku nedostane', () => {
    const stored = [
      { id: 'g0', row: 'top' as const, items: [] },
      { id: 'g1', row: 'top' as const, items: [{ name: 'bold', on: true }] },
    ];
    expect(mergeGroups(stored, fresh([[], ['bold']]), vse)).toHaveLength(1);
  });

  it('prázdné uložené nastavení dá výchozí rozvržení', () => {
    const merged = mergeGroups([], fresh(LAYOUT), vse);
    expect(merged.map((g) => g.items.map((i) => i.name))).toEqual(LAYOUT);
  });
});
