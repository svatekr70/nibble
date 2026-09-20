import { describe, expect, it } from 'vitest';
import { textTableToHtml } from '../src/model/textTable.js';
import { textToHtml } from '../src/input/Paste.js';

describe('text s tabulátory na tabulku', () => {
  it('dva řádky o dvou sloupcích', () => {
    expect(textTableToHtml('a\tb\nc\td'))
      .toBe('<table><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>');
  });

  it('záhlaví se nedělá — je to dohad o významu', () => {
    // První řádek bývá popisek sloupců, ale ne vždycky. Označit ho umí lišta;
    // uhodnout ho špatně už uživatel neopraví, protože si toho nevšimne.
    const html = textTableToHtml('Kód\tKs\nX-1\t50')!;
    expect(html).not.toContain('<th');
    expect(html).not.toContain('<thead');
  });

  it('prázdná buňka dostane <br>, aby do ní šlo kliknout', () => {
    expect(textTableToHtml('a\t\nc\td'))
      .toContain('<td><br></td>');
  });

  it('okolní bílé místo v buňce se odřízne', () => {
    expect(textTableToHtml('  a  \t b \nc\td')).toContain('<td>a</td>');
  });

  it('prázdné řádky na krajích výběru nevadí', () => {
    expect(textTableToHtml('\na\tb\nc\td\n\n'))
      .toBe(textTableToHtml('a\tb\nc\td'));
  });

  it('CRLF se srovná jako všude jinde', () => {
    expect(textTableToHtml('a\tb\r\nc\td')).toBe(textTableToHtml('a\tb\nc\td'));
  });

  it('ostré znaky se escapují', () => {
    expect(textTableToHtml('<b>\t&\nx\ty'))
      .toContain('<td>&lt;b&gt;</td><td>&amp;</td>');
  });
});

describe('co se za tabulku nepovažuje', () => {
  it.each([
    ['jeden řádek', 'a\tb'],
    ['žádný tabulátor', 'prostě věta\ndruhá věta'],
    ['rozdílný počet buněk', 'a\tb\nc\td\te'],
    ['jediný sloupec', 'a\nb'],
    ['prázdný řádek uprostřed', 'a\tb\n\nc\td'],
    ['prázdný vstup', ''],
  ])('%s', (_popis, text) => {
    expect(textTableToHtml(text)).toBeNull();
  });

  it('odsazený blok textu zůstane textem', () => {
    // Tabulátory tu jen odsazují a řádky se v počtu buněk neshodnou. Kdyby se
    // z toho stala tabulka, dostane uživatel mřížku, o kterou nežádal.
    expect(textTableToHtml('Pozor:\n\tprvní poznámka\n\tdruhá\ta ještě')).toBeNull();
  });
});

describe('napojení na vkládání čistého textu', () => {
  it('mřížka má přednost před Markdownem', () => {
    // Buňka smí začínat pomlčkou. Markdown by z takového sloupce udělal
    // seznam, protože vidí dva řádky s odrážkou.
    expect(textToHtml('- a\tx\n- b\ty')).toContain('<table>');
  });

  it('text bez mřížky jde dál beze změny chování', () => {
    expect(textToHtml('# Nadpis')).toBe('<h1>Nadpis</h1>');
    expect(textToHtml('obyčejná věta')).toBe('<p>obyčejná věta</p>');
  });

  it('vypnutý Markdown tabulku neovlivní', () => {
    expect(textToHtml('a\tb\nc\td', { markdown: false })).toContain('<table>');
  });
});
