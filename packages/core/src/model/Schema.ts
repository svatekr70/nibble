import type { SchemaMode, SchemaViolation } from '../types.js';

/**
 * Co smí být v obsahu.
 *
 * Dva režimy schválně. 'legacy' propustí skoro všechno, protože stará data
 * obsahují věci, které dnes nikdo psát nechce, ale mazat je při načtení by
 * znamenalo tichou ztrátu. 'strict' je to, co má vznikat nově.
 *
 * Přechod mezi nimi se dělá vědomě: `audit()` řekne, co by přísný režim
 * ovlivnil, aniž by na obsah sáhl.
 */

const STRICT_TAGS = new Set([
  'p', 'br', 'strong', 'em', 'u', 's', 'a', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'hr',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col',
  'img', 'span', 'div', 'sub', 'sup', 'figure', 'figcaption',
]);

/** Značky, které v moderním obsahu nemají co dělat, ale ve starém jsou. */
const LEGACY_TAGS = new Set(['font', 'center', 'big', 'strike', 'tt', 'b', 'i']);

const STRICT_ATTRS = new Set([
  'href', 'src', 'alt', 'title', 'target', 'rel', 'class', 'id', 'style',
  'colspan', 'rowspan', 'span', 'width', 'height', 'start', 'type', 'dir',
]);

export class Schema {
  readonly mode: SchemaMode;
  private readonly extraTags = new Set<string>();
  private readonly extraAttrs = new Set<string>();

  constructor(mode: SchemaMode = 'legacy') {
    this.mode = mode;
  }

  allow(tag: string, attrs: readonly string[] = []): this {
    this.extraTags.add(tag.toLowerCase());
    for (const a of attrs) this.extraAttrs.add(a.toLowerCase());
    return this;
  }

  allowsTag(tag: string): boolean {
    const t = tag.toLowerCase();
    if (this.extraTags.has(t)) return true;
    if (this.mode === 'legacy') return true;
    return STRICT_TAGS.has(t);
  }

  allowsAttr(name: string): boolean {
    const n = name.toLowerCase();
    if (this.extraAttrs.has(n)) return true;
    if (n.startsWith('data-') || n.startsWith('aria-')) return true;
    if (this.mode === 'legacy') return true;
    return STRICT_ATTRS.has(n);
  }

  /**
   * Co by přísný režim na tomhle obsahu změnil — bez toho, aby to udělal.
   * Určeno na dávkové projetí databáze před přepnutím režimu.
   */
  audit(root: Element): SchemaViolation[] {
    const out: SchemaViolation[] = [];

    for (const el of Array.from(root.querySelectorAll('*'))) {
      const tag = el.tagName.toLowerCase();

      if (!STRICT_TAGS.has(tag)) {
        out.push({
          node: tag,
          reason: LEGACY_TAGS.has(tag) ? 'zastaralá značka' : 'značka mimo přísné schema',
        });
      }

      for (const attr of Array.from(el.attributes)) {
        const n = attr.name.toLowerCase();

        if (n === 'contenteditable') {
          out.push({ node: tag + '@contenteditable', reason: 'zbytek po editoru' });
          continue;
        }

        if (n.startsWith('data-') || n.startsWith('aria-')) continue;
        if (!STRICT_ATTRS.has(n)) {
          out.push({ node: tag + '@' + n, reason: 'atribut mimo přísné schema' });
        }
      }
    }

    return out;
  }
}
