import { describe, expect, it } from 'vitest';
import { parseWindow } from './dom.js';
import { cleanPastedContent, detectSource, extractFragment } from '../src/model/clean.js';
import { PASTE_ALLOWED_TAGS } from '../src/input/Paste.js';

/**
 * Vzorky odpovídají tomu, co je v cílovém projektu opravdu vidět: Google Docs
 * (`dir="ltr"` 12 617×), Quill (`class="ql-*"` 1 119×) a ProseMirror nebo
 * ChatGPT (`data-start` 1 022×). Word se v uloženém obsahu nevyskytuje ani
 * jednou, ale do schránky se dostane, tak se řeší taky.
 */
function clean(html: string, options = {}) {
  const { document } = parseWindow();
  const box = document.createElement('div');
  box.innerHTML = html;
  const result = cleanPastedContent(box, document, {
    allowedTags: PASTE_ALLOWED_TAGS, ...options,
  });
  return { html: box.innerHTML, ...result };
}

describe('rozpoznání zdroje', () => {
  it.each([
    ['<p class="MsoNormal">t</p>', 'word'],
    ['<span style="mso-list:l0">t</span>', 'word'],
    ['<b id="docs-internal-guid-abc">t</b>', 'google-docs'],
    ['<li data-list="bullet">t</li>', 'quill'],
    ['<p data-start="1">t</p>', 'prosemirror'],
    ['<p>obyčejné</p>', 'html'],
  ])('%s → %s', (html, expected) => {
    expect(detectSource(html)).toBe(expected);
  });
});

describe('vybalení fragmentu', () => {
  it('vezme jen část mezi značkami fragmentu', () => {
    expect(extractFragment('<html><head><style>x</style></head><body>'
      + '<!--StartFragment--><p>obsah</p><!--EndFragment--></body></html>'))
      .toBe('<p>obsah</p>');
  });

  it('bez značek vezme tělo dokumentu', () => {
    expect(extractFragment('<html><head><meta></head><body><p>obsah</p></body></html>'))
      .toBe('<p>obsah</p>');
  });

  it('holý fragment nechá být', () => {
    expect(extractFragment('<p>obsah</p>')).toBe('<p>obsah</p>');
  });
});

describe('Google Docs', () => {
  it('dir="ltr" zmizí, protože je to výchozí hodnota', () => {
    expect(clean('<p dir="ltr">text</p>').html).toBe('<p>text</p>');
  });

  it('dir="rtl" zůstane, protože něco znamená', () => {
    expect(clean('<p dir="rtl">text</p>').html).toBe('<p dir="rtl">text</p>');
  });

  it('obalové id se zahodí', () => {
    expect(clean('<b id="docs-internal-guid-1a2b" style="font-weight:normal">t</b>').html)
      .toBe('<b>t</b>');
  });

  it('role na odstavci zmizí', () => {
    expect(clean('<p role="presentation">text</p>').html).toBe('<p>text</p>');
  });

  it('typický blok se zjednoduší na to podstatné', () => {
    const out = clean(
      '<li dir="ltr" aria-level="1"><p dir="ltr" role="presentation">'
      + '<span style="font-size:11pt;font-family:Arial;color:#000000">položka</span></p></li>',
    ).html;
    // Ze čtyř atributů a tří obalů zbude holá struktura. Barva #000000 padá
    // spolu s nimi: Google Docs ji dává všemu, není to volba autora.
    expect(out).toBe('<li><p>položka</p></li>');
  });
});

describe('Quill', () => {
  it('třídy ql-* a data-list zmizí', () => {
    expect(clean('<li data-list="bullet"><span class="ql-ui"></span>text</li>').html)
      .toBe('<li>text</li>');
  });

  it('span bez atributů se rozbalí', () => {
    expect(clean('<p><span>text</span></p>').html).toBe('<p>text</p>');
  });

  it('contenteditable z obsahu zmizí', () => {
    expect(clean('<span contenteditable="false">x</span>text').html).toBe('xtext');
  });
});

describe('ProseMirror a ChatGPT', () => {
  it('data-pm-* a data-start/end zmizí', () => {
    expect(clean('<p data-start="0" data-end="9" data-pm-slice="1 1 []">text</p>').html)
      .toBe('<p>text</p>');
  });
});

