import { describe, expect, it } from 'vitest';
import { parseWindow } from './dom.js';
import {
  closestDefItem, defListOf, isDefItem, isDefList, isEmptyDefItem,
  liftDefItem, normalizeDefList, otherKind,
} from '../src/dom/deflist.js';
import { closestBlock, isBlock } from '../src/dom/blocks.js';

/**
 * Strukturní část se obejde bez `Range`, takže se testuje tady. Enter,
 * Backspace a kurzor jsou v `e2e/deflist.spec.ts`.
 */
function build(html: string) {
  const { document } = parseWindow();
  const root = document.createElement('div');
  root.innerHTML = html;
  return { root, document, list: root.firstElementChild as Element };
}

const item = (root: Element, i: number) => root.querySelectorAll('dt, dd')[i]!;

describe('rozpoznání', () => {
  it('dt a dd jsou bloky, dl ne', () => {
    const { root } = build('<dl><dt>a</dt><dd>b</dd></dl>');
    expect(isBlock(root.querySelector('dt'))).toBe(true);
    expect(isBlock(root.querySelector('dd'))).toBe(true);
    // Kdyby byl `<dl>` blok, `closestBlock` by vracel celý seznam místo
    // prvku, do kterého se píše — a Enter by dělil seznam.
    expect(isBlock(root.querySelector('dl'))).toBe(false);
  });

  it('closestBlock vrátí prvek, ne seznam', () => {
    const { root } = build('<dl><dt>a</dt></dl>');
    const text = root.querySelector('dt')!.firstChild!;
    expect(closestBlock(text, root)!.tagName.toLowerCase()).toBe('dt');
  });

  it('closestDefItem najde prvek nad uzlem', () => {
    const { root } = build('<dl><dt>a<strong>b</strong></dt></dl>');
    const deep = root.querySelector('strong')!.firstChild!;
    expect(closestDefItem(deep, root)).toBe(root.querySelector('dt'));
  });

  it('mimo seznam definic nenajde nic', () => {
    const { root } = build('<p>a</p>');
    expect(closestDefItem(root.firstChild, root)).toBe(null);
  });

  it.each([
    ['<dl><dt>a</dt></dl>', true],
    ['<dl><dd>a</dd></dl>', true],
    ['<ul><li>a</li></ul>', false],
  ])('isDefItem %s → %s', (html, expected) => {
    const { root } = build(html);
    expect(isDefItem(root.firstElementChild!.firstElementChild)).toBe(expected);
  });

  it('defListOf vrátí seznam nad prvkem', () => {
    const { root, list } = build('<dl><dt>a</dt></dl>');
    expect(defListOf(item(root, 0))).toBe(list);
    expect(isDefList(list)).toBe(true);
  });
});

describe('otherKind', () => {
  it('po termínu vysvětlení a naopak', () => {
    const { root } = build('<dl><dt>a</dt><dd>b</dd></dl>');
    expect(otherKind(item(root, 0))).toBe('dd');
    expect(otherKind(item(root, 1))).toBe('dt');
  });
});

describe('isEmptyDefItem', () => {
  it.each([
    ['<dl><dt></dt></dl>', true],
    ['<dl><dt><br></dt></dl>', true],
    ['<dl><dd>  </dd></dl>', true],
    ['<dl><dt>a</dt></dl>', false],
  ])('%s → %s', (html, expected) => {
    const { root } = build(html);
    expect(isEmptyDefItem(item(root, 0))).toBe(expected);
  });
});

describe('normalizeDefList', () => {
  it('holý text v seznamu dostane termín', () => {
    const { root, list, document } = build('<dl>bez prvku</dl>');
    normalizeDefList(list, document);
    expect(root.innerHTML).toBe('<dl><dt>bez prvku</dt></dl>');
  });

  it('text za termínem se stane vysvětlením', () => {
    const { root, list, document } = build('<dl><dt>a</dt>volny text</dl>');
    normalizeDefList(list, document);
    expect(root.innerHTML).toBe('<dl><dt>a</dt><dd>volny text</dd></dl>');
  });

  it('text za vysvětlením se stane termínem', () => {
    const { root, list, document } = build('<dl><dt>a</dt><dd>b</dd>volny</dl>');
    normalizeDefList(list, document);
    expect(root.innerHTML).toBe('<dl><dt>a</dt><dd>b</dd><dt>volny</dt></dl>');
  });

  it('platnou strukturu nechá být', () => {
    const html = '<dl><dt>a</dt><dd>b</dd></dl>';
    const { root, list, document } = build(html);
    normalizeDefList(list, document);
    expect(root.innerHTML).toBe(html);
  });

  it('bílé znaky mezi prvky nejsou obsah', () => {
    const html = '<dl>\n  <dt>a</dt>\n  <dd>b</dd>\n</dl>';
    const { root, list, document } = build(html);
    normalizeDefList(list, document);
    expect(root.innerHTML).toBe(html);
  });
});

describe('liftDefItem', () => {
  it('z jediného prvku udělá odstavec a seznam zruší', () => {
    const { root, document } = build('<dl><dt>a</dt></dl>');
    liftDefItem(item(root, 0), document);
    expect(root.innerHTML).toBe('<p>a</p>');
  });

  it('vrátí prvek, ve kterém obsah skončil', () => {
    const { root, document } = build('<dl><dt>a</dt></dl>');
    const landing = liftDefItem(item(root, 0), document);
    expect(landing).toBe(root.firstElementChild);
    expect(root.contains(landing!)).toBe(true);
  });

  it('zbytek seznamu zůstane seznamem', () => {
    const { root, document } = build('<dl><dt>a</dt><dd>b</dd></dl>');
    liftDefItem(item(root, 0), document);
    expect(root.innerHTML).toBe('<p>a</p><dl><dd>b</dd></dl>');
  });

  it('vysunutí zprostředka rozdělí seznam', () => {
    const { root, document } = build('<dl><dt>a</dt><dd>b</dd><dt>c</dt></dl>');
    liftDefItem(item(root, 1), document);
    expect(root.innerHTML).toBe('<dl><dt>a</dt></dl><p>b</p><dl><dt>c</dt></dl>');
  });

  it('prvek s vlastním blokem nedostane odstavec navíc', () => {
    const { root, document } = build('<dl><dd><h3>nadpis</h3></dd></dl>');
    liftDefItem(item(root, 0), document);
    expect(root.innerHTML).toBe('<h3>nadpis</h3>');
  });

  it('mimo seznam vrátí null', () => {
    const { root, document } = build('<p>a</p>');
    expect(liftDefItem(root.firstElementChild!, document)).toBe(null);
  });
});
