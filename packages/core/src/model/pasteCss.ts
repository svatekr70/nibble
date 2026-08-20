/**
 * Pravidla ze `<style>` bloku vložená k prvkům.
 *
 * Google Sheets posílá formátování ke každé buňce, Excel a Word ne — ty pošlou
 * `<td class=xl78>` a k tomu blok stylů s pravidlem `.xl78 { ... }`. Blok se
 * z obsahu zahazuje (`<style>` uvnitř dokumentu nemá co dělat), takže bez
 * tohohle kroku dorazí z Excelu tabulka bez jediné barvy — třídy zůstanou
 * viset ve vzduchu.
 *
 * Parser je schválně hloupý: umí značku, třídu a jejich spojení, nic víc.
 * Excel ani Word složitější selektor neposílají a rozumět celému CSS jen kvůli
 * vkládání ze schránky by byl nepoměr.
 */

export interface StyleRule {
  selector: string;
  /** Deklarace v pořadí zápisu. */
  declarations: [string, string][];
  /** Značka 1, třída 10 — aby třída přebila obecné pravidlo pro `td`. */
  weight: number;
  /** Název třídy, pokud jde o pravidlo pro třídu. */
  className?: string;
}

const SIMPLE_SELECTOR = /^([a-z][\w-]*)?(?:\.([\w-]+))?$/i;

function parseDeclarations(text: string): [string, string][] {
  const out: [string, string][] = [];
  for (const rule of text.split(';')) {
    const colon = rule.indexOf(':');
    if (colon < 0) continue;
    const name = rule.slice(0, colon).trim().toLowerCase();
    const value = rule.slice(colon + 1).trim().replace(/\s+/g, ' ');
    // `mso-` vlastnosti nesou nastavení Wordu a Excelu, ne vzhled.
    if (!name || !value || name.startsWith('mso-')) continue;
    out.push([name, value]);
  }
  return out;
}

/** Vybere pravidla ze všech `<style>` bloků v HTML ze schránky. */
export function collectStyleRules(html: string): StyleRule[] {
  const rules: StyleRule[] = [];

  for (const block of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    // Excel schovává obsah bloku do komentáře a doplňuje ho poznámkami v /* */.
    const css = block[1]!.replace(/<!--|-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const declarations = parseDeclarations(rule[2]!);
      if (declarations.length === 0) continue;

      for (const raw of rule[1]!.split(',')) {
        const selector = raw.trim();
        // `@page`, `@media` a cokoli složitějšího se přeskočí celé.
        const match = SIMPLE_SELECTOR.exec(selector);
        if (!selector || !match || (!match[1] && !match[2])) continue;

        rules.push({
          selector, declarations, weight: match[2] ? 10 : 1,
          ...(match[2] ? { className: match[2] } : {}),
        });
      }
    }
  }

  return rules;
}

/**
 * Zapíše pravidla do `style` prvků. Vlastní zápis prvku má vždy přednost.
 */
export function inlineStyleRules(root: Element, rules: readonly StyleRule[]): void {
  if (rules.length === 0) return;

  const collected = new Map<Element, Map<string, string>>();
  // Třída, jejíž pravidlo se zapsalo dovnitř, už nic nenese. `class="xl78"`
  // by v obsahu zůstalo viset bez jakéhokoli významu.
  const consumed = new Map<Element, Set<string>>();

  // Vzestupně podle váhy: obecné `td` se zapíše první, třída ho přepíše.
  for (const rule of [...rules].sort((a, b) => a.weight - b.weight)) {
    let targets: Element[];
    try {
      targets = Array.from(root.querySelectorAll(rule.selector));
    } catch {
      continue;
    }

    for (const el of targets) {
      let style = collected.get(el);
      if (!style) { style = new Map(); collected.set(el, style); }
      for (const [name, value] of rule.declarations) style.set(name, value);

      if (rule.className !== undefined) {
        let used = consumed.get(el);
        if (!used) { used = new Set(); consumed.set(el, used); }
        used.add(rule.className);
      }
    }
  }

  for (const [el, used] of consumed) {
    const kept = (el.getAttribute('class') ?? '').split(/\s+/).filter(
      (name) => name && !used.has(name),
    );
    if (kept.length) el.setAttribute('class', kept.join(' '));
    else el.removeAttribute('class');
  }

  for (const [el, style] of collected) {
    // Vlastní `style` prvku se přidá nakonec — přebíjí, ale nemá se ztratit.
    for (const rule of (el.getAttribute('style') ?? '').split(';')) {
      const colon = rule.indexOf(':');
      if (colon < 0) continue;
      const name = rule.slice(0, colon).trim().toLowerCase();
      const value = rule.slice(colon + 1).trim();
      if (name && value) style.set(name, value);
    }

    el.setAttribute(
      'style',
      Array.from(style, ([name, value]) => name + ': ' + value).join('; ') + ';',
    );
  }
}
