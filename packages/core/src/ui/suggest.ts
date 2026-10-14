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

/** Dotaz za spouštěčem, nebo null, když nabídka otevřená být nemá. */
export function suggestionQuery(textBefore: string, trigger: string, startOfBlock: boolean): string | null {
  const t = escape(trigger);
  const pattern = startOfBlock
    ? new RegExp('^' + t + '([^\\s' + t + ']*)$')
    : new RegExp('(?:^|\\s)' + t + '([^\\s' + t + ']*)$');
  const m = pattern.exec(textBefore);
  return m ? m[1]! : null;
}

/** Položky odpovídající dotazu; ty, jejichž popisek dotazem začíná, jdou první. */
export function filterSuggestions<T extends SuggestionItem>(items: readonly T[], query: string): T[] {
  const q = foldText(query.trim());
  if (q === '') return [...items];

  const starts: T[] = [];
  const contains: T[] = [];
  for (const item of items) {
    const label = foldText(item.label);
    const hay = label + ' ' + foldText((item.keywords ?? []).join(' '));
    if (label.startsWith(q)) starts.push(item);
    else if (hay.includes(q)) contains.push(item);
  }
  return [...starts, ...contains];
}
