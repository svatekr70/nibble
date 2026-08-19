import { describe, expect, it } from 'vitest';
import { parseWindow } from './dom.js';
import { countWords, findMatches } from '../../plugins/src/tools.js';

describe('počítání slov', () => {
  it.each([
    ['', 0],
    ['   ', 0],
    ['jedno', 1],
    ['dvě slova', 2],
    ['více    mezer   mezi   slovy', 4],
    ['řádek\nдруhý řádek', 3],
  ])('%s → %s', (text, expected) => {
    expect(countWords(text)).toBe(expected);
  });
});

describe('hledání v obsahu', () => {
  function build(html: string) {
    const { document } = parseWindow();
    const root = document.createElement('div');
    root.innerHTML = html;
    return root;
  }

  it('najde výskyty napříč uzly', () => {
    const root = build('<p>ahoj</p><p>ahoj ahoj</p>');
    expect(findMatches(root, 'ahoj', true)).toHaveLength(3);
  });

  it('bez rozlišení velikosti najde víc', () => {
    const root = build('<p>Ahoj ahoj AHOJ</p>');
    expect(findMatches(root, 'ahoj', false)).toHaveLength(3);
    expect(findMatches(root, 'ahoj', true)).toHaveLength(1);
  });

  it('nehledá ve značkách, jen v textu', () => {
    const root = build('<p class="ahoj">text</p>');
    expect(findMatches(root, 'ahoj', true)).toHaveLength(0);
  });

  it('prázdný dotaz nevrátí nic', () => {
    expect(findMatches(build('<p>text</p>'), '', true)).toHaveLength(0);
  });

  it('překrývající se výskyty se nepočítají dvakrát', () => {
    // "aaaa" obsahuje "aa" dvakrát bez překryvu, ne třikrát.
    expect(findMatches(build('<p>aaaa</p>'), 'aa', true)).toHaveLength(2);
  });
});