describe('Word', () => {
  it('hlavičkové značky se zahodí', () => {
    expect(clean('<meta charset="utf-8"><style>p{color:red}</style><p>text</p>').html)
      .toBe('<p>text</p>');
  });

  it('<o:p> se rozbalí', () => {
    expect(clean('<p>text<o:p></o:p></p>').html).toBe('<p>text</p>');
  });

  it('odstavce s odrážkou se poskládají do seznamu', () => {
    const out = clean(
      '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">· prvni</p>'
      + '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">· druhy</p>',
    ).html;
    expect(out).toBe('<ul><li>prvni</li><li>druhy</li></ul>');
  });

  it('číslované odstavce dají číslovaný seznam', () => {
    const out = clean(
      '<p style="mso-list:l0">1. prvni</p><p style="mso-list:l0">2. druhy</p>',
    ).html;
    expect(out).toBe('<ol><li>prvni</li><li>druhy</li></ol>');
  });

  it('windowtext a font-weight:normal nejsou záměr autora', () => {
    expect(clean('<p style="color:windowtext;font-weight:normal">t</p>').html).toBe('<p>t</p>');
  });
});

/**
 * Druh číslování z Wordu.
 *
 * Word posílá seznamy jako odstavce se značkou v textu a rozliší je jen
 * `mso-list`. Kdo psal římskými číslicemi, chtěl římské číslice — bez
 * rozpoznání druhu se ze všeho staly odrážky a značka zůstala v textu.
 */
describe('Word: druh číslování seznamu', () => {
  /** Odstavec tak, jak ho Word posílá: značka ve `<span style="mso-list:Ignore">`. */
  const item = (marker: string, text: string) =>
    '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">'
    + `<span style="mso-list:Ignore">${marker}<span style="font:7.0pt">&nbsp;&nbsp; </span></span>`
    + `${text}</p>`;

  it.each([
    ['římské malé', ['i.', 'ii.', 'iii.'], 'i', 'lower-roman'],
    ['římské velké', ['I.', 'II.'], 'I', 'upper-roman'],
    ['písmena malá', ['a.', 'b.'], 'a', 'lower-alpha'],
    ['písmena velká', ['A)', 'B)'], 'A', 'upper-alpha'],
  ])('%s', (_name, markers, type, style) => {
    const { html } = clean(markers.map((m, i) => item(m, 'Polozka' + i)).join(''));

    expect(html).toContain(`type="${type}"`);
    expect(html).toContain(`list-style-type: ${style}`);
    // Značka je vzhled, ne text — v položce nemá co dělat.
    expect(html).not.toMatch(/<li>\s*[ivxIVXab]+[.)]/);
  });

  it('arabské číslování zůstane bez atributu — je výchozí', () => {
    const { html } = clean(item('1.', 'Prvni') + item('2.', 'Druhy'));

    expect(html).toBe('<ol><li>Prvni</li><li>Druhy</li></ol>');
  });

  it('odrážky dají <ul> a značka zmizí', () => {
    const { html } = clean(item('·', 'Prvni') + item('·', 'Druhy'));

    expect(html).toBe('<ul><li>Prvni</li><li>Druhy</li></ul>');
  });

  it('řada, která nejde po sobě, se za seznam nepovažuje', () => {
    // „i, j, k" jsou písmena, ne římské číslice — a jako písmena po sobě nejdou.
    const { html } = clean(item('i.', 'A') + item('j.', 'B') + item('q.', 'C'));

    expect(html).not.toContain('<ol');
  });

  it('řada písmen po sobě je seznam', () => {
    const { html } = clean(item('i.', 'A') + item('j.', 'B'));

    expect(html).toContain('type="a"');
  });

  it('značka rozdělená mezi uzly se sundá celá', () => {
    // Word dá „i." do jednoho uzlu a mezery za ní do vnořeného `<span>`.
    const { html } = clean(item('i.', 'Text') + item('ii.', 'Dalsi'));

    expect(html).toContain('<li>Text</li>');
    expect(html).toContain('<li>Dalsi</li>');
  });

  it('věta začínající římskou číslicí zůstane větou', () => {
    // Bez `mso-list` nemá Nibble důvod myslet si, že jde o seznam.
    const source = '<p class="MsoNormal">I. svetova valka</p>'
      + '<p class="MsoNormal">II. svetova valka</p>';
    const { html } = clean(source);

    expect(html).not.toContain('<ol');
    expect(html).toContain('I. svetova valka');
  });
});

