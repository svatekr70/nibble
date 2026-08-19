import type { Editor, Plugin } from '@nibble/core';

/**
 * Odkazy.
 *
 * URL se nepřepisuje. TinyMCE z absolutní adresy udělá relativní vůči stránce,
 * kde se edituje, a v cílovém projektu se to muselo obcházet vlastním skriptem, protože
 * takový odkaz v odeslaném e-mailu nikam nevede. Ukládá se to, co uživatel zadal.
 */

const UNSAFE = /^\s*(javascript|vbscript|data:text\/html)/i;

function closestLink(node: Node | null, root: Element): HTMLAnchorElement | null {
  let cur: Node | null = node;
  while (cur && cur !== root) {
    if (cur.nodeType === 1 && (cur as Element).tagName.toLowerCase() === 'a') {
      return cur as HTMLAnchorElement;
    }
    cur = cur.parentNode;
  }
  return null;
}

/** Rozšíří rozsah na celý odkaz, aby se úprava týkala jeho celého textu. */
function selectLink(editor: Editor, link: Element): void {
  const range = editor.document.createRange();
  range.selectNodeContents(link);
  editor.selection.setRange(range);
}

function stripLinks(fragment: Node): void {
  const root = fragment as Element;
  for (const el of Array.from(root.querySelectorAll?.('a') ?? [])) {
    const parent = el.parentNode;
    if (!parent) continue;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  }
}

interface LinkData {
  href: string;
  text?: string;
  title?: string;
  target?: string;
}

function applyLink(editor: Editor, data: LinkData): boolean {
  const href = String(data.href ?? '').trim();
  if (!href || UNSAFE.test(href)) return false;

  const doc = editor.document;
  const range = editor.selection.getRange();
  if (!range) return false;

  const decorate = (anchor: HTMLAnchorElement): void => {
    anchor.setAttribute('href', href);
    if (data.title) anchor.setAttribute('title', data.title); else anchor.removeAttribute('title');
    if (data.target) {
      anchor.setAttribute('target', data.target);
      // Bez rel by nová karta dostala přístup k původnímu oknu přes window.opener.
      anchor.setAttribute('rel', 'noopener');
    } else {
      anchor.removeAttribute('target');
      anchor.removeAttribute('rel');
    }
  };

  const existing = closestLink(range.startContainer, editor.root);
  if (existing) {
    decorate(existing);
    if (data.text && data.text !== existing.textContent) existing.textContent = data.text;
    selectLink(editor, existing);
    editor.commit('link');
    return true;
  }

  if (range.collapsed) {
    const anchor = doc.createElement('a');
    decorate(anchor);
    anchor.textContent = data.text || href;
    range.insertNode(anchor);
    selectLink(editor, anchor);
    editor.commit('link');
    return true;
  }

  const frag = range.extractContents();
  stripLinks(frag);

  const anchor = doc.createElement('a');
  decorate(anchor);
  anchor.appendChild(frag);
  if (data.text && data.text !== anchor.textContent) anchor.textContent = data.text;

  range.insertNode(anchor);
  selectLink(editor, anchor);
  editor.commit('link');
  return true;
}

async function openLinkDialog(editor: Editor): Promise<void> {
  const range = editor.selection.getRange();
  const existing = range ? closestLink(range.startContainer, editor.root) : null;
  const selected = editor.selection.getText();

  const data = await editor.ui.dialog({
    title: existing ? 'Upravit odkaz' : 'Vložit odkaz',
    fields: [
      { type: 'url', name: 'href', label: 'Adresa', required: true, placeholder: 'https://' },
      { type: 'text', name: 'text', label: 'Text odkazu' },
      { type: 'text', name: 'title', label: 'Popisek při najetí' },
      { type: 'select', name: 'target', label: 'Otevřít', options: [
        { value: '', text: 'Ve stejném okně' },
        { value: '_blank', text: 'V novém okně' },
      ] },
    ],
    initial: {
      href: existing?.getAttribute('href') ?? '',
      text: existing?.textContent ?? selected,
      title: existing?.getAttribute('title') ?? '',
      target: existing?.getAttribute('target') ?? '',
    },
    submitLabel: existing ? 'Uložit' : 'Vložit',
  });

  if (data) editor.exec('link', data);
}

export const link: Plugin = {
  name: 'link',

  setup(editor) {
    editor.commands.add('link', (ed, args) => applyLink(ed, (args ?? {}) as LinkData));

    editor.commands.add('unlink', (ed) => {
      const range = ed.selection.getRange();
      if (!range) return false;

      const existing = closestLink(range.startContainer, ed.root);
      if (!existing) return false;

      const parent = existing.parentNode;
      if (!parent) return false;

      const first = existing.firstChild;
      while (existing.firstChild) parent.insertBefore(existing.firstChild, existing);
      parent.removeChild(existing);
      if (first) ed.selection.collapseTo(first, 0);

      ed.commit('unlink');
      return true;
    }, (ed) => {
      const range = ed.selection.getRange();
      return !!range && closestLink(range.startContainer, ed.root) !== null;
    });

    editor.commands.add('openlink', (ed) => {
      const range = ed.selection.getRange();
      const existing = range ? closestLink(range.startContainer, ed.root) : null;
      const href = existing?.getAttribute('href');
      if (!href) return false;
      ed.document.defaultView?.open(href, '_blank', 'noopener');
      return true;
    });

    editor.ui.addButton('link', {
      icon: 'link', tooltip: 'Odkaz', shortcut: 'Ctrl+K',
      active: (ed) => {
        const range = ed.selection.getRange();
        return !!range && closestLink(range.startContainer, ed.root) !== null;
      },
      onAction: (ed) => { void openLinkDialog(ed); },
    });

    editor.ui.addButton('unlink', {
      icon: 'unlink', tooltip: 'Zrušit odkaz',
      enabled: (ed) => ed.can('unlink'),
      onAction: (ed) => { ed.focus(); ed.exec('unlink'); },
    });

    editor.ui.addButton('openlink', {
      icon: 'openlink', tooltip: 'Otevřít odkaz',
      onAction: (ed) => { ed.exec('openlink'); },
    });

    editor.ui.addContextToolbar('link', {
      match: (node, ed) => closestLink(node, ed.root),
      items: ['link', 'openlink', 'unlink'],
      priority: 10,
    });

    const onKeyDown = (event: Event): void => {
      const e = event as KeyboardEvent;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        void openLinkDialog(editor);
      }
    };
    editor.root.addEventListener('keydown', onKeyDown);

    return () => editor.root.removeEventListener('keydown', onKeyDown);
  },
};

export { closestLink };
