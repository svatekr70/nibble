import { describe, expect, it } from 'vitest';
import { parseWindow } from './dom.js';
import {
  applyListProps, listChain, MARKERS, MARKER_NONE, readListProps,
} from '../src/dom/listProps.js';

function build(html: string) {
  const { document } = parseWindow();
  const root = document.createElement('div');
  root.innerHTML = html;
  return { root, document, list: root.firstElementChild as Element };
}

/**
 * Styl se čte přes CSSOM, ne z `innerHTML`.
 *
 * Linkedom serializuje `style` jinak než prohlížeč — bez mezery za dvojtečkou
 * a bez koncového středníku. Přesný tvar uloženého atributu proto hlídají až
 * testy v prohlížeči (`e2e/lists.spec.ts`), tady jde o hodnotu.
 */
const css = (el: Element, property: string) =>
  (el as HTMLElement).style.getPropertyValue(property);

describe('applyListProps — druh značky', () => {
  it.each(MARKERS.map((m) => [m.text, m.value, m.list, m.attr, m.style] as const))(
    '%s se zapíše stylem a tam, kde na to atribut je, i atributem',
    (_text, value, listTag, attr, style) => {
      const { list } = build(`<${listTag}><li>a</li></${listTag}>`);
      applyListProps(list, { marker: value });
      // Znakové odrážky atribut `type` nemají — na řetězec žádný není.
      expect(list.getAttribute('type')).toBe(attr === '' ? null : attr);
      expect(css(list, 'list-style-type')).toBe(style);
    },
  );

  it('znaková odrážka se uloží jako řetězec, bez atributu', () => {
    const { list } = build('<ul><li>a</li></ul>');
    applyListProps(list, { marker: '"– "' });
    expect(list.hasAttribute('type')).toBe(false);
    expect(css(list, 'list-style-type')).toBe('"– "');
  });

  it('znakové odrážky se nabízejí jen u odrážek', () => {
    expect(MARKERS.filter((m) => m.attr === '').every((m) => m.list === 'ul')).toBe(true);
  });

  it('„bez značky" zapíše jen styl — atribut na to není', () => {
    const { list } = build('<ol><li>a</li></ol>');
    applyListProps(list, { marker: MARKER_NONE });
    expect(list.hasAttribute('type')).toBe(false);
    expect(css(list, 'list-style-type')).toBe('none');
  });

  it('prázdná hodnota atribut i vlastnost odstraní', () => {
    const { root, list } = build('<ol type="a" style="list-style-type: lower-alpha;"><li>a</li></ol>');
    applyListProps(list, { marker: '' });
    expect(root.innerHTML).toBe('<ol><li>a</li></ol>');
  });

  it('vyprázdněný styl se smaže celý, nezůstane style=""', () => {
    const { list } = build('<ul style="list-style-type: square;"><li>a</li></ul>');
    applyListProps(list, { marker: '' });
    expect(list.hasAttribute('style')).toBe(false);
  });

  it('přepnutí druhu nenechá po sobě starý atribut', () => {
    const { list } = build('<ol type="a" style="list-style-type: lower-alpha;"><li>a</li></ol>');
    applyListProps(list, { marker: 'upper-roman' });
    expect(list.getAttribute('type')).toBe('I');
    expect(css(list, 'list-style-type')).toBe('upper-roman');
  });
});

describe('applyListProps — odsazení a počáteční číslo', () => {
  it('zapíše list-style-position', () => {
    const { list } = build('<ul><li>a</li></ul>');
    applyListProps(list, { position: 'inside' });
    expect((list as HTMLElement).style.getPropertyValue('list-style-position')).toBe('inside');
  });

  it('start se zapíše na <ol>', () => {
    const { list } = build('<ol><li>a</li></ol>');
    applyListProps(list, { start: '4' });
    expect(list.getAttribute('start')).toBe('4');
  });

  it('start se na odrážky nezapisuje — nic by neznamenal', () => {
    const { list } = build('<ul><li>a</li></ul>');
    applyListProps(list, { start: '4' });
    expect(list.hasAttribute('start')).toBe(false);
  });

  it('číslo z dialogu přijde jako number a projde', () => {
    const { list } = build('<ol><li>a</li></ol>');
    applyListProps(list, { start: 4 as unknown as string });
    expect(list.getAttribute('start')).toBe('4');
  });

  it('vlastnost, kterou dialog neposlal, zůstane beze změny', () => {
    const { list } = build('<ol type="a" style="list-style-type: lower-alpha;"><li>a</li></ol>');
    applyListProps(list, { position: 'inside' });
    expect(list.getAttribute('type')).toBe('a');
    expect(css(list, 'list-style-type')).toBe('lower-alpha');
    expect(css(list, 'list-style-position')).toBe('inside');
  });
});

