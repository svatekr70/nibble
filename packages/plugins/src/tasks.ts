import type { Editor, Plugin } from '@nibble/core';
import { closestListItem, listOf } from '@nibble/core';

/**
 * Seznam úkolů.
 *
 * Formát je TipTapův — `data-type="taskList"` a `data-checked` — aby se úkoly
 * zkopírované z aplikací na TipTapu poznaly samy. Zaškrtávátko je jen CSS:
 * `<input>` v `contenteditable` dělá kolem sebe s kurzorem neplechu a na webu
 * by stejně potřeboval vlastní pravidla.
 */

const TYPE = 'data-type';
const CHECKED = 'data-checked';

export function isTaskList(list: Element | null): boolean {
  return !!list && list.getAttribute(TYPE) === 'taskList';
}

export function isTaskItem(node: Node | null): node is Element {
  return !!node && node.nodeType === 1 && (node as Element).getAttribute(TYPE) === 'taskItem';
}

/** Přímé položky seznamu — vnořené seznamy mají vlastní druh. */
function items(list: Element): Element[] {
  return Array.from(list.children).filter((c) => c.tagName.toLowerCase() === 'li');
}

export function toTaskList(list: Element): void {
  list.setAttribute(TYPE, 'taskList');
  for (const li of items(list)) {
    li.setAttribute(TYPE, 'taskItem');
    if (li.getAttribute(CHECKED) !== 'true') li.setAttribute(CHECKED, 'false');
  }
}

export function fromTaskList(list: Element): void {
  list.removeAttribute(TYPE);
  for (const li of items(list)) {
    li.removeAttribute(TYPE);
    li.removeAttribute(CHECKED);
  }
}

export function setTaskChecked(li: Element, checked: boolean): void {
  li.setAttribute(CHECKED, checked ? 'true' : 'false');
}

function listAtCaret(editor: Editor): Element | null {
  const range = editor.selection.getRange();
  const li = range ? closestListItem(range.startContainer, editor.root) : null;
  return li ? listOf(li) : null;
}

/** Šířka oblasti zaškrtávátka — levé odsazení položky, kam ho kreslí CSS. */
function inCheckbox(li: Element, clientX: number): boolean {
  const box = li.getBoundingClientRect();
  const pad = parseFloat(li.ownerDocument.defaultView!.getComputedStyle(li).paddingLeft) || 0;
  return clientX >= box.left && clientX < box.left + pad;
}

export const tasks: Plugin = {
  name: 'tasks',

  setup(editor) {
    editor.commands.add('tasklist', (ed) => {
      const current = listAtCaret(ed);
      if (isTaskList(current)) {
        fromTaskList(current!);
        ed.commit('task');
        return true;
      }

      // Z čehokoli jiného nejdřív odrážky — přes příkaz jádra, který umí
      // výběr přes více odstavců i převod z číslování. Jeho zápis do historie
      // se zahodí: celý převod je jeden krok. Druh seznamu jde do jádra hned,
      // jinak by se nový seznam slil s obyčejnými odrážkami před ním.
      ed.history.transact(() => {
        if (current?.tagName.toLowerCase() !== 'ul') ed.exec('bullist', { type: 'taskList' });
      });

      const list = listAtCaret(ed);
      if (!list) return false;
      toTaskList(list);
      ed.commit('task');
      return true;
    });

    editor.ui.addButton('tasklist', {
      icon: 'tasklist', tooltip: 'Úkoly',
      active: (ed) => isTaskList(listAtCaret(ed)),
      onAction: (ed) => { ed.focus(); ed.exec('tasklist'); },
    });

    const offSplit = editor.on('itemsplit', (payload: never) => {
      const { from, to } = payload as { from: Element; to: Element };
      if (isTaskItem(from)) setTaskChecked(to, false);
    });

    // Číslovaný seznam úkolů formát nezná — kdo z úkolů dělá číslování,
    // chce obyčejný číslovaný seznam, ne `<ol data-type="taskList">`.
    const offRetag = editor.on('listretag', (payload: never) => {
      const { list, tag } = payload as { list: Element; tag: string };
      if (tag === 'ol' && isTaskList(list)) fromTaskList(list);
    });

    /**
     * Klik do zaškrtávátka.
     *
     * `mousedown` a `preventDefault`: kurzor se nemá přesunout na začátek
     * položky — uživatel odškrtává, ne edituje.
     */
    const onMouseDown = (event: Event): void => {
      const e = event as MouseEvent;
      if (editor.mode !== 'design' || e.button !== 0) return;

      const li = (e.target as Element | null)?.closest?.('li');
      if (!li || !editor.root.contains(li) || !isTaskItem(li) || !inCheckbox(li, e.clientX)) return;

      e.preventDefault();
      setTaskChecked(li, li.getAttribute(CHECKED) !== 'true');
      editor.commit('task');
    };

    editor.root.addEventListener('mousedown', onMouseDown);
    return () => { offSplit(); offRetag(); editor.root.removeEventListener('mousedown', onMouseDown); };
  },
};
