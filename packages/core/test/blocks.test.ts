import { describe, expect, it } from 'vitest';
import { parseWindow } from './dom.js';
import {
  convertBlock, ensureBlock, fillIfEmpty, isEmptyBlock, mergeBlocks, pruneEmptyInline,
} from '../src/dom/blocks.js';

/**
 * Tady jsou jen pomocníky, které se obejdou bez `Range` — linkedom ho má
 * neúplný a `setStart` v něm chybí. Dělení bloků, `blocksInRange` a chování
 * kurzoru se testují v Playwrightu (`e2e/blocks.spec.ts`).
 */

function build(html: string) {
  const { document } = parseWindow();
  const root = document.createElement('div');
  root.innerHTML = html;
  return { root, document };
}

describe('výplňové <br>', () => {
  it('prázdný blok ho dostane', () => {
    const { root, document } = build('<p></p>');
    fillIfEmpty(root.children[0]!, document);
    expect(root.innerHTML).toBe('<p><br></p>');
  });

  it('blok s prázdným textovým uzlem taky — jinak by vyšlo <p></p>', () => {
    const { root, document } = build('<p></p>');
    root.children[0]!.appendChild(document.createTextNode(''));
    fillIfEmpty(root.children[0]!, document);
    expect(root.innerHTML).toBe('<p><br></p>');
  });

  it('blok s obsahem se nechá být', () => {
    const { root, document } = build('<p>text</p>');
    fillIfEmpty(root.children[0]!, document);
    expect(root.innerHTML).toBe('<p>text</p>');
  });

  it('druhé <br> nepřibude', () => {
    const { root, document } = build('<p><br></p>');
    fillIfEmpty(root.children[0]!, document);
    expect(root.innerHTML).toBe('<p><br></p>');
  });
});

describe('isEmptyBlock', () => {
  it.each([
    ['<p></p>', true],
    ['<p><br></p>', true],
    ['<p>text</p>', false],
    ['<p><strong></strong></p>', false],
  ])('%s → %s', (html, expected) => {
    const { root } = build(html);
    expect(isEmptyBlock(root.children[0]!)).toBe(expected);
  });
});

describe('convertBlock', () => {
  it('vymění značku a nechá obsah', () => {
    const { root, document } = build('<p>text <strong>tučně</strong></p>');
    convertBlock(root.children[0]!, 'h2', document);
    expect(root.innerHTML).toBe('<h2>text <strong>tučně</strong></h2>');
  });

  it('atributy přežijí', () => {
    const { root, document } = build('<p class="x" style="text-align: center;">t</p>');
    const next = convertBlock(root.children[0]!, 'h3', document);
    // Jen hodnoty: linkedom pořadí atributů nezachovává, prohlížeč ano —
    // na to je test v e2e/blocks.spec.ts.
    expect(next.getAttribute('class')).toBe('x');
    expect(next.getAttribute('style')).toBe('text-align: center;');
  });

  it('stejná značka se neřeší', () => {
    const { root, document } = build('<p>t</p>');
    const before = root.children[0];
    expect(convertBlock(root.children[0]!, 'p', document)).toBe(before);
  });
});


describe('mergeBlocks', () => {
  it('spojí dva odstavce', () => {
    const { root, document } = build('<p>prvni</p><p>druhy</p>');
    mergeBlocks(root.children[0]!, root.children[1]!, document);
    expect(root.innerHTML).toBe('<p>prvnidruhy</p>');
  });

  it('výplňové <br> cíle zmizí', () => {
    const { root, document } = build('<p><br></p><p>text</p>');
    mergeBlocks(root.children[0]!, root.children[1]!, document);
    expect(root.innerHTML).toBe('<p>text</p>');
  });
});

describe('ensureBlock', () => {
  it('holý text v kořeni obalí odstavcem', () => {
    const { root, document } = build('holý text');
    const block = ensureBlock(root.firstChild, root, document);
    expect(block?.tagName.toLowerCase()).toBe('p');
    expect(root.innerHTML).toBe('<p>holý text</p>');
  });

  it('obalí celý souvislý inline úsek, ne jen jeden uzel', () => {
    const { root, document } = build('a<strong>b</strong>c');
    ensureBlock(root.childNodes[1]!, root, document);
    expect(root.innerHTML).toBe('<p>a<strong>b</strong>c</p>');
  });

  it('úsek končí na hranici sousedního bloku', () => {
    const { root, document } = build('<p>blok</p>volný text<p>další</p>');
    ensureBlock(root.childNodes[1]!, root, document);
    expect(root.innerHTML).toBe('<p>blok</p><p>volný text</p><p>další</p>');
  });

  it('existující blok vrátí beze změny', () => {
    const { root, document } = build('<h2>nadpis</h2>');
    const block = ensureBlock(root.children[0]!.firstChild, root, document);
    expect(block).toBe(root.children[0]);
    expect(root.innerHTML).toBe('<h2>nadpis</h2>');
  });
});

describe('pruneEmptyInline', () => {
  it('zahodí prázdný obal, který zbyl po dělení', () => {
    const { root } = build('<p><strong>text</strong><em></em></p>');
    pruneEmptyInline(root.children[0]!);
    expect(root.innerHTML).toBe('<p><strong>text</strong></p>');
  });

  it('zahodí i vnořené prázdné obaly', () => {
    const { root } = build('<p>t<strong><em></em></strong></p>');
    pruneEmptyInline(root.children[0]!);
    expect(root.innerHTML).toBe('<p>t</p>');
  });

  it('<br> a <img> nechá být', () => {
    const { root } = build('<p><br><img src="/a.png"></p>');
    pruneEmptyInline(root.children[0]!);
    expect(root.innerHTML).toBe('<p><br><img src="/a.png"></p>');
  });

  it('obal s obsahem nechá být', () => {
    const { root } = build('<p><strong>t</strong></p>');
    pruneEmptyInline(root.children[0]!);
    expect(root.innerHTML).toBe('<p><strong>t</strong></p>');
  });
});
