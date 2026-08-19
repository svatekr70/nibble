import type { Editor } from '../Editor.js';
import { textToHtml } from '../input/Paste.js';

/**
 * Schránka z nabídky.
 *
 * Prohlížeč tyhle věci hlídá a právem: stránka, která si může beze slova
 * přečíst schránku, je bezpečnostní díra. Vyjmutí a kopírování projdou, protože
 * jsou to úmyslné akce nad vlastním výběrem. Vložení potřebuje svolení, a když
 * ho uživatel nedá, editor to řekne nahlas místo aby se tvářil, že se nic
 * nestalo — klávesová zkratka funguje vždycky.
 */

async function readClipboard(editor: Editor): Promise<{ html: string; text: string } | null> {
  const clipboard = editor.document.defaultView?.navigator?.clipboard;
  if (!clipboard) return null;

  try {
    if (typeof clipboard.read === 'function') {
      const items = await clipboard.read();
      let html = '';
      let text = '';

      for (const item of items) {
        if (item.types.includes('text/html')) html = await (await item.getType('text/html')).text();
        if (item.types.includes('text/plain')) text = await (await item.getType('text/plain')).text();
      }
      if (html || text) return { html, text };
    }

    const plain = await clipboard.readText();
    return { html: '', text: plain };
  } catch {
    return null;
  }
}

export function registerClipboardCommands(editor: Editor): void {
  const { commands } = editor;
  const hasSelection = (ed: Editor): boolean => {
    const range = ed.selection.getRange();
    return !!range && !range.collapsed;
  };

  commands.add('selectall', (ed) => {
    const range = ed.document.createRange();
    range.selectNodeContents(ed.root);
    ed.selection.setRange(range);
    ed.focus();
    return true;
  });

  // `execCommand` je jinde zavržené, ale pro vyjmutí a kopírování je to pořád
  // jediná cesta, která funguje všude bez ptaní na svolení.
  commands.add('copy', (ed) => ed.document.execCommand('copy'), hasSelection);

  commands.add('cut', (ed) => {
    const ok = ed.document.execCommand('cut');
    if (ok) ed.commit('cut');
    return ok;
  }, hasSelection);

  const pasteFromClipboard = async (ed: Editor, asText: boolean): Promise<void> => {
    const data = await readClipboard(ed);

    if (!data) {
      ed.ui.notify(
        'Vložení z nabídky prohlížeč nepovolil. Použijte '
        + (asText ? 'Ctrl+Shift+V' : 'Ctrl+V') + '.', 'warn');
      return;
    }

    ed.focus();
    if (asText || !data.html) ed.insertHTML(textToHtml(data.text));
    else { ed.pastePlainNext = false; ed.insertHTML(data.html); }
  };

  commands.add('paste', (ed) => { void pasteFromClipboard(ed, false); return true; });
  commands.add('pastetext', (ed) => { void pasteFromClipboard(ed, true); return true; });
}
