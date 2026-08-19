import type { Editor } from '../Editor.js';
import { handleTab } from '../commands/lists.js';

/**
 * Překlad vstupu na příkazy.
 *
 * Prohlížeč obsah nemění nikdy sám: u typů vstupu, které Nibble umí, se událost
 * zruší a provede se vlastní příkaz. To je jediný způsob, jak dostat ve všech
 * prohlížečích stejný markup — `document.execCommand` dává v každém jiný.
 */

const HANDLED: Record<string, string> = {
  insertText: 'insertText',
  insertParagraph: 'insertParagraph',
  insertLineBreak: 'insertLineBreak',
  deleteContentBackward: 'deleteBackward',
  deleteContentForward: 'deleteForward',
  historyUndo: 'undo',
  historyRedo: 'redo',
  formatBold: 'bold',
  formatItalic: 'italic',
  formatUnderline: 'underline',
  formatStrikeThrough: 'strike',
};

export function bindInput(editor: Editor): () => void {
  const root = editor.root;

  const onBeforeInput = (event: Event): void => {
    const e = event as InputEvent;
    if (editor.mode !== 'design') { e.preventDefault(); return; }

    // Během psaní s IME se do DOMu sahat nesmí; srovná se to na compositionend.
    if (editor.composing) return;

    const command = HANDLED[e.inputType];
    if (!command) {
      // Zatím neošetřený typ vstupu (vkládání, drag&drop). Prohlížeč ho provede
      // sám a Nibble si po něm jen srovná stav — pořádnou obsluhu dostane ve F4.
      editor.scheduleForeignInput();
      return;
    }

    e.preventDefault();
    editor.exec(command, e.inputType === 'insertText' ? e.data ?? '' : undefined);
  };

  const onCompositionStart = (): void => { editor.composing = true; };
  const onCompositionEnd = (): void => {
    editor.composing = false;
    editor.scheduleForeignInput();
  };

  const onKeyDown = (event: Event): void => {
    const e = event as KeyboardEvent;

    // Tab patří seznamu jen uvnitř seznamu. Jinde ho necháme fokusu, aby se
    // dalo z editoru vytabovat ven — jinak by v něm uživatel klávesnice uvízl.
    if (e.key === 'Tab' && editor.mode === 'design') {
      if (handleTab(editor, e.shiftKey)) e.preventDefault();
      return;
    }

    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;

    const key = e.key.toLowerCase();
    const map: Record<string, string> = { b: 'bold', i: 'italic', u: 'underline' };

    if (key === 'z') {
      e.preventDefault();
      editor.exec(e.shiftKey ? 'redo' : 'undo');
      return;
    }
    if (key === 'y') { e.preventDefault(); editor.exec('redo'); return; }

    const command = map[key];
    if (command) { e.preventDefault(); editor.exec(command); }
  };

  root.addEventListener('beforeinput', onBeforeInput);
  root.addEventListener('compositionstart', onCompositionStart);
  root.addEventListener('compositionend', onCompositionEnd);
  root.addEventListener('keydown', onKeyDown);

  return () => {
    root.removeEventListener('beforeinput', onBeforeInput);
    root.removeEventListener('compositionstart', onCompositionStart);
    root.removeEventListener('compositionend', onCompositionEnd);
    root.removeEventListener('keydown', onKeyDown);
  };
}
