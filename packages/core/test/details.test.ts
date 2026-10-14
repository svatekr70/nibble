import { describe, expect, it } from 'vitest';
import { parseWindow } from './dom.js';
import { unwrapDetails, wrapInDetails } from '../../plugins/src/details.js';
import { closestBlock } from '../src/dom/blocks.js';

describe('rozbalovací blok', () => {
  it('obalí bloky a přidá nadpis', () => {
    const { document } = parseWindow();
    const root = document.createElement('div');
    root.innerHTML = '<p>a</p><p>b</p>';
    const d = wrapInDetails(document, Array.from(root.children), 'Nadpis');
    expect(root.innerHTML).toBe('<details><summary>Nadpis</summary><p>a</p><p>b</p></details>');
    expect(d.tagName.toLowerCase()).toBe('details');
  });

  it('zrušení vrátí nadpis jako odstavec a obsah za něj', () => {
    const { document } = parseWindow();
    const root = document.createElement('div');
    root.innerHTML = '<details open><summary>N</summary><p>a</p></details>';
    unwrapDetails(root.firstElementChild!);
    expect(root.innerHTML).toBe('<p>N</p><p>a</p>');
  });

  it('summary je blok, do kterého se píše', () => {
    const { document } = parseWindow();
    const root = document.createElement('div');
    root.innerHTML = '<details><summary>N</summary></details>';
    const text = root.querySelector('summary')!.firstChild!;
    expect(closestBlock(text, root)?.tagName.toLowerCase()).toBe('summary');
  });
});
