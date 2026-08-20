import { describe, expect, it } from 'vitest';
import { parseWindow } from './dom.js';
import { cleanPastedHtml, PASTE_ALLOWED_TAGS } from '../src/input/Paste.js';
import { cleanPastedContent, detectSource, extractFragment } from '../src/model/clean.js';
import { collectStyleRules, inlineStyleRules } from '../src/model/pasteCss.js';

/**
 * Vzorky odpovídají tvarem tomu, co opravdu přijde ze schránky — zkráceno,
 * ale nic přepsáno. Google Sheets posílá formátování ke každé buňce a v bloku
 * stylů má jen náhradní šedý rámeček; Excel posílá `class=xl78` a pravidla
 * v bloku stylů. Právě tenhle rozdíl rozhoduje o všem ostatním.
 */

const SHEETS = "<meta charset='utf-8'><google-sheets-html-origin>"
  + '<style type="text/css"><!--td {border: 1px solid #cccccc;}'
  + 'br {mso-data-placement:same-cell;}--></style>'
  + '<table xmlns="http://www.w3.org/1999/xhtml" cellspacing="0" cellpadding="0" dir="ltr"'
  + ' border="1" style="table-layout:fixed;font-size:10pt;font-family:Arial;width:0px;'
  + 'border-collapse:collapse;border:none" data-sheets-root="1">'
  + '<colgroup><col width="300"/><col width="33"/></colgroup><tbody>'
  + '<tr style="height:45px;"><td style="border-top:1px solid #000000;'
  + 'border-right:1px solid #000000;border-bottom:1px solid #000000;'
  + 'border-left:1px solid #000000;overflow:hidden;padding:0px 3px 0px 3px;'
  + 'vertical-align:bottom;background-color:#1f497d;font-family:Calibri;font-size:20pt;'
  + 'font-weight:bold;wrap-strategy:4;white-space:normal;word-wrap:break-word;'
  + 'color:#ffffff;text-align:center;">Nadpis</td>'
  + '<td style="border-right:1px solid #000000;border-bottom:1px solid #000000;'
  + 'overflow:hidden;padding:0px 3px 0px 3px;vertical-align:bottom;'
  + 'font-family:Calibri;font-size:10pt;">1</td></tr></tbody></table>';

const EXCEL = '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head>'
  + '<meta name=ProgId content=Excel.Sheet><style><!--table\n\t{mso-displayed-decimal-separator:"\\,";}\n'
  + '@page\n\t{margin:.75in;}\ntd\n\t{padding-top:1px;\n\tmso-ignore:padding;\n\tcolor:#595959;\n'
  + '\tfont-size:9.0pt;\n\tfont-weight:400;\n\tfont-family:Calibri, sans-serif;\n'
  + '\ttext-align:general;\n\tvertical-align:bottom;\n\tborder:none;\n\twhite-space:nowrap;}\n'
  + '.xl73\n\t{color:#486725;\n\tfont-size:18.0pt;\n\tbackground:#8FC356;\n\tmso-pattern:black none;}\n'
  + '--></style></head><body><table border=0 cellpadding=0 cellspacing=0 width=706'
  + " style='border-collapse:\n collapse;width:529pt'>\n<!--StartFragment-->\n"
  + " <col width=76 style='mso-width-source:userset;width:57pt'>\n"
  + " <tr height=29 style='mso-height-source:userset;height:22.5pt'>\n"
  + "  <td class=xl73 colspan=2 style='mso-ignore:colspan'>NADPIS</td>\n"
  + '  <td></td>\n </tr>\n<!--EndFragment-->\n</table></body></html>';

function clean(html: string) {
  const { document } = parseWindow();
  return cleanPastedHtml(html, document);
}

describe('rozpoznání tabulkového procesoru', () => {
  it('Sheets se nesmí splést s Wordem', () => {
    // V bloku stylů má `br {mso-data-placement:same-cell;}` — samotné `mso-`
    // by ho poslalo do větve pro Word i s přestavbou seznamů.
    expect(detectSource(SHEETS)).toBe('google-sheets');
  });

  it('Excel podle jmenného prostoru v hlavičce', () => {
    expect(detectSource(EXCEL)).toBe('excel');
  });

  it('Word zůstává Wordem', () => {
    expect(detectSource('<p class="MsoNormal">t</p>')).toBe('word');
  });
});

describe('výřez fragmentu uvnitř tabulky', () => {
  it('Excel značkuje fragment až za <table> — bere se celé tělo', () => {
    // Prohlížeč `<tr>` bez tabulky zahodí, takže dodržení značky by znamenalo
    // vložit místo tabulky holý text.
    expect(extractFragment(EXCEL)).toContain('<table');
  });

  it('běžný fragment se drží značek', () => {
    expect(extractFragment('<body>a<!--StartFragment--><p>b</p><!--EndFragment-->c</body>'))
      .toBe('<p>b</p>');
  });
});

describe('nosníky tabulky', () => {
  it('colgroup a col přežijí, i když nemají text', () => {
    const out = clean(SHEETS).html;
    expect(out).toContain('<colgroup>');
    expect(out).toContain('width="300"');
  });

  it('prázdný řádek nepřijde o svůj <tr>', () => {
    const { document } = parseWindow();
    const box = document.createElement('div');
    box.innerHTML = '<table><tbody><tr><td>a</td></tr><tr><td></td></tr></tbody></table>';
    cleanPastedContent(box, document, { allowedTags: PASTE_ALLOWED_TAGS });
    expect(box.querySelectorAll('tr')).toHaveLength(2);
    expect(box.querySelector('tbody > td')).toBeNull();
  });
});

