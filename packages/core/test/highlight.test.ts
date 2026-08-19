import { describe, expect, it } from 'vitest';
import { highlightHtml } from '../../ui/src/CodeField.js';

/** Zpátky z escapovaného HTML na text. */
const unescape = (text: string): string =>
  text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Vytáhne obarvené kousky daného druhu — obsah span je escapovaný. */
const parts = (html: string, kind: string): string[] =>
  [...html.matchAll(new RegExp('<span class="nb-hl-' + kind + '">([^<]*)</span>', 'g'))]
    .map((m) => unescape(m[1]!));

/** Text bez obarvení — musí sedět s původním vstupem. */
const plain = (html: string): string =>
  unescape(html.replace(/<span class="nb-hl-[a-z]+">|<\/span>/g, ''));

describe('zvýraznění syntaxe', () => {
  it('obarví značku, atribut i hodnotu', () => {
    const out = highlightHtml('<p class="x">text</p>');
    expect(parts(out, 'tag')).toEqual(['p', 'p']);
    expect(parts(out, 'attr')).toEqual(['class']);
    expect(parts(out, 'value')).toEqual(['"x"']);
  });

  it('entitu pozná', () => {
    expect(parts(highlightHtml('<p>a&iacute;b</p>'), 'entity')).toEqual(['&iacute;']);
    expect(parts(highlightHtml('<p>&#233;</p>'), 'entity')).toEqual(['&#233;']);
  });

  it('osamocený ampersand se za entitu nepovažuje', () => {
    expect(parts(highlightHtml('<p>a & b</p>'), 'entity')).toEqual([]);
  });

  it('komentář obarví celý', () => {
    expect(parts(highlightHtml('<!-- pozn --><p>a</p>'), 'comment')).toEqual(['<!-- pozn -->']);
  });

  it('`>` uvnitř hodnoty atributu značku neukončí', () => {
    const out = highlightHtml('<p title="a > b">x</p>');
    expect(parts(out, 'value')).toEqual(['"a > b"']);
  });

  it('hodnota bez uvozovek projde taky', () => {
    expect(parts(highlightHtml('<p class=x>t</p>'), 'value')).toEqual(['x']);
  });

  it('víc atributů naráz', () => {
    const out = highlightHtml('<a href="/x" target="_blank" rel="noopener">t</a>');
    expect(parts(out, 'attr')).toEqual(['href', 'target', 'rel']);
  });

  it('doctype', () => {
    expect(parts(highlightHtml('<!doctype html>'), 'doctype')).toEqual(['<!doctype html>']);
  });
});

describe('zvýraznění nesmí text změnit', () => {
  it.each([
    ['<p class="x">text</p>'],
    ['<p>a&iacute;b &amp; c</p>'],
    ['<!-- pozn -->\n<div id=a>\n  <span>x</span>\n</div>'],
    ['<p title="a > b">x</p>'],
    ['prostý text bez značek'],
    [''],
  ])('%s projde beze změny', (source) => {
    // Kdyby zvýraznění text posunulo, rozejde se s kurzorem v textarea pod ním.
    expect(plain(highlightHtml(source))).toBe(source);
  });

  it('nebezpečný obsah se neprovede — je jen obarvený', () => {
    const out = highlightHtml('<script>alert(1)</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;');
  });
});
