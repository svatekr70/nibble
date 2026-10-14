import type { Editor, Plugin, SuggestionItem } from '@nibble/core';
import { filterSuggestions } from '@nibble/core';

/**
 * Lomítkové příkazy: `/` na začátku řádku nabídne, co vložit.
 *
 * Nabídka ukazuje jen to, co v editoru opravdu je — bez pluginu tabulek
 * žádná „Tabulka“.
 */

interface SlashItem extends SuggestionItem {
  /** Příkaz a jeho argument, nebo tlačítko, které otevře dialog. */
  run: { command: string; args?: unknown } | { button: string };
}

export const SLASH_ITEMS: readonly SlashItem[] = [
  { id: 'h1', label: 'Nadpis 1', icon: 'header', keywords: ['h1', 'titulek'], run: { command: 'formatBlock', args: 'h1' } },
  { id: 'h2', label: 'Nadpis 2', icon: 'header', keywords: ['h2'], run: { command: 'formatBlock', args: 'h2' } },
  { id: 'h3', label: 'Nadpis 3', icon: 'header', keywords: ['h3'], run: { command: 'formatBlock', args: 'h3' } },
  { id: 'bullist', label: 'Odrážky', icon: 'bullist', keywords: ['seznam', 'ul'], run: { command: 'bullist' } },
  { id: 'numlist', label: 'Číslovaný seznam', icon: 'numlist', keywords: ['seznam', 'ol', 'cislovani'], run: { command: 'numlist' } },
  { id: 'tasklist', label: 'Úkoly', icon: 'tasklist', keywords: ['todo', 'checkbox', 'zaskrtavatko'], run: { command: 'tasklist' } },
  { id: 'quote', label: 'Citace', icon: 'blockquote', keywords: ['quote'], run: { command: 'blockquote' } },
  { id: 'pre', label: 'Blok kódu', icon: 'code', keywords: ['kod', 'pre'], run: { command: 'formatBlock', args: 'pre' } },
  { id: 'hr', label: 'Vodorovná čára', icon: 'hr', keywords: ['oddelovac', 'hr'], run: { command: 'hr' } },
  { id: 'table', label: 'Tabulka', icon: 'table', keywords: ['tabulka'], run: { command: 'inserttable', args: { rows: 3, cols: 3 } } },
  { id: 'image', label: 'Obrázek', icon: 'image', keywords: ['foto', 'img'], run: { button: 'image' } },
  { id: 'media', label: 'Video', icon: 'media', keywords: ['youtube', 'vimeo'], run: { button: 'media' } },
  { id: 'details', label: 'Rozbalovací blok', icon: 'details', keywords: ['faq', 'details'], run: { command: 'details' } },
];

function available(editor: Editor, item: SlashItem): boolean {
  return 'command' in item.run ? editor.can(item.run.command) : editor.ui.get(item.run.button) !== undefined;
}

export const slash: Plugin = {
  name: 'slash',

  setup(editor) {
    editor.ui.addSuggestion('slash', {
      trigger: '/',
      startOfBlock: true,
      items: (ed, query) => {
        // V nadpisu rozbalovacího bloku blokové příkazy nic neudělají (viz
        // `touchesSummary`) — výběr by jen smazal `/dotaz`. Nabídka proto
        // vůbec nevyskočí.
        if (ed.getBlockTag() === 'summary') return [];
        return filterSuggestions(SLASH_ITEMS.filter((i) => available(ed, i)), query);
      },
      opensDialog: (item) => 'button' in (item as SlashItem).run,
      onPick: (ed, item) => {
        const { run } = item as SlashItem;
        if ('command' in run) {
          // Příkaz, který odmítne, nic nezapíše. Smazaný `/dotaz` by pak
          // visel mimo historii a přilepil se k cizímu kroku — zapíše se
          // proto sám.
          if (!ed.exec(run.command, run.args)) ed.commit('slash');
          return;
        }
        const spec = ed.ui.get(run.button);
        if (spec?.kind === 'button') spec.onAction(ed);
      },
    });
  },
};
