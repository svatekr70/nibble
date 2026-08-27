import {
  htmlIndexForTextOffset, positionAtTextOffset, textOffsetForHtmlIndex, textOffsetOf,
  type Editor, type Plugin,
} from '@nibble/core';

/**
 * Drobné nástroje, které v cílovém projektu chybět nemůžou: zdrojový kód (9 konfigurací),
 * automatické odkazy (11), počítadlo slov, hledání a celá obrazovka.
 *
 * Jsou v jednom souboru, protože každý z nich je pár desítek řádků a rozdělovat
 * je do vlastních balíčků by přineslo víc údržby než užitku. Importují se
 * pořád jednotlivě, takže do výsledku se dostane jen to, co někdo použije.
 */

// ---------------------------------------------------------------- zdrojový kód

/**
 * Úprava HTML přímo.
 *
 * Vypisuje `getHTML()`, tedy včetně původního znění nedotčených bloků — kdo
 * si otevře zdroj a zavře ho, nesmí tím dokument změnit.
 */
export const code: Plugin = {
  name: 'code',

  setup(editor) {
    editor.commands.add('code', (ed) => { void openCodeDialog(ed); return true; });

    editor.ui.addButton('code', {
      icon: 'code', tooltip: 'Zdrojový kód',
      onAction: (ed) => { ed.exec('code'); },
    });
  },
};

/**
 * Kde ve zdroji stojí kurzor z obsahu.
 *
 * Kdo si otevře zdroj, chce pokračovat tam, kde byl — ne hledat v pěti
 * kilobajtech HTML odstavec, na kterém stál. Pozice se počítá přes viditelné
 * znaky textu, protože značky do obsahu vkládat nelze.
 */
function selectionInSource(editor: Editor, html: string): [number, number] {
  const range = editor.selection.getRange();
  if (!range) return [0, 0];

  const from = textOffsetOf(editor.root, range.startContainer, range.startOffset);
  const to = range.collapsed
    ? from
    : textOffsetOf(editor.root, range.endContainer, range.endOffset);

  return [htmlIndexForTextOffset(html, from), htmlIndexForTextOffset(html, to)];
}

async function openCodeDialog(editor: Editor): Promise<void> {
  const before = editor.getHTML();
  const selection = selectionInSource(editor, before);

  const data = await editor.ui.dialog({
    title: 'Zdrojový kód',
    size: 'large',
    fields: [{ type: 'code', name: 'html', label: 'HTML', selection }],
    initial: { html: before },
    submitLabel: 'Použít',
  });

  if (!data) return;

  const next = String(data.html ?? '');
  // Beze změny se nic nepřepisuje — jinak by pouhé otevření zdroje
  // znamenalo přeformátování celého dokumentu.
  if (next === before) return;

  // Kurzor se vrací tam, kde byl ve zdroji — počítáno zase přes text.
  const caret = typeof data.__caret === 'number' ? data.__caret : null;
  editor.setHTML(next);

  if (caret !== null) {
    const position = positionAtTextOffset(editor.root, textOffsetForHtmlIndex(next, caret));
    if (position) editor.selection.collapseTo(position.node, position.offset);
  }

  editor.commit('code');
}

// ---------------------------------------------------------------- automatické odkazy

const URL_PATTERN = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)])$/i;
const EMAIL_PATTERN = /([\w.+-]+@[\w-]+\.[\w.-]+[\w])$/i;

/**
 * Z napsané adresy udělá odkaz.
 *
 * Spouští se na mezeře a Enteru, ne při každém úhozu: dokud uživatel adresu
 * dopisuje, nemá mu editor pod rukama nic měnit.
 */
