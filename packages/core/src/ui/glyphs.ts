/**
 * Nabídka znaků k vložení: co to je a jak se v ní hledá.
 *
 * Sdílí to plugin `emoji` a plugin `charmap` — mřížka pojmenovaných znaků
 * s kategoriemi a hledáním je u obou totéž a lišit se má jen tím, co je
 * v seznamu a jakým písmem se vysází.
 *
 * Tady je jen tvar dat a hledání — ani seznam, ani vykreslení. Má to důvod:
 * seznamy jsou dohromady přes tisíc položek a v balíčku nemají co dělat,
 * dokud si někdo ten plugin nezapne. Bydlí proto v `@nibble/plugins` a do
 * dialogu se předávají jako data pole. Hledání je naopak potřeba na obou
 * stranách — plugin podle něj umí vložit znak jménem, dialog jím filtruje
 * mřížku — a je to čistá funkce, takže se dá otestovat bez DOM.
 */

export interface GlyphEntry {
  /** Sám znak, případně i s modifikátory (ZWJ, U+FE0F). Tohle se vkládá. */
  char: string;
  /** Český název. Ukazuje se pod mřížkou a hledá se v něm. */
  name: string;
  /** Klíč kategorie — musí sedět s některou z `GlyphCategory`. */
  category: string;
  /** Další slova, pod kterými to lidé hledají. Název se doplňovat nemusí. */
  keywords?: readonly string[];
  /**
   * Co ukázat v mřížce, když sám znak vidět není.
   *
   * Kvůli pevné mezeře a měkkému rozdělovníku: jsou to nejužitečnější znaky
   * v mapě a přitom neviditelné. Prázdné políčko by vypadalo jako chyba
   * vykreslení, takže se místo nich ukáže náhrada — vloží se pořád `char`.
   */
  display?: string;
}

export interface GlyphCategory {
  key: string;
  label: string;
}

/**
 * Diakritika se při hledání ignoruje.
 *
 * Kdo hledá žirafu, napíše „zirafa“ — na české klávesnici je to o dva hmaty
 * míň a v prohlížeči se stejně píše rychleji bez háčků. V mapě znaků to platí
 * dvojnásob: hledaný znak sám diakritiku často má (`é`, `ø`). Skládá se to na NFD
 * a zahazují se spojovací znaménka, takže to platí pro všechna písmena, ne
 * jen pro ta, která by někdo vyjmenoval v tabulce.
 */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Text, ve kterém se u položky hledá. Počítá se jednou a drží se u položky. */
const haystacks = new WeakMap<GlyphEntry, string>();

function haystack(entry: GlyphEntry): string {
  let value = haystacks.get(entry);
  if (value === undefined) {
    value = foldText(entry.name + ' ' + (entry.keywords ?? []).join(' '));
    haystacks.set(entry, value);
  }
  return value;
}

/**
 * Jak dobře položka sedí na hledané slovo. Nižší je lepší.
 *
 * Bez pořadí by „pes“ vyhodil na první místo „pěst zepředu“ — po složení
 * diakritiky je to `pest` a začíná to na `pes`. Celé slovo v názvu proto váží
 * víc než začátek slova a název víc než klíčová slova.
 */
function rank(entry: GlyphEntry, term: string): number {
  const words = foldText(entry.name).split(/\s+/);
  if (words.includes(term)) return 0;
  if ((entry.keywords ?? []).some((word) => foldText(word) === term)) return 1;
  if (words.some((word) => word.startsWith(term))) return 2;
  return 3;
}

/**
 * Vyfiltruje emotikony podle dotazu.
 *
 * Slova se hledají všechna současně (`modre srdce` najde modré srdce), ale
 * kdekoli — ne jen na začátku, protože „srdce“ je u půlky položek až druhé
 * slovo. Pořadí výsledků pak rozhoduje první slovo dotazu; při shodě se drží
 * pořadí ze seznamu, protože to je ruční a lepší než cokoli spočítaného.
 *
 * Prázdný dotaz vrací seznam beze změny.
 */
export function filterGlyphs(
  list: readonly GlyphEntry[],
  query: string,
): readonly GlyphEntry[] {
  const trimmed = query.trim();
  const folded = foldText(trimmed);
  if (!folded) return list;

  // Kdo do hledání vloží sám znak, chce ten znak — je to rychlejší než hádat,
  // jak se česky jmenuje.
  const direct = list.filter((entry) => entry.char === trimmed);
  if (direct.length > 0) return direct;

  const terms = folded.split(/\s+/);
  const found = list.filter((entry) => {
    const text = haystack(entry);
    return terms.every((term) => text.includes(term));
  });

  const first = terms[0]!;
  return found
    .map((entry, index) => ({ entry, index, score: rank(entry, first) }))
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map((row) => row.entry);
}

/** Položky jedné kategorie. Prázdný nebo neznámý klíč vrací všechno. */
export function glyphsInCategory(
  list: readonly GlyphEntry[],
  category: string,
): readonly GlyphEntry[] {
  if (!category || category === ALL_GLYPHS) return list;
  return list.filter((entry) => entry.category === category);
}

/** Klíč nabídky „Vše“. Není to kategorie seznamu, jen stav dialogu. */
export const ALL_GLYPHS = '*';
