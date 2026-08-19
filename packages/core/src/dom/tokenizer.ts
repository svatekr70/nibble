/**
 * Rozdělí HTML na kusy nejvyšší úrovně a u každého si nechá původní řetězec.
 *
 * Tohle je jediný důvod, proč Nibble dokáže načíst dokument, nesáhnout na něj
 * a uložit ho znak po znaku stejně. Prohlížeč při parsování obsah normalizuje —
 * přepíše uvozovky, přeuspořádá atributy, rozbalí entity. Kdybychom při ukládání
 * vycházeli z DOMu, první uložení kterékoli staré stránky by ji přepsalo.
 * Proto se pro nedotčené kusy vypisuje zpátky tenhle původní text.
 */

const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/** Elementy, jejichž obsah se neparsuje jako značky. */
const RAW = new Set(['script', 'style', 'textarea', 'title']);

const TAG_START = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/;

/** Najde index '>' ukončujícího značku, přeskočí '>' uvnitř uvozovaných hodnot. */
function findTagEnd(html: string, from: number): number {
  let quote = '';
  for (let i = from + 1; i < html.length; i++) {
    const ch = html[i]!;
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '>') {
      return i;
    }
  }
  return -1;
}

/** Najde konec elementu `name`, který začíná otevírací značkou na `openStart`. */
function findElementEnd(html: string, openEnd: number, name: string): number {
  if (RAW.has(name)) {
    const close = html.toLowerCase().indexOf('</' + name, openEnd);
    if (close < 0) return html.length;
    const gt = findTagEnd(html, close);
    return gt < 0 ? html.length : gt + 1;
  }

  let depth = 1;
  let i = openEnd;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) return html.length;

    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }

    const m = TAG_START.exec(html.slice(lt, lt + 64));
    if (!m) { i = lt + 1; continue; }

    const gt = findTagEnd(html, lt);
    if (gt < 0) return html.length;

    const tag = m[2]!.toLowerCase();
    const closing = m[1] === '/';

    if (tag === name) {
      if (closing) {
        depth--;
        if (depth === 0) return gt + 1;
      } else if (!VOID.has(tag) && html[gt - 1] !== '/') {
        depth++;
      }
    } else if (RAW.has(tag) && !closing) {
      const close = html.toLowerCase().indexOf('</' + tag, gt);
      i = close < 0 ? html.length : close;
      continue;
    }

    i = gt + 1;
  }
  return html.length;
}

/**
 * Vrátí kusy nejvyšší úrovně v původním znění. Spojením vznikne původní vstup.
 */
export function splitTopLevel(html: string): string[] {
  const out: string[] = [];
  let i = 0;

  while (i < html.length) {
    const lt = html.indexOf('<', i);

    if (lt < 0) { out.push(html.slice(i)); break; }
    if (lt > i) out.push(html.slice(i, lt));

    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      const stop = end < 0 ? html.length : end + 3;
      out.push(html.slice(lt, stop));
      i = stop;
      continue;
    }

    if (html.startsWith('<!', lt)) {
      const gt = findTagEnd(html, lt);
      const stop = gt < 0 ? html.length : gt + 1;
      out.push(html.slice(lt, stop));
      i = stop;
      continue;
    }

    const m = TAG_START.exec(html.slice(lt, lt + 64));
    if (!m) { out.push(html.slice(lt, lt + 1)); i = lt + 1; continue; }

    const gt = findTagEnd(html, lt);
    if (gt < 0) { out.push(html.slice(lt)); break; }

    const tag = m[2]!.toLowerCase();
    const selfClosed = html[gt - 1] === '/';

    // Osiřelá zavírací značka, prázdný element nebo <br/> — kus sám o sobě.
    if (m[1] === '/' || VOID.has(tag) || selfClosed) {
      out.push(html.slice(lt, gt + 1));
      i = gt + 1;
      continue;
    }

    const end = findElementEnd(html, gt + 1, tag);
    out.push(html.slice(lt, end));
    i = end;
  }

  return out.filter((chunk) => chunk.length > 0);
}

export { VOID as VOID_ELEMENTS, RAW as RAW_TEXT_ELEMENTS };