export const autolink: Plugin = {
  name: 'autolink',

  setup(editor) {
    const tryLink = (): void => {
      const range = editor.selection.getRange();
      if (!range || !range.collapsed) return;

      const node = range.startContainer;
      if (node.nodeType !== 3) return;

      const text = node as Text;
      const before = text.data.slice(0, range.startOffset);

      // Uvnitř odkazu se nic nepřepisuje.
      let parent: Node | null = text.parentNode;
      while (parent && parent !== editor.root) {
        if ((parent as Element).tagName?.toLowerCase() === 'a') return;
        parent = parent.parentNode;
      }

      const url = URL_PATTERN.exec(before);
      const email = !url ? EMAIL_PATTERN.exec(before) : null;
      const match = url ?? email;
      if (!match) return;

      const found = match[1]!;
      const start = range.startOffset - found.length;
      const href = url ? found : 'mailto:' + found;

      const anchor = editor.document.createElement('a');
      anchor.setAttribute('href', href);
      anchor.textContent = found;

      const tail = text.splitText(start);
      tail.deleteData(0, found.length);
      tail.parentNode?.insertBefore(anchor, tail);

      editor.selection.collapseTo(tail, 0);
      editor.commit('autolink');
    };

    const onKeyDown = (event: Event): void => {
      const e = event as KeyboardEvent;
      if (e.key === ' ' || e.key === 'Enter') tryLink();
    };

    editor.root.addEventListener('keydown', onKeyDown);
    return () => editor.root.removeEventListener('keydown', onKeyDown);
  },
};

// ---------------------------------------------------------------- počítadlo

function countWords(text: string): number {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  return trimmed === '' ? 0 : trimmed.split(' ').length;
}

/** Počet slov a znaků ve stavovém řádku. */
export const wordcount: Plugin = {
  name: 'wordcount',

  setup(editor) {
    const update = (): void => {
      const text = editor.getText();
      editor.ui.setStatus(
        'wordcount',
        countWords(text) + ' slov · ' + text.replace(/\s/g, '').length + ' znaků',
      );
    };

    update();
    const off = editor.on('change', update);
    const offSet = editor.on('setcontent', update);

    return () => { off(); offSet(); editor.ui.setStatus('wordcount', null); };
  },
};

// ---------------------------------------------------------------- celá obrazovka

export const fullscreen: Plugin = {
  name: 'fullscreen',

  setup(editor) {
    const shell = (): HTMLElement | null => editor.root.closest('.nb');

    editor.commands.add('fullscreen', (ed) => {
      const box = shell();
      if (!box) return false;

      const on = box.classList.toggle('nb-fullscreen');
      ed.document.body.classList.toggle('nb-fullscreen-host', on);
      ed.dispatch('fullscreen', { on });
      ed.focus();
      return true;
    });

    editor.ui.addButton('fullscreen', {
      icon: 'fullscreen', tooltip: 'Celá obrazovka', shortcut: 'F11',
      active: () => shell()?.classList.contains('nb-fullscreen') ?? false,
      onAction: (ed) => { ed.exec('fullscreen'); },
    });

    const onKeyDown = (event: Event): void => {
      const e = event as KeyboardEvent;
      if (e.key === 'Escape' && shell()?.classList.contains('nb-fullscreen')) {
        e.preventDefault();
        editor.exec('fullscreen');
      }
    };

    editor.root.addEventListener('keydown', onKeyDown);
    return () => {
      editor.root.removeEventListener('keydown', onKeyDown);
      shell()?.classList.remove('nb-fullscreen');
      editor.document.body.classList.remove('nb-fullscreen-host');
    };
  },
};

// ---------------------------------------------------------------- hledání

/** Najde všechny výskyty v textových uzlech a vrátí je v pořadí dokumentu. */
function findMatches(root: Element, needle: string, matchCase: boolean): Array<[Text, number]> {
  if (needle === '') return [];

  const out: Array<[Text, number]> = [];
  const walker = root.ownerDocument.createTreeWalker(root, 4 /* SHOW_TEXT */);
  const target = matchCase ? needle : needle.toLowerCase();

  let node = walker.nextNode();
  while (node) {
    const text = node as Text;
    const haystack = matchCase ? text.data : text.data.toLowerCase();

    let from = haystack.indexOf(target);
    while (from >= 0) {
      out.push([text, from]);
      from = haystack.indexOf(target, from + target.length);
    }
    node = walker.nextNode();
  }

  return out;
}

/**
 * Zvýrazní nalezený výskyt.
 *
 * Přednost má `CSS.highlights`: obarví nález, i když kurzor stojí v panelu,
 * a DOM přitom nechá být — hledání nemá důvod sahat do obsahu, ve kterém jen
 * hledá. Kde API není (starší Safari a Firefox), zbývá obyčejný výběr; ten je
 * v rozostřeném editoru bledý, ale vidět je.
 *
 * Obojí naráz nemá smysl. Výběr se podle specifikace kreslí přes vlastní
 * zvýraznění, takže by ho přebil a žluté podbarvení by nikdo neviděl.
 */
