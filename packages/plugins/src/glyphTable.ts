import { filterGlyphs, type GlyphEntry, type GlyphCategory } from '@nibble/core';

/**
 * Seznamy znaků jako tabulka v textu, ne jako pole objektů.
 *
 * Řádek je `znak název | klíčová slova | náhrada`. Ve zdroji je to tabulka,
 * která se dá číst a doplňovat okem; jako pole objektů by totéž zabralo pětkrát
 * víc řádků a při čtení by se v uvozovkách a složených závorkách ztratilo to
 * podstatné. Rozebere se to jednou při načtení.
 *
 * Sdílí to `emoji` i `charmap` — jsou to dva seznamy téhož tvaru.
 */

/** Zápis `U+00A0` místo znaku samotného. Pro ty, které nejsou vidět. */
const CODE = /^U\+([0-9a-f]{4,6})$/i;

function charOf(token: string): string {
  const code = CODE.exec(token);
  return code ? String.fromCodePoint(parseInt(code[1]!, 16)) : token;
}

/**
 * Rozebere tabulky po kategoriích. Kategorie určuje pořadí i to, co se načte —
 * text pod klíčem, který v seznamu kategorií není, se přeskočí.
 */
export function parseGlyphTable(
  data: Readonly<Record<string, string>>,
  categories: readonly GlyphCategory[],
): readonly GlyphEntry[] {
  const out: GlyphEntry[] = [];

  for (const category of categories) {
    for (const line of (data[category.key] ?? '').split('\n')) {
      const row = line.trim();
      if (!row) continue;

      const [head, words, display] = row.split('|');
      // Dělí se na první mezeře: znak sám mezeru neobsahuje, název skoro vždy.
      const space = head!.indexOf(' ');
      if (space < 1) continue;

      const keywords = (words ?? '').trim().split(/\s+/).filter(Boolean);
      const stand = (display ?? '').trim();

      out.push({
        char: charOf(head!.slice(0, space)),
        name: head!.slice(space + 1).trim(),
        category: category.key,
        ...(keywords.length > 0 ? { keywords } : {}),
        ...(stand ? { display: stand } : {}),
      });
    }
  }

  return out;
}

/**
 * Co vložit podle toho, co přišlo příkazu.
 *
 * Znak projde rovnou; text se nejdřív zkusí najít v seznamu, takže
 * `exec('emoji', 'srdce')` funguje ze skriptu i z konzole. Nenajde-li se nic,
 * nevloží se nic — vepsat do textu slovo „srdce“ by bylo horší než neudělat nic.
 */
export function glyphFor(args: unknown, list: readonly GlyphEntry[]): string {
  const raw = typeof args === 'string'
    ? args
    : String((args as { char?: unknown } | undefined)?.char ?? '');

  // Napřed doslova, teprve pak ořezaně: pevná mezera je platný znak ze seznamu
  // a `trim()` by z ní udělala prázdný řetězec, tedy „nevkládej nic“.
  if (list.some((entry) => entry.char === raw)) return raw;

  const value = raw.trim();
  if (!value) return '';

  if (list.some((entry) => entry.char === value)) return value;

  const found = filterGlyphs(list, value);
  return found[0]?.char ?? '';
}