describe('readListProps', () => {
  it('přečte, co na seznamu je', () => {
    const { list } = build('<ol type="a" style="list-style-type: lower-alpha; list-style-position: inside;" start="3"><li>a</li></ol>');
    expect(readListProps(list)).toEqual({
      marker: 'lower-alpha', position: 'inside', start: '3',
    });
  });

  it('holý seznam nemá určeno nic', () => {
    const { list } = build('<ul><li>a</li></ul>');
    expect(readListProps(list)).toEqual({ marker: '', position: '', start: '' });
  });

  it('samotný atribut se přeloží na druh značky', () => {
    const { list } = build('<ol type="I"><li>a</li></ol>');
    expect(readListProps(list).marker).toBe('upper-roman');
  });

  it('při rozporu platí styl — to je, co je vidět', () => {
    const { list } = build('<ol type="a" style="list-style-type: upper-roman;"><li>a</li></ol>');
    expect(readListProps(list).marker).toBe('upper-roman');
  });

  it('start se čte jen u <ol>', () => {
    const { list } = build('<ul start="3"><li>a</li></ul>');
    expect(readListProps(list).start).toBe('');
  });
});

/**
 * Záruka zachování obsahu. Otevřít dialog a dát Použít beze změny nesmí
 * s obsahem hnout — jinak by se přeformátoval blok, kterého se nikdo nedotkl.
 */
describe('zápis přečteného je identita', () => {
  it.each([
    '<ol><li>a</li></ol>',
    '<ul><li>a</li></ul>',
    '<ol type="a" style="list-style-type: lower-alpha;"><li>a</li></ol>',
    '<ol start="4"><li>a</li></ol>',
    '<ul style="list-style-position: inside;"><li>a</li></ul>',
    '<ol style="list-style-type: none;"><li>a</li></ol>',
  ])('%s', (html) => {
    const { root, list } = build(html);
    applyListProps(list, readListProps(list));
    expect(root.innerHTML).toBe(html);
  });

  it('neznámou hodnotu v obsahu zachová, i když ji dialog nenabízí', () => {
    const html = '<ol style="list-style-type: lower-greek;"><li>a</li></ol>';
    const { root, list } = build(html);
    expect(readListProps(list).marker).toBe('lower-greek');
    applyListProps(list, readListProps(list));
    expect(root.innerHTML).toBe(html);
  });
});

describe('listChain', () => {
  it('vrátí úrovně odshora dolů', () => {
    const { root } = build('<ul><li>a<ol><li>b</li></ol></li></ul>');
    const inner = root.querySelectorAll('li')[1]!;
    const chain = listChain(inner, root);
    expect(chain.map((l) => l.tagName.toLowerCase())).toEqual(['ul', 'ol']);
  });

  it('z nejvyšší úrovně vrátí jednu', () => {
    const { root } = build('<ul><li>a<ol><li>b</li></ol></li></ul>');
    expect(listChain(root.querySelectorAll('li')[0]!, root)).toHaveLength(1);
  });

  it('mimo seznam nevrátí nic', () => {
    const { root } = build('<p>a</p>');
    expect(listChain(root.firstChild, root)).toEqual([]);
  });

  it('kořen sám se do řetězu nepočítá', () => {
    const { document } = parseWindow();
    const root = document.createElement('ul');
    root.innerHTML = '<li>a</li>';
    expect(listChain(root.firstElementChild, root)).toEqual([]);
  });
});

describe('úrovně se nastavují nezávisle', () => {
  it('vnitřní seznam nepřepíše vnější', () => {
    const { root } = build('<ul><li>a<ol><li>b</li></ol></li></ul>');
    const [outer, inner] = listChain(root.querySelectorAll('li')[1]!, root);

    applyListProps(outer!, { marker: 'square' });
    applyListProps(inner!, { marker: 'upper-roman' });

    expect(css(outer!, 'list-style-type')).toBe('square');
    expect(outer!.getAttribute('type')).toBe('square');
    expect(css(inner!, 'list-style-type')).toBe('upper-roman');
    expect(inner!.getAttribute('type')).toBe('I');
  });

  it('sourozenecký seznam na téže úrovni zůstane nedotčený', () => {
    const { root } = build('<ol><li>a</li></ol><ol><li>b</li></ol>');
    applyListProps(root.children[0]!, { marker: 'lower-alpha' });
    expect(root.children[1]!.hasAttribute('type')).toBe(false);
  });
});