describe('pravidla z bloku stylů', () => {
  it('třída z Excelu se zapíše do buňky a sama zmizí', () => {
    const out = clean(EXCEL).html;
    expect(out).toContain('color: #486725');
    expect(out).toContain('background-color: #8FC356');
    expect(out).not.toContain('xl73');
  });

  it('vlastní zápis prvku přebíjí pravidlo', () => {
    const { document } = parseWindow();
    const box = document.createElement('div');
    box.innerHTML = '<p class="a" style="color:red">t</p>';
    inlineStyleRules(box, collectStyleRules('<style>.a {color: blue; font-weight: bold}</style>'));
    // Hodnota se přepíše, ale pořadí zůstává po pravidle — na tom závisí
    // souhra zkratky a jednotlivých stran (`border` vs. `border-top`).
    expect(box.querySelector('p')!.getAttribute('style')).toBe('color: red; font-weight: bold;');
  });

  it('mso- vlastnosti a @page se neberou', () => {
    const rules = collectStyleRules(EXCEL);
    expect(rules.some((r) => r.selector.startsWith('@'))).toBe(false);
    expect(rules.flatMap((r) => r.declarations).some(([n]) => n.startsWith('mso-'))).toBe(false);
  });

  it('u Sheets se blok stylů přeskočí celý', () => {
    // Je v něm `td {border: 1px solid #cccccc}` jako náhrada pro aplikace bez
    // inline stylů. Kdyby se vlil dovnitř, dostal by mřížku i sešit bez ní.
    expect(clean(SHEETS).html).not.toContain('#cccccc');
  });
});

describe('úklid tabulky', () => {
  it('shodný rámeček ze všech buněk se napíše jednou', () => {
    const out = clean(SHEETS).html;
    expect(out).toContain('border: 1px solid #000000;');
    expect(out).not.toContain('border-top');
    expect(out).toContain('border-collapse: collapse');
  });

  it('rámeček se neslučuje, když ho některá buňka nemá', () => {
    // Excel kreslí rámeček jen kolem některých oblastí. Sloučení by přidalo
    // čáry, které v sešitu nejsou.
    const { document } = parseWindow();
    const box = document.createElement('div');
    box.innerHTML = '<table><tr><td style="border-bottom:1px solid #000">a</td>'
      + '<td>b</td></tr></table>';
    cleanPastedContent(box, document, { allowedTags: PASTE_ALLOWED_TAGS, source: 'excel' });
    expect(box.querySelectorAll('td')[1]!.getAttribute('style')).toBeNull();
  });

  it('velikost písma se přepočte na poměr k základu sešitu', () => {
    // 20pt v sešitu s desetibodovým základem znamená „dvakrát větší", ne
    // „dvacet bodů" — na stránce s jiným písmem platí to první.
    expect(clean(SHEETS).html).toContain('font-size: 2em');
  });

  it('velikost shodná se základem sešitu se nezapisuje', () => {
    expect(clean(SHEETS).html).not.toContain('font-size: 1em');
  });

  it('rodina písma ze sešitu se nepřebírá', () => {
    const out = clean(SHEETS).html;
    expect(out).not.toContain('Calibri');
    expect(out).not.toContain('Arial');
  });

  it('width:0px na tabulce je značka Sheets, ne šířka', () => {
    expect(clean(SHEETS).html).not.toContain('width: 0');
  });

  it('odsazení buňky se zkrátí, ale nemění', () => {
    expect(clean(SHEETS).html).toContain('padding: 0 3px;');
  });

  it('vertical-align: bottom na všech buňkách je výchozí stav sešitu', () => {
    expect(clean(SHEETS).html).not.toContain('vertical-align');
  });

  it('vertical-align zůstane, jakmile se buňky liší', () => {
    const { document } = parseWindow();
    const box = document.createElement('div');
    box.innerHTML = '<table><tr><td style="vertical-align:bottom">a</td>'
      + '<td style="vertical-align:top">b</td></tr></table>';
    cleanPastedContent(box, document, { allowedTags: PASTE_ALLOWED_TAGS, source: 'excel' });
    expect(box.innerHTML).toContain('vertical-align: bottom');
  });

  it('sloučené buňky se nechávají být', () => {
    expect(clean(EXCEL).html).toContain('colspan="2"');
  });
});

describe('hodnoty, které CSS nezná', () => {
  it('background z Excelu je background-color', () => {
    expect(clean(EXCEL).html).toContain('background-color: #8FC356');
  });

  it('text-align: general se zahodí', () => {
    expect(clean(EXCEL).html).not.toContain('general');
  });

  it('border: none se nevypisuje ke každé buňce', () => {
    expect(clean(EXCEL).html).not.toContain('border: none');
  });

  it('prázdné keepStyles zahodí styly i v tabulce', () => {
    const { document } = parseWindow();
    const box = document.createElement('div');
    box.innerHTML = '<table><tr><td style="border:1px solid #000;width:10px">a</td></tr></table>';
    cleanPastedContent(box, document, { allowedTags: PASTE_ALLOWED_TAGS, keepStyles: [] });
    expect(box.innerHTML).not.toContain('style');
  });
});