describe('druh značky ze skutečného seznamu', () => {
  it('list-style-type na <ol> se zachová', () => {
    const { html } = clean('<ol style="list-style-type: lower-roman"><li>a</li></ol>');
    expect(html).toContain('list-style-type: lower-roman');
  });

  it('list-style-position taky', () => {
    const { html } = clean('<ul style="list-style-position: inside"><li>a</li></ul>');
    expect(html).toContain('list-style-position: inside');
  });

  it('atribut type a start projdou', () => {
    const { html } = clean('<ol type="I" start="5"><li>a</li></ol>');
    expect(html).toContain('type="I"');
    expect(html).toContain('start="5"');
  });

  it('na odstavci se list-style-type nepouští — tam nic neznamená', () => {
    const { html } = clean('<p style="list-style-type: lower-roman">text</p>');
    expect(html).not.toContain('list-style-type');
  });

  it('prázdný seznam povolených stylů zahodí i druh značky', () => {
    const { html } = clean('<ol style="list-style-type: lower-roman"><li>a</li></ol>',
      { keepStyles: [] });
    expect(html).not.toContain('list-style-type');
  });
});

describe('styly', () => {
  it('barva a zarovnání zůstávají', () => {
    expect(clean('<p style="color: rgb(255, 0, 0); text-align: center;">t</p>').html)
      .toBe('<p style="color: rgb(255, 0, 0); text-align: center;">t</p>');
  });

  it('černá z Google Docs zmizí, aby nerozbila tmavý motiv', () => {
    expect(clean('<p style="color: #000000;">t</p>').html).toBe('<p>t</p>');
  });

  it('průhledné pozadí zmizí', () => {
    expect(clean('<p style="background-color: transparent;">t</p>').html).toBe('<p>t</p>');
  });

  it('font-family, font-size a margin zmizí', () => {
    // Nesou vzhled zdrojového dokumentu, ne úmysl autora.
    expect(clean('<p style="font-family: Calibri; font-size: 11pt; margin: 0cm;">t</p>').html)
      .toBe('<p>t</p>');
  });

  it('prázdné keepStyles zahodí styly úplně', () => {
    expect(clean('<p style="color: red;">t</p>', { keepStyles: [] }).html).toBe('<p>t</p>');
  });
});

describe('bezpečnost a schema', () => {
  it('skript se zahodí', () => {
    const out = clean('<p>text</p><script>zlo()</script>');
    expect(out.html).toBe('<p>text</p>');
    expect(out.removed.length).toBeGreaterThan(0);
  });

  it('on* atribut se zahodí, text zůstane', () => {
    expect(clean('<p onclick="zlo()">text</p>').html).toBe('<p>text</p>');
  });

  it('javascript: v odkazu se zahodí, odkaz zůstane', () => {
    expect(clean('<a href="javascript:zlo()">text</a>').html).toBe('<a>text</a>');
  });

  it('<iframe> se zahodí', () => {
    expect(clean('<p>a</p><iframe src="https://zlo.example"></iframe>').html).toBe('<p>a</p>');
  });

  it('značka mimo schema se rozbalí a text zůstane', () => {
    expect(clean('<p>a <marquee>b</marquee> c</p>').html).toBe('<p>a b c</p>');
  });

  it('<font> se rozbalí', () => {
    expect(clean('<p><font color="red" size="7">text</font></p>').html).toBe('<p>text</p>');
  });
});

describe('úklid', () => {
  it('prázdný obal po vyčištění zmizí', () => {
    expect(clean('<p>text<span style="mso-x:1"></span></p>').html).toBe('<p>text</p>');
  });

  it('prázdný odstavec zůstane — drží odsazení', () => {
    expect(clean('<p>a</p><p></p><p>b</p>').html).toBe('<p>a</p><p></p><p>b</p>');
  });

  it('obrázek v prázdném obalu obal zachrání', () => {
    expect(clean('<div><img src="/a.png"></div>').html).toBe('<div><img src="/a.png"></div>');
  });
});
