import type { Editor } from '../Editor.js';
import { foldText } from './glyphs.js';

/**
 * Nabídka u kurzoru — data a čisté funkce. Vykreslení je v `@nibble/ui`
 * (`CaretMenu`), stejně jako u ostatních ovládacích prvků.
 */

export interface SuggestionItem {
  id: string;
  label: string;
  icon?: string;
  keywords?: readonly string[];
}

export interface SuggestionSpec {
  trigger: string;
  /** Spouštět jen na začátku bloku (lomítko). Jinak stačí mezera před spouštěčem. */
  startOfBlock?: boolean;
  items(editor: Editor, query: string): readonly SuggestionItem[];
  onPick(editor: Editor, item: SuggestionItem): void;
  /** Otevírá položka dialog? Pak se smazání dotazu zapíše jako samostatný krok. */
  opensDialog?(item: SuggestionItem): boolean;
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Dotaz za spouštěčem, nebo null, když nabídka otevřená být nemá.
 *
 * Dotaz smí obsahovat mezery — popisky jsou víceslovné („Nadpis 2“,
 * „Číslovaný seznam“) a dají se dopsat celé. Nabídku zavře až mezera, pro
 * kterou nic nesedí; to už pozná filtr. Mezerou ale začínat nesmí: `/ ` je
 * obyčejné lomítko v textu.
 */
export function suggestionQuery(textBefore: string, trigger: string, startOfBlock: boolean): string | null {
  const t = escape(trigger);
  const query = '((?:[^\\s' + t + '][^' + t + ']*)?)$';
  const pattern = startOfBlock
    ? new RegExp('^' + t + query)
    : new RegExp('(?:^|\\s)' + t + query);
  const m = pattern.exec(textBefore);
  return m ? m[1]! : null;
}

/**
 * Text pro porovnání: bez diakritiky a velikosti, mezery sjednocené.
 * Contenteditable píše mezeru na konci textu jako U+00A0, takže `/nadpis 2`
 * dorazí s nedělitelnou mezerou uprostřed.
 */
function words(text: string): string {
  return foldText(text).replace(/\s+/g, ' ').trim();
}

/** Položky odpovídající dotazu; ty, jejichž popisek dotazem začíná, jdou první. */
export function filterSuggestions<T extends SuggestionItem>(items: readonly T[], query: string): T[] {
  const q = words(query);
  if (q === '') return [...items];

  const starts: T[] = [];
  const contains: T[] = [];
  for (const item of items) {
    const label = words(item.label);
    const hay = label + ' ' + words((item.keywords ?? []).join(' '));
    if (label.startsWith(q)) starts.push(item);
    else if (hay.includes(q)) contains.push(item);
  }
  return [...starts, ...contains];
}
