import { describe, expect, it } from 'vitest';
import { parseWindow } from './dom.js';
import {
  htmlIndexForTextOffset, positionAtTextOffset, textOffsetForHtmlIndex, textOffsetOf,
} from '../src/model/sourceMap.js';

function build(html: string) {
  const { document } = parseWindow();
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

describe('počet znaků textu před pozicí', () => {
  it('uvnitř prvního odstavce', () => {
    const root = build('<p>abcdef</p>');
    expect(textOffsetOf(root, root.querySelector('p')!.firstChild!, 3)).toBe(3);
  });

  it('sečte i text předchozích bloků', () => {
    const root = build('<p>abc</p><p>defgh</p>');
    const second = root.querySelectorAll('p')[1]!.firstChild!;
    expect(textOffsetOf(root, second, 2)).toBe(5);
  });

  it('značky se nepočítají', () => {
    const root = build('<p><strong>ab</strong>cd</p>');
    expect(textOffsetOf(root, root.querySelector('p')!.lastChild!, 2)).toBe(4);
  });

  it('kurzor mezi bloky', () => {
    const root = build('<p>abc</p><p>def</p>');
    expect(textOffsetOf(root, root, 1)).toBe(3);
  });

  it('obsah <script> se do textu nepočítá', () => {
    const root = build('<p>ab</p><script>var x = 12345;</script><p>cd</p>');
    const last = root.querySelectorAll('p')[1]!.firstChild!;
    expect(textOffsetOf(root, last, 2)).toBe(4);
  });
});

describe('pozice v HTML podle počtu znaků', () => {
  it('přeskočí značky', () => {
    const html = '<p>abcdef</p>';
    expect(html.slice(0, htmlIndexForTextOffset(html, 3))).toBe('<p>abc');
  });

  it('entita se počítá jako jeden znak', () => {
    // `&iacute;` je v HTML osm znaků, pro čtenáře jedno písmeno. Bez toho by
    // se pozice v českém textu rozjela o desítky znaků.
    const html = '<p>a&iacute;b</p>';
    expect(html.slice(0, htmlIndexForTextOffset(html, 2))).toBe('<p>a&iacute;');
    expect(html.slice(0, htmlIndexForTextOffset(html, 3))).toBe('<p>a&iacute;b');
  });

  it('číselná entita taky', () => {
    const html = '<p>a&#233;b</p>';
    expect(html.slice(0, htmlIndexForTextOffset(html, 2))).toBe('<p>a&#233;');
  });

  it('osamocený ampersand se počítá jako znak', () => {
    const html = '<p>a & b</p>';
    expect(html.slice(0, htmlIndexForTextOffset(html, 3))).toBe('<p>a &');
  });

  it('nepřeskočí `>` uvnitř uvozovek atributu', () => {
    const html = '<p title="a > b">xy</p>';
    expect(html.slice(0, htmlIndexForTextOffset(html, 1))).toBe('<p title="a > b">x');
  });

  it('komentář se přeskočí celý', () => {
    const html = '<!-- pozn --><p>ab</p>';
    expect(html.slice(0, htmlIndexForTextOffset(html, 1))).toBe('<!-- pozn --><p>a');
  });

  it('nula je začátek', () => {
    expect(htmlIndexForTextOffset('<p>abc</p>', 0)).toBe(0);
  });

  it('za koncem vrátí konec', () => {
    const html = '<p>abc</p>';
    expect(htmlIndexForTextOffset(html, 999)).toBe(html.length);
  });
});

describe('opačný převod', () => {
  it('z pozice v HTML na počet znaků', () => {
    const html = '<p>abcdef</p>';
    expect(textOffsetForHtmlIndex(html, html.indexOf('def'))).toBe(3);
  });

  it('kurzor uvnitř značky patří na její začátek', () => {
    const html = '<p>ab</p><p>cd</p>';
    // Index uprostřed druhého <p> — text před ním jsou dva znaky.
    expect(textOffsetForHtmlIndex(html, 11)).toBe(2);
  });

  it('entity se počítají po jednom', () => {
    const html = '<p>a&iacute;b</p>';
    expect(textOffsetForHtmlIndex(html, html.length - 4)).toBe(3);
  });

  it('tam a zpátky dá totéž', () => {
    const html = '<p>prvn&iacute;</p><h2>druh&yacute; nadpis</h2><p>t&rcaron;et&iacute;</p>';
    for (const offset of [0, 1, 5, 9, 14, 20]) {
      const index = htmlIndexForTextOffset(html, offset);
      expect(textOffsetForHtmlIndex(html, index)).toBe(offset);
    }
  });
});

describe('umístění zpátky do dokumentu', () => {
  it('najde uzel a posun', () => {
    const root = build('<p>abc</p><p>defgh</p>');
    const found = positionAtTextOffset(root, 5)!;
    expect(found.node.nodeValue).toBe('defgh');
    expect(found.offset).toBe(2);
  });

  it('na začátku', () => {
    const root = build('<p>abc</p>');
    expect(positionAtTextOffset(root, 0)!.offset).toBe(0);
  });

  it('přes hranici uzlů', () => {
    const root = build('<p><strong>ab</strong>cd</p>');
    const found = positionAtTextOffset(root, 3)!;
    expect(found.node.nodeValue).toBe('cd');
    expect(found.offset).toBe(1);
  });

  it('za koncem nic nevrátí', () => {
    expect(positionAtTextOffset(build('<p>abc</p>'), 99)).toBeNull();
  });

  it('cesta tam a zpět sedí na skutečném obsahu', () => {
    const root = build('<p>první</p><h2>druhý</h2>');
    const node = root.querySelectorAll('p, h2')[1]!.firstChild!;
    const offset = textOffsetOf(root, node, 3);
    const back = positionAtTextOffset(root, offset)!;
    expect(back.node).toBe(node);
    expect(back.offset).toBe(3);
  });
});
