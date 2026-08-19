import { describe, expect, it } from 'vitest';
import { parseWindow } from './dom.js';
import {
  indentItem, isEmptyItem, itemDepth, mergeAdjacentLists,
  normalizeList, outdentItem, sublistOf, syncAriaLevel,
} from '../src/dom/lists.js';

/**
 * Strukturní část seznamů se obejde bez `Range`, takže se dá testovat tady.
 * Dělení položky Enterem, kurzor a klávesy jsou v `e2e/lists.spec.ts`.
 */
function build(html: string) {
  const { document } = parseWindow();
  const root = document.createElement('div');
  root.innerHTML = html;
  return { root, document, list: root.firstElementChild as Element };
}

const li = (root: Element, i: number) => root.querySelectorAll('li')[i]!;

describe('normalizeList', () => {
  it('seznam visící jako sourozenec přesune do předchozí položky', () => {
    const { root, list, document } = build('<ul><li>a</li><ul><li>b</li></ul></ul>');
    normalizeList(list, document);
    expect(root.innerHTML).toBe('<ul><li>a<ul><li>b</li></ul></li></ul>');
  });

  it('seznam bez předchozí položky dostane vlastní položku', () => {
    const { root, list, document } = build('<ul><ul><li>b</li></ul></ul>');
    normalizeList(list, document);
    expect(root.innerHTML).toBe('<ul><li><ul><li>b</li></ul></li></ul>');
  });

  it('holý text v seznamu obalí položkou', () => {
    const { root, list, document } = build('<ul>bez polozky<li>a</li></ul>');
    normalizeList(list, document);
    expect(root.innerHTML).toBe('<ul><li>bez polozky</li><li>a</li></ul>');
  });

  it('platnou strukturu nechá být', () => {
    const html = '<ul><li>a<ul><li>b</li></ul></li></ul>';
    const { root, list, document } = build(html);
    normalizeList(list, document);
    expect(root.innerHTML).toBe(html);
  });

  it('srovná i zanořené úrovně', () => {
    const { root, list, document } = build(
      '<ul><li>a</li><ul><li>b</li><ul><li>c</li></ul></ul></ul>');
    normalizeList(list, document);
    expect(root.innerHTML).toBe(
      '<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul></li></ul>');
  });
});

describe('indentItem', () => {
  it('zanoří položku pod předchozí', () => {
    const { root, document } = build('<ul><li>a</li><li>b</li></ul>');
    expect(indentItem(li(root, 1), root, document)).toBe(true);
    expect(root.innerHTML).toBe('<ul><li>a<ul><li>b</li></ul></li></ul>');
  });

  it('první položku zanořit nejde — nebylo by ji pod co pověsit', () => {
    const { root, document } = build('<ul><li>a</li><li>b</li></ul>');
    expect(indentItem(li(root, 0), root, document)).toBe(false);
    expect(root.innerHTML).toBe('<ul><li>a</li><li>b</li></ul>');
  });

  it('přidá se do existujícího podseznamu, nezaloží druhý', () => {
    const { root, document } = build('<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>');
    indentItem(li(root, 2), root, document);
    expect(root.innerHTML).toBe('<ul><li>a<ul><li>b</li><li>c</li></ul></li></ul>');
  });

  it('zanořený seznam si drží druh nadřazeného', () => {
    const { root, document } = build('<ol><li>a</li><li>b</li></ol>');
    indentItem(li(root, 1), root, document);
    expect(sublistOf(li(root, 0))?.tagName.toLowerCase()).toBe('ol');
  });
});

describe('outdentItem', () => {
  it('vysune zanořenou položku o úroveň', () => {
    const { root, document } = build('<ul><li>a<ul><li>b</li></ul></li></ul>');
    expect(outdentItem(li(root, 1), root, document)).toBe(true);
    expect(root.innerHTML).toBe('<ul><li>a</li><li>b</li></ul>');
  });

  it('z nejvyšší úrovně udělá odstavec', () => {
    const { root, document } = build('<ul><li>a</li></ul>');
    outdentItem(li(root, 0), root, document);
    expect(root.innerHTML).toBe('<p>a</p>');
  });

  it('následující položky se přesunou pod vysunutou', () => {
    const { root, document } = build('<ul><li>a<ul><li>b</li><li>c</li></ul></li></ul>');
    outdentItem(li(root, 1), root, document);
    expect(root.innerHTML).toBe('<ul><li>a</li><li>b<ul><li>c</li></ul></li></ul>');
  });

  it('zbytek seznamu při vystoupení nahoru zůstane seznamem', () => {
    const { root, document } = build('<ul><li>a</li><li>b</li></ul>');
    outdentItem(li(root, 0), root, document);
    expect(root.innerHTML).toBe('<p>a</p><ul><li>b</li></ul>');
  });

  it('položka s vlastním blokem nedostane odstavec navíc', () => {
    const { root, document } = build('<ul><li><h3>nadpis</h3></li></ul>');
    outdentItem(li(root, 0), root, document);
    expect(root.innerHTML).toBe('<h3>nadpis</h3>');
  });
});

describe('mergeAdjacentLists', () => {
  it('spojí dva sousední seznamy stejného druhu', () => {
    const { root } = build('<ul><li>a</li></ul><ul><li>b</li></ul>');
    mergeAdjacentLists(root.children[0]!, root);
    expect(root.innerHTML).toBe('<ul><li>a</li><li>b</li></ul>');
  });

  it('seznamy různého druhu nechá být', () => {
    const html = '<ul><li>a</li></ul><ol><li>b</li></ol>';
    const { root } = build(html);
    mergeAdjacentLists(root.children[0]!, root);
    expect(root.innerHTML).toBe(html);
  });

  it('spojí i řadu tří seznamů', () => {
    const { root } = build('<ul><li>a</li></ul><ul><li>b</li></ul><ul><li>c</li></ul>');
    mergeAdjacentLists(root.children[0]!, root);
    expect(root.innerHTML).toBe('<ul><li>a</li><li>b</li><li>c</li></ul>');
  });
});

describe('aria-level', () => {
  it('se srovná podle skutečné hloubky', () => {
    const { root, list } = build(
      '<ul><li aria-level="9">a<ul><li aria-level="9">b</li></ul></li></ul>');
    syncAriaLevel(list, root);
    expect(li(root, 0).getAttribute('aria-level')).toBe('1');
    expect(li(root, 1).getAttribute('aria-level')).toBe('2');
  });

  it('se nedoplňuje tam, kde nikdy nebyl', () => {
    const { root, list } = build('<ul><li>a</li></ul>');
    syncAriaLevel(list, root);
    expect(li(root, 0).hasAttribute('aria-level')).toBe(false);
  });
});

describe('itemDepth', () => {
  it('nejvyšší úroveň je 1', () => {
    const { root } = build('<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul></li></ul>');
    expect([0, 1, 2].map((i) => itemDepth(li(root, i), root))).toEqual([1, 2, 3]);
  });
});

describe('isEmptyItem', () => {
  it.each([
    ['<ul><li></li></ul>', true],
    ['<ul><li><br></li></ul>', true],
    ['<ul><li>a</li></ul>', false],
    ['<ul><li><ul><li>a</li></ul></li></ul>', true],
    ['<ul><li>a<ul><li>b</li></ul></li></ul>', false],
  ])('%s → %s', (html, expected) => {
    const { root } = build(html);
    expect(isEmptyItem(li(root, 0))).toBe(expected);
  });
});
