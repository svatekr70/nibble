import { describe, expect, it } from 'vitest';
import { looksLikeMarkdown, markdownToHtml, plainTextToHtml } from '../src/model/markdown.js';

describe('rozpoznání Markdownu', () => {
  it.each([
    ['# Nadpis', true],
    ['```\nkod\n```', true],
    ['viz [dokumentace](https://example.com)', true],
    ['- prvni\n- druhy', true],
    ['1. prvni\n2. druhy', true],
  ])('%s → %s', (text, expected) => {
    expect(looksLikeMarkdown(text)).toBe(expected);
  });

  it.each([
    ['obyčejná věta'],
    ['- jediná odrážka, spíš pomlčka ve větě'],
    ['cena je 5 * 3 korun'],
    ['snake_case_jmeno v textu'],
  ])('%s se za Markdown nepovažuje', (text) => {
    // Jeden řádek s pomlčkou je běžná věta. Kdyby se převáděl, vloží uživatel
    // svůj text a dostane seznam, o který nežádal.
    expect(looksLikeMarkdown(text)).toBe(false);
  });
});

describe('převod Markdownu', () => {
  it('nadpisy podle počtu křížků', () => {
    expect(markdownToHtml('# Prvni\n## Druhy')).toBe('<h1>Prvni</h1><h2>Druhy</h2>');
  });

  it('tučné a kurzíva', () => {
    expect(markdownToHtml('**tučně** a *kurzíva*'))
      .toBe('<p><strong>tučně</strong> a <em>kurzíva</em></p>');
  });

  it('odkaz', () => {
    expect(markdownToHtml('[web](https://example.com)'))
      .toBe('<p><a href="https://example.com">web</a></p>');
  });

  it('odkaz s nebezpečným schématem se zahodí, text zůstane', () => {
    expect(markdownToHtml('[klik](javascript:alert)')).toBe('<p>klik</p>');
    expect(markdownToHtml('[klik](vbscript:x)')).toBe('<p>klik</p>');
  });

  it('relativní adresa projde', () => {
    expect(markdownToHtml('[sem](/interni/stranka)'))
      .toBe('<p><a href="/interni/stranka">sem</a></p>');
  });

  it('závorky uvnitř adresy neumí — vědomé omezení podmnožiny', () => {
    // Plné vyvažování závorek by znamenalo pořádný parser. Text se neztratí,
    // jen se odkaz nevytvoří tak, jak by šlo.
    expect(markdownToHtml('[klik](https://example.com/a(b))')).toContain('klik');
  });

  it('odrážkový seznam', () => {
    expect(markdownToHtml('- a\n- b')).toBe('<ul><li>a</li><li>b</li></ul>');
  });

  it('číslovaný seznam', () => {
    expect(markdownToHtml('1. a\n2. b')).toBe('<ol><li>a</li><li>b</li></ol>');
  });

  it('blok kódu se neinterpretuje', () => {
    expect(markdownToHtml('```\n**ne tučně**\n```'))
      .toBe('<pre><code>**ne tučně**</code></pre>');
  });

  it('inline kód se neinterpretuje', () => {
    expect(markdownToHtml('napiš `**takhle**`'))
      .toBe('<p>napiš <code>**takhle**</code></p>');
  });

  it('citace', () => {
    expect(markdownToHtml('> citovano')).toBe('<blockquote><p>citovano</p></blockquote>');
  });

  it('oddělovač', () => {
    expect(markdownToHtml('---')).toBe('<hr>');
  });

  it('HTML ve vstupu se neprovede', () => {
    expect(markdownToHtml('<script>zlo()</script>'))
      .toBe('<p>&lt;script&gt;zlo()&lt;/script&gt;</p>');
  });

  it('odstavce dělí prázdný řádek, ne každé zalomení', () => {
    expect(markdownToHtml('prvni\nradek\n\ndruhy'))
      .toBe('<p>prvni radek</p><p>druhy</p>');
  });
});

describe('čistý text', () => {
  it('prázdný řádek dělí odstavce', () => {
    expect(plainTextToHtml('a\n\nb')).toBe('<p>a</p><p>b</p>');
  });

  it('jednoduché zalomení je <br>', () => {
    expect(plainTextToHtml('a\nb')).toBe('<p>a<br>b</p>');
  });

  it('znaky HTML se ošetří', () => {
    expect(plainTextToHtml('5 < 6 & 7 > 3')).toBe('<p>5 &lt; 6 &amp; 7 &gt; 3</p>');
  });

  it('prázdný vstup nedá nic', () => {
    expect(plainTextToHtml('   \n\n  ')).toBe('');
  });
});
