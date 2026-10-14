import type { Editor, Plugin } from '@nibble/core';
import { blocksInRange, closestBlock, fillIfEmpty, textBeforeCaret } from '@nibble/core';

/**
 * Rozbalovací blok `<details>`.
 *
 * V editoru je obsah vidět vždycky (CSS `::details-content`) a klik na nadpis
 * blok nesbaluje. Sbalení by měnilo atribut `open`, tedy HTML, a to jen
 * proto, že si uživatel klikl. Jestli bude blok na webu rozbalený, se
 * rozhoduje vědomě, tlačítkem v kontextové liště.
 */

export function closestDetails(node: Node | null, root: Element): HTMLDetailsElement | null {
  for (let cur = node; cur && cur !== root; cur = cur.parentNode) {
    if (cur.nodeType === 1 && (cur as Element).tagName.toLowerCase() === 'details') return cur as HTMLDetailsElement;
  }
  return null;
}

function closestSummary(node: Node | null, root: Element): Element | null {
  for (let cur = node; cur && cur !== root; cur = cur.parentNode) {
    if (cur.nodeType === 1 && (cur as Element).tagName.toLowerCase() === 'summary') return cur as Element;
  }
  return null;
}

export function wrapInDetails(doc: Document, blocks: Element[], title: string): HTMLDetailsElement {
  const details = doc.createElement('details');
  const summary = doc.createElement('summary');
  summary.textContent = title;
  details.appendChild(summary);

  const first = blocks[0];
  first?.parentNode?.insertBefore(details, first);
  for (const block of blocks) details.appendChild(block);
  return details;
}

export function unwrapDetails(details: Element): Node | null {
  const doc = details.ownerDocument;
  const parent = details.parentNode;
  if (!parent) return null;

  let first: Node | null = null;
  for (const child of Array.from(details.childNodes)) {
    let node: Node = child;
    if (child.nodeType === 1 && (child as Element).tagName.toLowerCase() === 'summary') {
      const p = doc.createElement('p');
      while (child.firstChild) p.appendChild(child.firstChild);
      fillIfEmpty(p, doc);
      node = p;
    }
    parent.insertBefore(node, details);
    first ??= node;
  }
  details.remove();
  return first;
}

/** Bloky nejvyšší úrovně v rámci rodiče, kterých se výběr dotýká. */
function topLevelBlocks(editor: Editor, range: Range): Element[] {
  const blocks = blocksInRange(range, editor.root);
  const start = blocks[0] ?? closestBlock(range.startContainer, editor.root);
  if (!start) return [];
  const parent = start.parentNode;
  return (blocks.length ? blocks : [start]).filter((b) => b.parentNode === parent);
}

export const details: Plugin = {
  name: 'details',

  setup(editor) {
    editor.commands.add('details', (ed) => {
      const range = ed.selection.getRange();
      if (!range) return false;

      const doc = ed.document;
      let blocks = range.collapsed ? [] : topLevelBlocks(ed, range);
      if (blocks.length === 0) {
        // Bez výběru vznikne nový blok za odstavcem pod kurzorem.
        const p = doc.createElement('p');
        fillIfEmpty(p, doc);
        const current = closestBlock(range.startContainer, ed.root);
        if (current?.parentNode) current.parentNode.insertBefore(p, current.nextSibling);
        else ed.root.appendChild(p);
        blocks = [p];
      }

      const d = wrapInDetails(doc, blocks, 'Nadpis');
      const title = d.querySelector('summary')!;
      const select = doc.createRange();
      select.selectNodeContents(title);
      ed.selection.setRange(select);
      ed.commit('details');
      return true;
    });

    editor.commands.add('detailsopen', (ed) => {
      const d = closestDetails(ed.selection.getRange()?.startContainer ?? null, ed.root);
      if (!d) return false;
      d.toggleAttribute('open');
      ed.commit('details');
      return true;
    }, (ed) => closestDetails(ed.selection.getRange()?.startContainer ?? null, ed.root) !== null);

    editor.commands.add('undetails', (ed) => {
      const d = closestDetails(ed.selection.getRange()?.startContainer ?? null, ed.root);
      if (!d) return false;
      const first = unwrapDetails(d);
      if (first) ed.selection.collapseTo(first, 0);
      ed.commit('details');
      return true;
    }, (ed) => closestDetails(ed.selection.getRange()?.startContainer ?? null, ed.root) !== null);

    editor.ui.addButton('details', {
      icon: 'details', tooltip: 'Rozbalovací blok',
      onAction: (ed) => { ed.focus(); ed.exec('details'); },
    });
    editor.ui.addButton('detailsopen', {
      icon: 'detailsopen', tooltip: 'Rozbalený na webu',
      active: (ed) => !!closestDetails(ed.selection.getRange()?.startContainer ?? null, ed.root)?.hasAttribute('open'),
      onAction: (ed) => { ed.focus(); ed.exec('detailsopen'); },
    });
    editor.ui.addButton('undetails', {
      icon: 'trash', tooltip: 'Zrušit blok',
      onAction: (ed) => { ed.focus(); ed.exec('undetails'); },
    });

    editor.ui.addContextToolbar('details', {
      match: (node, ed) => closestDetails(node, ed.root),
      items: ['detailsopen', 'undetails'],
      priority: 5,
    });

    // Klik na nadpis blok v editoru nesbalí — viz komentář nahoře.
    const onClick = (event: Event): void => {
      if (closestSummary(event.target as Node, editor.root)) event.preventDefault();
    };

    const onKeyDown = (event: Event): void => {
      const e = event as KeyboardEvent;
      if (editor.mode !== 'design' || e.isComposing) return;
      const range = editor.selection.getRange();
      if (!range || !range.collapsed) return;

      const summary = closestSummary(range.startContainer, editor.root);

      // Enter v nadpisu skočí do obsahu, nový nadpis nevzniká.
      if (e.key === 'Enter' && summary) {
        e.preventDefault();
        let body = summary.nextElementSibling;
        if (!body) {
          body = editor.document.createElement('p');
          fillIfEmpty(body, editor.document);
          summary.parentNode!.appendChild(body);
          editor.selection.collapseTo(body, 0);
          editor.commit('details');
          return;
        }
        editor.selection.collapseTo(body, 0);
        return;
      }

      if (e.key !== 'Backspace') return;

      // Backspace na začátku nadpisu by ho slil s blokem nad ním a na začátku
      // obsahu by obsah vlil do nadpisu. Ani jedno uživatel nečeká.
      if (summary && textBeforeCaret(summary, range) === '') { e.preventDefault(); return; }

      const block = closestBlock(range.startContainer, editor.root);
      const prev = block?.previousElementSibling;
      if (block && prev?.tagName.toLowerCase() === 'summary' && textBeforeCaret(block, range) === '') {
        e.preventDefault();
      }
    };

    editor.root.addEventListener('click', onClick);
    editor.root.addEventListener('keydown', onKeyDown);
    return () => {
      editor.root.removeEventListener('click', onClick);
      editor.root.removeEventListener('keydown', onKeyDown);
    };
  },
};
