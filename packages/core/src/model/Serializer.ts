import { namedEntity } from './entities.js';
import { VOID_ELEMENTS } from '../dom/tokenizer.js';
import type { EntityEncoding } from '../types.js';

export interface SerializeOptions {
  entityEncoding: Exclude<EntityEncoding, 'auto'>;
}

const NODE_ELEMENT = 1;
const NODE_TEXT = 3;
const NODE_COMMENT = 8;

function encodeText(text: string, opts: SerializeOptions): string {
  let out = '';
  for (const ch of text) {
    if (ch === '&') { out += '&amp;'; continue; }
    if (ch === '<') { out += '&lt;'; continue; }
    if (ch === '>') { out += '&gt;'; continue; }
    if (ch === ' ') { out += '&nbsp;'; continue; }

    if (opts.entityEncoding === 'named') {
      const name = namedEntity(ch);
      if (name) { out += '&' + name + ';'; continue; }
    }
    out += ch;
  }
  return out;
}

function encodeAttr(value: string, opts: SerializeOptions): string {
  let out = '';
  for (const ch of value) {
    if (ch === '&') { out += '&amp;'; continue; }
    if (ch === '"') { out += '&quot;'; continue; }
    if (ch === '<') { out += '&lt;'; continue; }
    if (ch === ' ') { out += '&nbsp;'; continue; }

    if (opts.entityEncoding === 'named') {
      const name = namedEntity(ch);
      if (name) { out += '&' + name + ';'; continue; }
    }
    out += ch;
  }
  return out;
}

/** Vyrobí HTML z uzlu. Používá se jen pro to, co uživatel opravdu změnil. */
export function serializeNode(node: Node, opts: SerializeOptions): string {
  if (node.nodeType === NODE_TEXT) {
    return encodeText(node.nodeValue ?? '', opts);
  }

  if (node.nodeType === NODE_COMMENT) {
    return '<!--' + (node.nodeValue ?? '') + '-->';
  }

  if (node.nodeType !== NODE_ELEMENT) return '';

  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  let out = '<' + tag;
  for (const attr of Array.from(el.attributes)) {
    out += ' ' + attr.name.toLowerCase();
    // Prázdný atribut se vypisuje i s ="" — je to platné a předvídatelné.
    out += '="' + encodeAttr(attr.value, opts) + '"';
  }
  out += '>';

  if (VOID_ELEMENTS.has(tag)) return out;

  for (const child of Array.from(el.childNodes)) {
    out += serializeNode(child, opts);
  }

  return out + '</' + tag + '>';
}

export function serializeChildren(parent: Node, opts: SerializeOptions): string {
  let out = '';
  for (const child of Array.from(parent.childNodes)) out += serializeNode(child, opts);
  return out;
}
