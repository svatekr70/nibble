import type { Editor } from '../Editor.js';
import { closestBlock } from '../dom/blocks.js';

/**
 * Kotva — místo v dokumentu, na které se dá odkázat.
 *
 * Zapisuje se `id` na blok, ne `<a name>`: ten HTML5 zrušil. Prázdný obal
 * `<span id></span>` na místě kurzoru by uměl kotvu doprostřed věty, jenže
 * v obsahu není vidět a při mazání okolo se ztratí, aniž by si toho někdo
 * všiml. Blok přežije čištění, round-trip i pozdější úpravy — a odkaz na
 * začátek odstavce nebo nadpisu je to, co se skoro vždycky myslí.
 */

/** Blok, na kterém kotva sedí nebo sedět bude. */
export function anchorTarget(editor: Editor): Element | null {
  const range = editor.selection.getRange();
  return range ? closestBlock(range.startContainer, editor.root) : null;
}

/**
 * Název kotvy na tvar, který projde i v adrese.
 *
 * HTML5 `id` snese skoro cokoli kromě mezery, ale v odkazu `#…` a v URL se
 * diakritika i velká písmena chovají různě podle prohlížeče a serveru. Kotva
 * je tak čitelná i po zkopírování adresy do e-mailu.
 */
export function anchorSlug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

/**
 * Název, který v dokumentu ještě není.
 *
 * Dvě stejná `id` jsou neplatné HTML a odkaz by skočil jen na to první.
 * `self` je blok, který se právě upravuje — jeho vlastní název se za kolizi
 * nepočítá, jinak by se při každém otevření dialogu očísloval znovu.
 */
export function uniqueAnchor(root: Element, base: string, self: Element | null): string {
  const taken = new Set<string>();
  for (const el of Array.from(root.querySelectorAll('[id]'))) {
    if (el !== self) taken.add(el.id);
  }

  if (!taken.has(base)) return base;

  let n = 2;
  while (taken.has(base + '-' + n) && n < 1000) n += 1;
  return base + '-' + n;
}

/** Návrh názvu do dialogu: co už na bloku je, jinak z jeho textu. */
export function suggestAnchor(editor: Editor): string {
  const block = anchorTarget(editor);
  if (!block) return '';
  if (block.id) return block.id;

  const base = anchorSlug((block.textContent ?? '').trim().split(/\s+/).slice(0, 6).join(' '));
  return base ? uniqueAnchor(editor.root, base, block) : '';
}

export function registerAnchorCommands(editor: Editor): void {
  editor.commands.add('anchor', (ed, args) => {
    const block = anchorTarget(ed);
    if (!block) return false;

    const raw = typeof args === 'string' ? args : String((args as { name?: unknown })?.name ?? '');
    const slug = anchorSlug(raw);

    // Prázdný název kotvu ruší — je to jediná cesta, jak ji zase sundat.
    if (slug === '') {
      if (!block.hasAttribute('id')) return false;
      block.removeAttribute('id');
      ed.commit('anchor');
      return true;
    }

    const name = uniqueAnchor(ed.root, slug, block);
    if (block.getAttribute('id') === name) return false;

    block.setAttribute('id', name);
    ed.commit('anchor');
    return true;
  }, (ed) => anchorTarget(ed) !== null);
}
