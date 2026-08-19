import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseWindow } from './dom.js';
import { normalizeNewlines, parseInto } from '../src/model/Parser.js';
import { isIntact } from '../src/model/Regions.js';
import { serializeNode } from '../src/model/Serializer.js';

const DIR = join(import.meta.dirname, 'fixtures');
const FILES = readdirSync(DIR).filter((f) => f.endsWith('.html')).sort();

/** Co udělá `getHTML()` — nedotčené oblasti doslova, zbytek z DOMu. */
function serializeDocument(root: Element): string {
  const regions = (root as unknown as { __regions: ReturnType<typeof parseInto>['regions'] }).__regions;
  const firstOf = new Map<Node, (typeof regions)[number]>();
  for (const r of regions) if (r.nodes[0]) firstOf.set(r.nodes[0], r);

  let out = '';
  const children = Array.from(root.childNodes);
  let i = 0;
  while (i < children.length) {
    const node = children[i]!;
    const region = firstOf.get(node);
    if (region && isIntact(region, root)) {
      out += region.source;
      i += region.nodes.length;
      continue;
    }
    out += serializeNode(node, { entityEncoding: 'named' });
    i += 1;
  }
  return out;
}

function load(html: string) {
  const { document } = parseWindow();
  const root = document.createElement('div');
  const result = parseInto(root as unknown as HTMLElement, html, document);
  (root as unknown as { __regions: unknown }).__regions = result.regions;
  return { root, document, result };
}

describe('round-trip nad reálným obsahem z ostrého provozu', () => {
  it('má z čeho testovat', () => {
    expect(FILES.length).toBeGreaterThan(100);
  });

  for (const file of FILES) {
    const html = readFileSync(join(DIR, file), 'utf8');

    it('načte a uloží beze změny: ' + file, () => {
      const { root } = load(html);
      // Proti normalizovanému vstupu: CRLF na LF je jediná změna, kterou
      // Nibble dělá vždy — prohlížeč ho na `\r` stejně nepustí.
      expect(serializeDocument(root as unknown as Element)).toBe(normalizeNewlines(html));
    });
  }
});

describe('round-trip u konkrétních konstrukcí', () => {
  const cases: Array<[string, string]> = [
    ['pojmenované entity', '<p>P&iacute;smeno &scaron; a &nbsp; mezera</p>'],
    ['jednoduché uvozovky v atributu', "<p class='x'>text</p>"],
    ['neuvozená hodnota atributu', '<p class=x>text</p>'],
    ['pořadí atributů', '<a target="_blank" href="/a" rel="noopener">x</a>'],
    ['velká písmena ve značce', '<P>text</P>'],
    ['prázdný atribut', '<p data-x>text</p>'],
    ['nezavřený odstavec', '<p>první<p>druhý'],
    ['zastaralé značky', '<p><font color="red"><b>staré</b></font></p>'],
    ['tabulka se šířkami', '<table><colgroup><col width="120"></colgroup><tr><td>a</td></tr></table>'],
    ['seznam z Wordu', '<ul><li aria-level="1" data-list="bullet">bod</li></ul>'],
    ['komentář', '<p>a</p><!-- pozn --><p>b</p>'],
    ['bílé znaky mezi bloky', '<p>a</p>\n\n  <p>b</p>\n'],
    ['zalomení uvnitř značky', '<p\n  class="x"\n>text</p>'],
    ['data: URL', '<p><img src="data:image/png;base64,AAAA"></p>'],
  ];

  for (const [name, html] of cases) {
    it(name, () => {
      const { root } = load(html);
      expect(serializeDocument(root as unknown as Element)).toBe(normalizeNewlines(html));
    });
  }
});

describe('konce řádků', () => {
  it('CRLF se sjednotí na LF a dál se nemění', () => {
    const { root } = load('<p>a</p>\r\n<p>b</p>');
    const out = serializeDocument(root as unknown as Element);
    expect(out).toBe('<p>a</p>\n<p>b</p>');
    expect(out).not.toContain('\r');
  });

  it('samotné LF zůstává beze změny', () => {
    const { root } = load('<p>a</p>\n<p>b</p>');
    expect(serializeDocument(root as unknown as Element)).toBe('<p>a</p>\n<p>b</p>');
  });
});

describe('změna se projeví jen tam, kde nastala', () => {
  it('nedotčený sousední blok si nechá původní znění', () => {
    const html = '<p class=a>&iacute;prvn&iacute;</p><p class=b>druh&yacute;</p>';
    const { root, document } = load(html);

    const second = root.childNodes[1] as Element;
    second.appendChild(document.createTextNode('!'));

    const out = serializeDocument(root as unknown as Element);
    expect(out).toContain('<p class=a>&iacute;prvn&iacute;</p>');   // beze změny
    expect(out).toContain('<p class="b">druh&yacute;!</p>');        // přeformátováno
  });

  it('bezpečnostní zásah oblast otráví, takže se nevypíše původní zdroj', () => {
    const html = '<p onclick="zlo()">text</p>';
    const { root, result } = load(html);
    expect(result.removed).toContain('p@onclick');
    expect(serializeDocument(root as unknown as Element)).toBe('<p>text</p>');
  });
});
