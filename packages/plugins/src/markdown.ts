import type { Editor, Plugin } from '@nibble/core';
import { closestBlock, closestQuote, fillIfEmpty, isEmptyBlock, textBeforeCaret } from '@nibble/core';

/**
 * Markdown zkratky při psaní.
 *
 * Napsané `## ` udělá z odstavce nadpis, `**slovo**` tučné slovo. Převádí se
 * až ve chvíli, kdy je vzor celý — dokud uživatel píše, editor mu pod rukama
 * nic nemění. A první Ctrl+Z převod vrátí: kdo chtěl opravdu napsat `# `,
 * nemá s editorem bojovat.
 */

export type BlockShortcut =
  | { kind: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6 }
  | { kind: 'bullist' }
  | { kind: 'numlist'; start: number }
  | { kind: 'quote' }
  | { kind: 'task'; checked: boolean };

/** Rozpozná blokovou zkratku. Text musí být **celý** začátek bloku včetně mezery. */
export function matchBlockShortcut(textBefore: string): BlockShortcut | null {
  let m = /^(#{1,6}) $/.exec(textBefore);
  if (m) return { kind: 'heading', level: m[1]!.length as 1 | 2 | 3 | 4 | 5 | 6 };
  if (/^[-*] $/.test(textBefore)) return { kind: 'bullist' };
  m = /^(\d{1,9})\. $/.exec(textBefore);
  if (m) return { kind: 'numlist', start: Number(m[1]) };
  if (textBefore === '> ') return { kind: 'quote' };
  m = /^\[([ xX])\] $/.exec(textBefore);
  if (m) return { kind: 'task', checked: m[1] !== ' ' };
  return null;
}

/** Zkratky potvrzované Enterem. Celý text bloku musí být přesně vzor. */
export function matchEnterShortcut(blockText: string): 'hr' | 'pre' | null {
  if (blockText === '---') return 'hr';
  if (blockText === '```') return 'pre';
  return null;
}

export interface InlineShortcut {
  tag: 'strong' | 'em' | 'code' | 's';
  /** Kde v textu začíná otevírací značka. */
  start: number;
  inner: string;
}

/**
 * Vzory pro řádkové zkratky. Pořadí je důležité: `**` se zkouší před `*`,
 * jinak by `**a**` skončilo jako kurzíva s hvězdičkami.
 *
 * Obsah nesmí začínat ani končit mezerou — `2 * 3 * 4` je násobení, ne
 * kurzíva. A otevírací `*` a `_` nesmí stát uprostřed slova, jinak by se
 * `snake_case_` převedlo hned po napsání podtržítka.
 */
const INLINE: ReadonlyArray<[RegExp, InlineShortcut['tag'], number]> = [
  [/(^|[^*])\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/, 'strong', 2],
  [/(^|[^~])~~([^~\s](?:[^~]*[^~\s])?)~~$/, 's', 2],
  [/(^|[^`])`([^`\s](?:[^`]*[^`\s])?)`$/, 'code', 1],
  // `\p{L}`, ne `\w`: `\w` zná jen ASCII, takže `proměnná_délka_` by
  // kurzívu spustilo hned za „á“.
  [/(^|[^*\p{L}\p{N}_])\*([^*\s](?:[^*]*[^*\s])?)\*$/u, 'em', 1],
  [/(^|[^_\p{L}\p{N}])_([^_\s](?:[^_]*[^_\s])?)_$/u, 'em', 1],
];

export function matchInlineShortcut(textBefore: string): InlineShortcut | null {
  for (const [pattern, tag] of INLINE) {
    const m = pattern.exec(textBefore);
    if (!m) continue;
    return { tag, start: m.index + m[1]!.length, inner: m[2]! };
  }
  return null;
}

/** Kde se zkratky nespouštějí: kód, odkaz, předformátovaný text. */
function insideLiteral(node: Node, root: Element): boolean {
  for (let cur: Node | null = node; cur && cur !== root; cur = cur.parentNode) {
    if (cur.nodeType === 1 && ['pre', 'code', 'a'].includes((cur as Element).tagName.toLowerCase())) return true;
  }
  return false;
}

/** Bloky, ve kterých má bloková zkratka smysl — obyčejný odstavec. */
function convertible(block: Element): boolean {
  const tag = block.tagName.toLowerCase();
  return tag === 'p' || tag === 'div';
}

/** Leží uzel uvnitř prvku s daným tagem, v mezích kořene? */
function within(node: Node, root: Element, tag: string): boolean {
  for (let cur: Node | null = node; cur && cur !== root; cur = cur.parentNode) {
    if (cur.nodeType === 1 && (cur as Element).tagName.toLowerCase() === tag) return true;
  }
  return false;
}

/**
 * Je blok už ve formátu, do kterého by zkratka převáděla?
 *
 * Příkazy jádra jsou přepínače: `blockquote` v citaci citaci zruší, `bullist`
 * v odrážkách seznam rozpustí a `numlist` z nich udělá číslovaný. Kdo v citaci
 * napíše `> `, chce ten znak, ne přijít o citaci — zkratka tu proto mlčí.
 * Seznam v citaci je ale jiný formát, ten projde.
 */
function alreadyIn(block: Element, root: Element, rule: BlockShortcut): boolean {
  switch (rule.kind) {
    case 'heading': return within(block, root, 'h' + rule.level);
    case 'quote': return closestQuote(block, root) !== null;
    case 'bullist':
    case 'numlist':
    case 'task': return within(block, root, 'li');
  }
}

/** Smaže začátek bloku po kurzor a postaví kurzor na začátek bloku. */
function dropPrefix(editor: Editor, block: Element, range: Range): void {
  const prefix = editor.document.createRange();
  prefix.setStart(block, 0);
  prefix.setEnd(range.startContainer, range.startOffset);
  prefix.deleteContents();
  if (isEmptyBlock(block)) fillIfEmpty(block, editor.document);
  editor.selection.collapseTo(block, 0);
}

/**
 * Úprava jako jeden krok historie.
 *
 * Příkazy jádra si commitují samy; v `transact` se jejich zápis zahodí
 * a uloží se jen výsledek celé zkratky.
 */
function asOneStep(editor: Editor, fn: () => void): void {
  editor.history.transact(fn);
  editor.commit('markdown');
}

function applyBlock(editor: Editor, block: Element, range: Range, rule: BlockShortcut): boolean {
  switch (rule.kind) {
    case 'heading':
      asOneStep(editor, () => { dropPrefix(editor, block, range); editor.exec('formatBlock', 'h' + rule.level); });
      return true;
    case 'bullist':
      asOneStep(editor, () => { dropPrefix(editor, block, range); editor.exec('bullist'); });
      return true;
    case 'numlist':
      asOneStep(editor, () => {
        dropPrefix(editor, block, range);
        editor.exec('numlist');
        if (rule.start !== 1) {
          const at = editor.selection.getRange()?.startContainer ?? null;
          const list = at && (at.nodeType === 1 ? at as Element : at.parentElement)?.closest('ol');
          list?.setAttribute('start', String(rule.start));
        }
      });
      return true;
    case 'quote':
      asOneStep(editor, () => { dropPrefix(editor, block, range); editor.exec('blockquote'); });
      return true;
    case 'task':
      // Bez pluginu úkolů zůstane `[ ] ` textem.
      if (!editor.can('tasklist')) return false;
      asOneStep(editor, () => {
        dropPrefix(editor, block, range);
        editor.exec('tasklist');
        if (rule.checked) {
          const at = editor.selection.getRange()?.startContainer ?? null;
          const li = at && (at.nodeType === 1 ? at as Element : at.parentElement)?.closest('li');
          li?.setAttribute('data-checked', 'true');
        }
      });
      return true;
  }
}

function applyInline(editor: Editor, text: Text, offset: number, rule: InlineShortcut): void {
  const doc = editor.document;
  const tail = text.splitText(offset);
  const marked = text.splitText(rule.start);

  const wrapper = doc.createElement(rule.tag);
  wrapper.textContent = rule.inner;
  marked.parentNode!.replaceChild(wrapper, marked);

  // Kurzor za značku, ne do ní — další psaní už tučné být nemá.
  editor.selection.collapseTo(tail, 0);
}

export const markdownShortcuts: Plugin = {
  name: 'markdown',

  setup(editor) {
    const afterInput = (data: string): void => {
      if (editor.composing || editor.mode !== 'design') return;
      const range = editor.selection.getRange();
      if (!range || !range.collapsed || range.startContainer.nodeType !== 3) return;

      const text = range.startContainer as Text;
      if (insideLiteral(text, editor.root)) return;

      const block = closestBlock(text, editor.root);
      if (!block) return;

      if (data === ' ' && convertible(block)) {
        const rule = matchBlockShortcut(textBeforeCaret(block, range));
        if (rule && !alreadyIn(block, editor.root, rule) && applyBlock(editor, block, range, rule)) return;
      }

      const inline = matchInlineShortcut(text.data.slice(0, range.startOffset));
      if (inline) asOneStep(editor, () => applyInline(editor, text, range.startOffset, inline));
    };

    // `input` přijde těsně před zápisem napsaného znaku do historie. Odložením
    // do mikroúlohy se zkratka zapíše až po něm — a Ctrl+Z ji vrátí samostatně.
    const offInput = editor.on('input', (payload: { data: string }) => {
      const data = payload.data;
      queueMicrotask(() => afterInput(data));
    });

    const onKeyDown = (event: Event): void => {
      const e = event as KeyboardEvent;
      // Enter s modifikátorem patří jiným zkratkám a `defaultPrevented` znamená,
      // že ho už zpracoval někdo dřív (třeba nabídka u kurzoru).
      if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing || editor.mode !== 'design') return;
      if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;

      const range = editor.selection.getRange();
      if (!range || !range.collapsed) return;
      const block = closestBlock(range.startContainer, editor.root);
      if (!block || !convertible(block) || insideLiteral(range.startContainer, editor.root)) return;

      const rule = matchEnterShortcut(block.textContent ?? '');
      if (!rule) return;

      e.preventDefault();
      asOneStep(editor, () => {
        dropPrefix(editor, block, range);
        if (rule === 'pre') { editor.exec('formatBlock', 'pre'); return; }
        // Čára se vloží před vyprázdněný blok a ten zůstane jako nový odstavec
        // pod ní. Příkaz `hr` se na to nehodí: v prázdném bloku dá čáru *za* něj
        // a kurzor pošle do následujícího bloku, takže by se psalo do cizího
        // odstavce místo do nového.
        block.parentNode!.insertBefore(editor.document.createElement('hr'), block);
        editor.selection.collapseTo(block, 0);
      });
    };

    editor.root.addEventListener('keydown', onKeyDown);
    return () => { offInput(); editor.root.removeEventListener('keydown', onKeyDown); };
  },
};
