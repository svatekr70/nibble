import { describe, expect, it } from 'vitest';
import { parseWindow } from './dom.js';
import { anchorSlug, uniqueAnchor } from '../src/commands/anchor.js';

function build(html: string) {
  const { document } = parseWindow();
  const root = document.createElement('div');
  root.innerHTML = html;
  return { root, document };
}

describe('anchorSlug', () => {
  it.each([
    ['První kapitola', 'prvni-kapitola'],
    ['Žluťoučký kůň', 'zlutoucky-kun'],
    ['  více   mezer  ', 'vice-mezer'],
    ['UPPER Case', 'upper-case'],
    ['Kapitola 2.1', 'kapitola-2-1'],
    ['---už-slug---', 'uz-slug'],
    ['@#$%', ''],
    ['', ''],
  ])('%s → %s', (vstup, cekano) => {
    expect(anchorSlug(vstup)).toBe(cekano);
  });

  it('je idempotentní — slug ze slugu je týž slug', () => {
    const once = anchorSlug('Příliš žluťoučký kůň!');
    expect(anchorSlug(once)).toBe(once);
  });

  it('nekonečně dlouhý název se zkrátí', () => {
    expect(anchorSlug('a'.repeat(200)).length).toBe(64);
  });
});

describe('uniqueAnchor', () => {
  it('volný název nechá být', () => {
    const { root } = build('<p>a</p>');
    expect(uniqueAnchor(root, 'kotva', null)).toBe('kotva');
  });

  it('obsazený název očísluje', () => {
    const { root } = build('<p id="kotva">a</p>');
    expect(uniqueAnchor(root, 'kotva', null)).toBe('kotva-2');
  });

  it('očísluje dál, dokud je volno', () => {
    const { root } = build('<p id="kotva">a</p><p id="kotva-2">b</p>');
    expect(uniqueAnchor(root, 'kotva', null)).toBe('kotva-3');
  });

  it('vlastní název bloku se za kolizi nepočítá', () => {
    // Jinak by se kotva při každém otevření dialogu očíslovala znovu.
    const { root } = build('<p id="kotva">a</p>');
    const self = root.querySelector('p')!;
    expect(uniqueAnchor(root, 'kotva', self)).toBe('kotva');
  });

  it('všímá si id kdekoli v obsahu, nejen na blocích', () => {
    const { root } = build('<p>a<img id="kotva"></p>');
    expect(uniqueAnchor(root, 'kotva', null)).toBe('kotva-2');
  });
});
