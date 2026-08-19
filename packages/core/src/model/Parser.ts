import { splitTopLevel } from '../dom/tokenizer.js';
import { sanitize, type SanitizeOptions } from './Sanitizer.js';
import { representation, type Region } from './Regions.js';

/**
 * Jediná změna, kterou Nibble na obsahu dělá vždycky: CRLF na LF.
 *
 * Není to volba, je to srovnání s realitou. Parser HTML podle specifikace mění
 * CRLF na LF už při čtení vstupu, takže `\r` v DOMu nikdy neskončí — a stejně
 * tak ho zahodí `textarea.value`, kudy obsah do editoru běžně přichází.
 * Kdybychom si `\r` drželi ve zdrojových řetězcích, choval by se editor pokaždé
 * jinak podle toho, jak se obsah na stránku dostal.
 *
 * V cílovém projektu se to týká zhruba 1 100 dokumentů (skoro celá tabulka `events`
 * a většina `akademie_lessons`). Jde o jeden bajt na řádek bez vlivu na
 * zobrazení, ale první uložení takového dokumentu ho o ty bajty zkrátí.
 */
export function normalizeNewlines(html: string): string {
  return html.replace(/\r\n?/g, '\n');
}

export interface ParseResult {
  regions: Region[];
  /** Co odstranila bezpečnostní vrstva. Prázdné pole je běžný stav. */
  removed: string[];
  /**
   * Podařilo se namapovat kusy zdroje na uzly po jednom? Když ne, je celý
   * dokument jedna oblast — pořád se uloží beze změny, pokud se nic neupraví,
   * ale první úprava přepíše formátování celého dokumentu, ne jen bloku.
   */
  perBlockMapping: boolean;
}

function fill(doc: Document, html: string): Element {
  const box = doc.createElement('div');
  box.innerHTML = html;
  return box;
}

export function parseInto(
  root: HTMLElement, source: string, doc: Document, options: SanitizeOptions = {},
): ParseResult {
  const html = normalizeNewlines(source);
  while (root.firstChild) root.removeChild(root.firstChild);

  const chunks = splitTopLevel(html);
  const regions: Region[] = [];

  for (const chunk of chunks) {
    const box = fill(doc, chunk);
    const nodes = Array.from(box.childNodes);
    for (const n of nodes) root.appendChild(n);
    regions.push({ source: chunk, nodes, snapshot: '', poisoned: false });
  }

  // Kontrola: dal by prohlížeč stejný výsledek, kdyby dostal celý vstup naráz?
  // Implicitní zavírání značek (<p>a<p>b) může uzly přeskládat jinak, než jak
  // vyšly po kusech. Když se to rozejde, vyhrává parsování celku.
  const reference = fill(doc, html);
  let perBlockMapping = true;

  if (reference.innerHTML !== root.innerHTML) {
    perBlockMapping = false;
    while (root.firstChild) root.removeChild(root.firstChild);
    root.innerHTML = html;
    regions.length = 0;
    regions.push({
      source: html,
      nodes: Array.from(root.childNodes),
      snapshot: '',
      poisoned: false,
    });
  }

  const before = regions.map((r) => representation(r.nodes));
  const { removed } = sanitize(root, options);

  regions.forEach((region, i) => {
    // Uzly, které sanitizace odstranila, už v dokumentu nejsou.
    region.nodes = region.nodes.filter((n) => n.parentNode === root);
    region.snapshot = representation(region.nodes);
    if (region.snapshot !== before[i]) region.poisoned = true;
  });

  return { regions, removed, perBlockMapping };
}