function markMatch(editor: Editor, range: Range | null): void {
  const view = editor.document.defaultView as unknown as {
    CSS?: { highlights?: Map<string, unknown> };
    Highlight?: new (...ranges: Range[]) => unknown;
  } | null;

  const store = view?.CSS?.highlights;
  const Ctor = view?.Highlight;

  if (store && Ctor) {
    if (range) store.set('nb-find', new Ctor(range));
    else store.delete('nb-find');
    return;
  }

  if (range) editor.selection.setRange(range);
}

/** Rozsah kolem jednoho nálezu. */
function rangeOf(editor: Editor, [text, at]: [Text, number], length: number): Range {
  const range = editor.document.createRange();
  range.setStart(text, at);
  range.setEnd(text, at + length);
  return range;
}

export const searchreplace: Plugin = {
  name: 'searchreplace',

  setup(editor) {
    editor.commands.add('searchreplace', (ed) => { void openSearchDialog(ed); return true; });

    editor.ui.addButton('searchreplace', {
      icon: 'search', tooltip: 'Najít a nahradit', shortcut: 'Ctrl+F',
      onAction: (ed) => { ed.exec('searchreplace'); },
    });

    const onKeyDown = (event: Event): void => {
      const e = event as KeyboardEvent;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        void openSearchDialog(editor);
      }
    };

    editor.root.addEventListener('keydown', onKeyDown);
    return () => editor.root.removeEventListener('keydown', onKeyDown);
  },
};

/**
 * Panel hledání.
 *
 * Nemodální schválně: nález se ukazuje v obsahu, takže na obsah musí být vidět.
 * Panel si drží jen to, co se z obsahu přečíst nedá — kde stojí v pořadí
 * nálezů. Samotné nálezy se pokaždé hledají znovu, protože obsah se mezitím
 * mohl změnit (nahrazením i tím, že uživatel psal), a uložený seznam uzlů by
 * po takové změně ukazoval jinam.
 */
