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

async function openSearchDialog(editor: Editor): Promise<void> {
  const data = await editor.ui.dialog({
    title: 'Najít a nahradit',
    fields: [
      { type: 'text', name: 'find', label: 'Najít', required: true },
      { type: 'text', name: 'replace', label: 'Nahradit čím' },
      { type: 'checkbox', name: 'matchCase', label: 'Rozlišovat velikost písmen' },
    ],
    submitLabel: 'Nahradit vše',
  });

  if (!data) return;

  const needle = String(data.find ?? '');
  const replacement = String(data.replace ?? '');
  const matches = findMatches(editor.root, needle, Boolean(data.matchCase));

  if (matches.length === 0) {
    editor.ui.notify('Nic nenalezeno.', 'warn');
    return;
  }

  // Odzadu, aby si nahrazení navzájem neposouvala pozice.
  for (const [text, at] of matches.reverse()) {
    text.replaceData(at, needle.length, replacement);
  }

  editor.commit('replace');
  editor.ui.notify('Nahrazeno: ' + matches.length + '×');
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
