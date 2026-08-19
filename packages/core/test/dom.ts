import { parseHTML } from 'linkedom';

/**
 * DOM pro testy modelu. linkedom je skutečný parser HTML, ne regulární výrazy,
 * takže se chová jako prohlížeč tam, kde na tom záleží.
 *
 * Selection, beforeinput a undo se takhle testovat nedají — ty patří do
 * Playwrightu v reálném prohlížeči a přijdou ve fázi F1.
 */
export function parseWindow(): { document: Document } {
  const { document } = parseHTML('<!doctype html><html><body></body></html>');
  return { document: document as unknown as Document };
}