async function openSearchDialog(editor: Editor): Promise<void> {
  /** Kolikátý nález je právě vybraný. −1 = zatím žádný. */
  let cursor = -1;
  let lastNeedle = '';
  let lastCase = false;
  /** Poslední nález — po zavření panelu se na něj postaví kurzor. */
  let current: Range | null = null;

  const matchesFor = (values: Record<string, unknown>): {
    needle: string; matchCase: boolean; found: Array<[Text, number]>;
  } => {
    const needle = String(values.find ?? '');
    const matchCase = Boolean(values.matchCase);
    // Změna hledaného textu začíná hledat od začátku, ne od posledního místa.
    if (needle !== lastNeedle || matchCase !== lastCase) cursor = -1;
    lastNeedle = needle;
    lastCase = matchCase;
    return { needle, matchCase, found: findMatches(editor.root, needle, matchCase) };
  };

  /** Posune se na další nález a vybere ho. Vrátí false, když žádný není. */
  const findNext = (values: Record<string, unknown>): boolean => {
    const { needle, found } = matchesFor(values);
    if (needle === '' || found.length === 0) {
      current = null;
      markMatch(editor, null);
      editor.ui.notify('Nic nenalezeno.', 'warn');
      return false;
    }

    // Za posledním nálezem se začíná znovu od prvního — hledání se nezastaví
    // na konci dokumentu, to od něj nikdo nečeká.
    cursor = (cursor + 1) % found.length;
    current = rangeOf(editor, found[cursor]!, needle.length);
    markMatch(editor, current);
    editor.ui.setStatus('find', (cursor + 1) + ' z ' + found.length);
    return true;
  };

  const replaceOne = (values: Record<string, unknown>): void => {
    const { needle, found } = matchesFor(values);
    if (needle === '' || found.length === 0) {
      editor.ui.notify('Nic nenalezeno.', 'warn');
      return;
    }

    // Bez předchozího „Najít další" se nahradí první nález — jinak by tlačítko
    // po otevření panelu nedělalo nic a nebylo by poznat proč.
    if (cursor < 0) cursor = 0;
    if (cursor >= found.length) cursor = 0;

    const [text, at] = found[cursor]!;
    text.replaceData(at, needle.length, String(values.replace ?? ''));
    editor.commit('replace');

    // Nález zmizel, takže další v pořadí má teď index toho zrušeného.
    cursor -= 1;
    if (!findNext(values)) editor.ui.setStatus('find', null);
  };

  const replaceAll = (values: Record<string, unknown>): void => {
    const { needle, found } = matchesFor(values);
    if (needle === '' || found.length === 0) {
      editor.ui.notify('Nic nenalezeno.', 'warn');
      return;
    }

    // Odzadu, aby si nahrazení navzájem neposouvala pozice.
    const replacement = String(values.replace ?? '');
    for (const [text, at] of [...found].reverse()) {
      text.replaceData(at, needle.length, replacement);
    }

    editor.commit('replace');
    current = null;
    markMatch(editor, null);
    cursor = -1;
    editor.ui.notify('Nahrazeno: ' + found.length + '×');
  };

  await editor.ui.dialog({
    title: 'Najít a nahradit',
    modeless: true,
    fields: [
      { type: 'text', name: 'find', label: 'Najít', required: true },
      { type: 'text', name: 'replace', label: 'Nahradit čím' },
      { type: 'checkbox', name: 'matchCase', label: 'Rozlišovat velikost písmen' },
    ],
    actions: [
      { name: 'next', label: 'Najít další' },
      { name: 'replace', label: 'Nahradit' },
    ],
    submitLabel: 'Nahradit vše',
    cancelLabel: 'Zavřít',
    onAction: (name, values) => {
      if (name === 'next') findNext(values);
      else replaceOne(values);
    },
    onClose: () => {
      // Zvýraznění zmizí s panelem, ale kurzor má zůstat u posledního nálezu —
      // uživatel v něm většinou chce hned pokračovat.
      //
      // Fokus se musí vrátit do obsahu dřív, než se výběr nastaví. Panel ho
      // drží až do zavření a výběr nastavený do rozostřeného editoru by
      // prohlížeč zahodil.
      markMatch(editor, null);

      // Až za tímto tikem. Prohlížeč po zavření `<dialog>` vrací fokus tomu,
      // kdo ho měl předtím, a dělá to asynchronně — výběr nastavený rovnou tady
      // by to zrušilo a kurzor by skončil na začátku dokumentu.
      const landing = current;
      if (landing) {
        setTimeout(() => {
          editor.focus();
          editor.selection.setRange(landing);
        }, 0);
      }
      editor.ui.setStatus('find', null);
    },
  }).then((values) => { if (values) replaceAll(values); });
}

// ---------------------------------------------------------------- typografie

/**
 * České uvozovky a pomlčky.
 *
 * V TinyMCE je tohle placená funkce a pro angličtinu; pro češtinu by se stejně
 * musela přepsat, protože „takhle" se sází jinak než "takhle".
 */
export const typography: Plugin = {
  name: 'typography',

  setup(editor) {
    // Vlastní událost editoru, ne DOM `input`. Jádro `beforeinput` ruší a mění
    // obsah samo, takže prohlížeč `input` vůbec nevyvolá.
    const onInput = (): void => {
      const range = editor.selection.getRange();
      if (!range || !range.collapsed || range.startContainer.nodeType !== 3) return;

      const text = range.startContainer as Text;
      const at = range.startOffset;
      const before = text.data.slice(0, at);

      const rules: Array<[RegExp, string]> = [
        [/(^|[\s([{])"$/, '$1„'],       // otevírací uvozovka po mezeře nebo závorce
        [/"$/, '“'],                     // jinak zavírací
        [/(^|[\s([{])'$/, '$1‚'],
        [/'$/, '‘'],
        [/(\S)\s--\s$/, '$1 – '],        // pomlčka
        [/\.\.\.$/, '…'],
        [/(\d)\s?x\s?(?=\d)$/, '$1×'],
      ];

      for (const [pattern, replacement] of rules) {
        if (!pattern.test(before)) continue;

        const next = before.replace(pattern, replacement);
        if (next === before) continue;

        text.replaceData(0, at, next);
        editor.selection.collapseTo(text, next.length);
        editor.commit('type');
        return;
      }
    };

    return editor.on('input', onInput);
  },
};

export { countWords, findMatches };
