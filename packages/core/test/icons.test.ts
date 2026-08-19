import { describe, expect, it } from 'vitest';
import { ICONS } from '../../ui/src/icons.js';

/** Kolik samostatných tahů cesta obsahuje. */
const strokes = (path: string): number => (path.match(/M/g) ?? []).length;

describe('ikony', () => {
  it('vodorovná čára je jeden tah', () => {
    // Tři tahy vypadaly jako zarovnání na střed, se kterým ikona v liště
    // sousedí. Jedna čára je jedna čára.
    expect(strokes(ICONS.hr!)).toBe(1);
    expect(ICONS.hr).toMatch(/^M[\d.]+ [\d.]+h[\d.]+$/);
  });

  it('žádné dvě ikony nemají stejnou cestu', () => {
    const paths = Object.values(ICONS);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('ikony zarovnání se navzájem liší', () => {
    const align = Object.entries(ICONS)
      .filter(([name]) => name.startsWith('align'))
      .map(([, path]) => path);
    expect(new Set(align).size).toBe(align.length);
  });

  it('každý prvek v liště má ikonu', async () => {
    const { iconSvg } = await import('../../ui/src/icons.js');
    for (const name of Object.keys(ICONS)) {
      expect(iconSvg(name)).toContain('<path d="' + ICONS[name]);
    }
  });

  it('neznámá ikona nespadne, jen vyjde prázdná', async () => {
    const { iconSvg } = await import('../../ui/src/icons.js');
    expect(iconSvg('neexistuje')).toContain('<svg');
  });
});
